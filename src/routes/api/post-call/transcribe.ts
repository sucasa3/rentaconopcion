/**
 * POST /api/post-call/transcribe — transcribe a short post-call voice note.
 *
 * Authenticated app endpoint (NOT /api/public): the caller's Supabase bearer
 * token is verified before anything is forwarded. Audio is streamed to the
 * gateway transcription model and discarded — only the transcript text is
 * returned and later saved (verbatim, never translated) with the note.
 *
 * Language is auto-detected; English, Spanish and mixed audio are supported.
 */
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

const TRANSCRIPTIONS_URL = "https://ai.gateway.lovable.dev/v1/audio/transcriptions";
const MODEL = "google/gemini-3.5-transcribe";
/** Practical cap: ~2 min of mobile webm audio stays far under this. */
const MAX_AUDIO_BYTES = 14 * 1024 * 1024;

async function authenticate(request: Request): Promise<string | null> {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  const supabase = createClient(
    process.env["SUPABASE_URL"]!,
    process.env["SUPABASE_PUBLISHABLE_KEY"]!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    },
  );
  const { data, error } = await supabase.auth.getClaims(token);
  if (error || !data?.claims?.sub) return null;
  return data.claims.sub as string;
}

/** Accumulate transcript deltas from the gateway SSE stream. */
async function readTranscriptionStream(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) throw new Error("Transcription response had no body.");
  const decoder = new TextDecoder();
  let buffer = "";
  let transcript = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf("\n\n")) >= 0) {
      const rawEvent = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const data = rawEvent
        .split("\n")
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).trim())
        .join("\n");
      if (!data || data === "[DONE]") continue;
      try {
        const ev = JSON.parse(data);
        if (ev.type === "transcript.text.delta" && typeof ev.delta === "string") {
          transcript += ev.delta;
        } else if (ev.type === "transcript.text.done" && typeof ev.text === "string") {
          transcript = ev.text;
        }
      } catch {
        /* keep accumulating */
      }
    }
  }
  return transcript.trim();
}

export const Route = createFileRoute("/api/post-call/transcribe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const userId = await authenticate(request);
        if (!userId) return new Response("Unauthorized", { status: 401 });

        const apiKey = process.env["LOVABLE_API_KEY"];
        if (!apiKey) {
          return Response.json({ error: "Missing LOVABLE_API_KEY" }, { status: 500 });
        }

        const declared = Number(request.headers.get("content-length") ?? 0);
        if (declared > MAX_AUDIO_BYTES) {
          return Response.json({ error: "Recording too large" }, { status: 413 });
        }

        let formData: FormData;
        try {
          formData = await request.formData();
        } catch {
          return Response.json({ error: "Invalid upload" }, { status: 400 });
        }
        const file = formData.get("file");
        if (!(file instanceof File) || file.size === 0) {
          return Response.json({ error: "Missing audio file" }, { status: 400 });
        }
        if (file.size > MAX_AUDIO_BYTES) {
          return Response.json({ error: "Recording too large" }, { status: 413 });
        }

        const upstream = new FormData();
        upstream.append("file", file, file.name || "note.webm");
        upstream.append("model", MODEL);
        upstream.append("stream", "true");
        upstream.append("response_format", "json");

        const upstreamRes = await fetch(TRANSCRIPTIONS_URL, {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}` },
          body: upstream,
        });

        if (!upstreamRes.ok) {
          const body = await upstreamRes.text();
          console.error(`[post-call] transcription failed [${upstreamRes.status}]: ${body}`);
          // Pass terminal statuses through; only 429/5xx are worth retrying.
          const status = upstreamRes.status === 429 || upstreamRes.status >= 500
            ? upstreamRes.status
            : 422;
          return Response.json(
            { error: "Transcription failed. Try again or type the note." },
            { status },
          );
        }

        try {
          const transcript = await readTranscriptionStream(upstreamRes);
          if (!transcript) {
            return Response.json(
              { error: "No speech detected. Try again or type the note." },
              { status: 422 },
            );
          }
          return Response.json({ transcript });
        } catch (err) {
          console.error("[post-call] transcription stream error:", err);
          return Response.json(
            { error: "Transcription failed. Try again or type the note." },
            { status: 502 },
          );
        }
      },
    },
  },
});

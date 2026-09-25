import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Audience = z.enum(["agent", "lender"]);

/** Read only. Returns only the evidence types permitted for this relationship. */
export const getSignalHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ audience: Audience, clientId: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { signalHistoryFor } = await import("@/lib/signal-history.server");
    const map = await signalHistoryFor(context.supabase, context.userId, data.audience, [data.clientId]);
    return map.get(data.clientId)!;
  });

/** Read only. Top supporting facts for Today cards — never reorders them. */
export const getSupportingFacts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ audience: Audience, clientIds: z.array(z.string().uuid()).max(40) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { signalHistoryFor } = await import("@/lib/signal-history.server");
    const map = await signalHistoryFor(context.supabase, context.userId, data.audience, data.clientIds);
    const out: Record<string, { signal: any; facts: any[] } | null> = {};
    const rank = { high: 3, medium: 2, low: 1 } as const;
    for (const [id, r] of map) {
      if (!r.allowed || !r.signals.length) {
        out[id] = null;
        continue;
      }
      const best = [...r.signals].sort((a, b) => rank[b.confidence] - rank[a.confidence])[0]!;
      out[id] = {
        signal: { ...best, facts: undefined },
        facts: best.facts.slice(0, 3),
      };
    }
    return out;
  });

/** Separate write path. Access is re-checked at submission. */
export const submitSignalFeedback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        audience: Audience,
        clientId: z.string().uuid(),
        signalType: z.enum(["value", "property_record", "conversation", "request"]),
        action: z.enum(["dismiss", "not_accurate"]),
        disputedFactIds: z.array(z.string().max(200)).max(20).optional(),
        note: z.string().max(500).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { resolveContexts, buildEvidence } = await import("@/lib/signal-history.server");
    const { groupSignals, fingerprints } = await import("@/lib/signal-evidence");
    const ctxs = await resolveContexts(context.supabase, context.userId, data.audience, [data.clientId]);
    const ctx = ctxs.get(data.clientId);
    if (!ctx) throw new Error("You no longer have access to this homeowner.");
    const facts = (await buildEvidence([ctx])).get(data.clientId) ?? [];
    const signal = groupSignals(facts).find((s) => s.type === data.signalType);
    if (!signal) throw new Error("That signal is no longer available.");
    const chosen =
      data.action === "not_accurate" && data.disputedFactIds?.length
        ? signal.facts.filter((f) => data.disputedFactIds!.includes(f.id))
        : signal.facts;
    const { error } = await context.supabase.from("signal_feedback").upsert(
      {
        org_id: ctx.orgId,
        portfolio_client_id: data.clientId,
        signal_type: data.signalType,
        action: data.action,
        evidence_version: signal.evidenceVersion,
        disputed_facts: fingerprints(chosen) as any,
        note: data.note ?? null,
        created_by: context.userId,
        created_at: new Date().toISOString(),
      },
      { onConflict: "org_id,portfolio_client_id,signal_type,action" },
    );
    if (error) throw new Error("Could not save feedback.");
    return { ok: true };
  });

import { createFileRoute } from "@tanstack/react-router";

/**
 * One-click unsubscribe. No login, works with an expired session, and the
 * opt-out is written before the confirmation page renders. The signed token
 * carries only a keyed identifier for the recipient, so this page can neither
 * show private profile information nor change anything other than the
 * marketing email preference.
 */
function page(body: string, status = 200): Response {
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Email preferences · SuCasa</title>
<style>
  body{margin:0;background:#F6F7F9;color:#182230;font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
  main{max-width:520px;margin:0 auto;padding:48px 20px}
  .card{background:#fff;border:1px solid #DDE2E7;border-radius:16px;padding:28px 24px}
  h1{margin:0 0 12px;font-size:22px;line-height:1.25;color:#17324D}
  p{margin:0 0 14px}
  a.btn{display:inline-block;margin-top:8px;background:#214F7B;color:#fff;text-decoration:none;font-weight:600;border-radius:10px;padding:12px 20px}
  .muted{color:#5C6672;font-size:14px}
</style></head><body><main><div class="card">${body}</div></main></body></html>`,
    { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } },
  );
}

async function handle(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const token = url.searchParams.get("t");

  const { verifyUnsubscribeToken } = await import("@/lib/unsubscribe.server");
  const payload = verifyUnsubscribeToken(token);
  if (!payload) {
    return page(
      `<h1>This link is no longer valid</h1>
       <p>We couldn't confirm this unsubscribe link. It may have expired or been altered.</p>
       <p class="muted">You can manage every communication preference from your account settings.</p>
       <a class="btn" href="/account">Open account settings</a>`,
      400,
    );
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { setPreferences } = await import("@/lib/messaging-policy.server");

  // Written before the confirmation renders, so a queued send checked after
  // this moment is dropped.
  await setPreferences(
    supabaseAdmin,
    { emailHmacOverride: payload.e } as any,
    { marketing_email: false },
    {
      channel: "email",
      scope: "marketing",
      source: "email_unsubscribe_link",
      ip: request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for"),
      userAgent: request.headers.get("user-agent"),
    },
  );

  return page(
    `<h1>You're unsubscribed</h1>
     <p>We've stopped marketing and relationship emails to this address. Messages about
        something you started — a code you asked for, a security notice, a receipt, or an
        update on a service request — may still reach you.</p>
     <p class="muted">Want to choose each channel separately, including texts and calls?
        Sign in and open your communication preferences.</p>
     <a class="btn" href="/account">Manage preferences</a>`,
  );
}

export const Route = createFileRoute("/api/public/unsubscribe")({
  server: {
    handlers: {
      GET: ({ request }) => handle(request),
      POST: ({ request }) => handle(request),
    },
  },
});

<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->
- Stripe mode is chosen by request host (preview/localhost → STRIPE_TEST_SECRET_KEY when set; everything else live); live/test price and customer ids live in separate columns — preview and production share one database and one secret store.
- Lender mortgage age falls back to the recorded date of the same active lien in the property record (client-facts); tenure stays tied to the uploaded close date — keeps rate/date/balance from one lien.
- Agent home-system access requires both an accepted general agent connection and a homeowner home-system grant; all saves/deletes go through versioned RPCs — keeps permissions layered and history atomic.
- Agent inspection reports attach only under the homeowner's combined "help_manage_home" grant (or a per-report "add once" choice); legacy systems-only grants keep their scope until the homeowner opts in — keeps document access explicit and separate.
- Lender seats are enforced by the `lender_members` seat trigger plus pending `lender_team_invitations`; every membership path goes through it — prevents app paths from bypassing capacity.
- Branch/team features require `plan_tiers.team_enabled` AND a manager role (`lender_is_team_manager`); never infer from seat_limit — keeps entitlement explicit.
- Suspended lender members move to `lender_suspended_members` (books/assignments untouched) and return only via manual, capacity-checked reactivation — downgrades never delete data.
- Agent collaborations are owned per officer (`agent_lender_connections.owner_user_id`, trigger-guarded); only branch managers reassign.
- Vitest testTimeout is 30s (vitest.config.ts) — cold dynamic imports time out at the 5s default under full-suite load.
- Team invitation links use the request origin on preview hosts (`isPreviewHost` in src/lib/stripe-mode.ts) and SITE_URL otherwise — preview testing never hands out live-site links.
- Lender plan intent is carried as `?plan=` (plus sessionStorage `sucasa.lender_plan`) from /lenders/pricing → /lender-start → /lender/billing, and checkout success lands on /lender/welcome; startCheckout refuses a second checkout while the org has an active/trialing/past_due subscription — prevents duplicate subscriptions on retry.
- Professional workspaces (lender/agent) are provisioned only after an explicit action on /lender-start or /agent-start (sessionStorage intent in src/lib/pro-intent.ts); signed-in visitors without intent get a confirm button — prevents silently converting homeowners.
- Self-serve professional workspaces and lender checkout require a verified email, proven only by the signed session (emailed code/link or Google) and recorded in `pro_email_verifications`; homeowners are not gated and pre-existing professionals were grandfathered — keeps corporate-firewall-safe codes and avoids breaking existing accounts.
- The `/lender` area redirects accounts without a lender workspace (or paused membership) to their own home — no empty professional shells.
- The $397 MLO Growth launch offer is a one-time Checkout payment; `finalizeLaunchPayment` (webhook + return sync, idempotent per session) then creates the $149 subscription with billing deferred 90 days — customers never see "free trial" wording.
- Sign-in emails link to /auth/continue (button press required) instead of the one-time verify URL, so corporate link scanners cannot consume the token; only Supabase verify URLs are accepted.
- New self-serve agents are routed to their own Discovery (resolved server-side from membership via getMyAgentOnboarding) until the free 100 is claimed; Agent Today shows an unlock banner instead of paid-plan prompts — keeps first value ahead of upsell and never trusts a client-supplied workspace id.
- Signup and magic-link emails both link through /auth/continue; preview-origin redirects keep the preview host — scanner-safe everywhere and testable before publishing.
- Every new lender/agent member gets a personal client book via the lender_members insert trigger (tg_provision_member_book) — joining a team always gives a place to add leads.

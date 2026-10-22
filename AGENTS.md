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
- Vitest timeout is 30s for cold imports.
- Team invitation links use the request origin on preview hosts (`isPreviewHost` in src/lib/stripe-mode.ts) and SITE_URL otherwise — preview testing never hands out live-site links.
- Lender plan intent is carried as `?plan=` (plus sessionStorage `sucasa.lender_plan`) from /lenders/pricing → /lender-start → /lender/billing, and checkout success lands on /lender/welcome; startCheckout refuses a second checkout while the org has an active/trialing/past_due subscription — prevents duplicate subscriptions on retry.
- Professional workspaces (lender/agent) are provisioned only after an explicit action on /lender-start or /agent-start (sessionStorage intent in src/lib/pro-intent.ts); signed-in visitors without intent get a confirm button — prevents silently converting homeowners.
- Self-serve professional workspaces and lender checkout require a verified email, proven only by the signed session (emailed code/link or Google) and recorded in `pro_email_verifications`; homeowners are not gated and pre-existing professionals were grandfathered — keeps corporate-firewall-safe codes and avoids breaking existing accounts.
- The `/lender` area redirects accounts without a lender workspace (or paused membership) to their own home — no empty professional shells.
- The $397 MLO Growth launch offer is a one-time Checkout payment; `finalizeLaunchPayment` (webhook + return sync, idempotent per session) then creates the $149 subscription with billing deferred 90 days — customers never see "free trial" wording.
- New self-serve agents are routed to their own Discovery (resolved server-side from membership via getMyAgentOnboarding) until the free 100 is claimed; Agent Today shows an unlock banner instead of paid-plan prompts — keeps first value ahead of upsell and never trusts a client-supplied workspace id.
- Sign-in, signup and magic-link emails link to /auth/continue (button press, only Supabase verify URLs accepted); preview-origin redirects keep the preview host — scanners cannot consume tokens.
- Every new lender/agent member gets a personal client book via the lender_members insert trigger (tg_provision_member_book) — joining a team always gives a place to add leads.
- BusinessShell resolves the member's own book and manager status itself (getBusinessOverview); page props only override — keeps the side menu identical on every page.
- Personal intake uses the server-designated personalBookId and validates active assigned ownership before writes; branch redistribution uses an atomic manager-only RPC that moves existing rows, preserves consent and record IDs, updates queue references, and logs assignments — prevents implicit team ownership and duplicate enrichment.
- Recovery and household/import-review modules stay pure/offline or preview-host-only Test Lab until durable storage is authorized; confirmed edges never widen caller access or activate financial signals.
- Read scripts/AGENTS.md and src/lib/AGENTS.md before changing files there.
- Lender property_snapshot is not home-care consent; filter physical-home evidence and narratives, preserving internal provenance.
- Enrichment fences claims and records dispatch before IO; uncertain outcomes require audited reconciliation, not automatic resend. Review SQL stays unapplied; no exactly-once spend claim.
- The worker claims only jobs listed in an active `enrichment_release_grants` row (book-scoped, dispatch-capped, one dispatch per address); no grant = nothing released — installing the repair can never drain other customers' queues.

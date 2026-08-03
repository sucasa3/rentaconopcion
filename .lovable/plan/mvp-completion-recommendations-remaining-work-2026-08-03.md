# MVP completion: recommendations + remaining work

## My recommendations on your four questions

**1. Language — store it, and make the AI + notifications honor it.**
Add `Desired language (English / Spanish)` to onboarding and the profile, store it on the homeowner record, and pass it to GHL as a contact field so your workflows can branch. The AI assistant and the inspection-findings summary then answer in the chosen language (one line in the prompt — near-zero cost). Do NOT translate the whole UI yet: full Spanish localization of every page is a large, separate project and shouldn't block MVP. This gets you real bilingual value where it matters (conversation, emails/SMS from GHL, lender/pro handoffs) for a fraction of the work.

**2. Email — GHL sends everything, with one exception.**
You already pay for GHL and it owns the contact record, unsubscribes, and workflow builder. Duplicating that in SuCasa means a second sender domain, a second suppression list, and two places to debug. So: SuCasa fires structured events into GHL (already have the sync queue), GHL owns all homeowner and lender email + SMS.

The exception is the **pro lead offer** (25-minute round-robin SLA). That one is time-critical and must fire within seconds of routing, and its delivery drives auto-reassignment. Recommendation: send pro lead offers as SMS/email via GHL too if your GHL workflow can trigger inside ~30s of a webhook; if testing shows lag, we move only that one notification in-app. Cost-wise GHL is effectively free at your volume (bundled), whereas in-app email means a new sender domain and DNS.

**3. Payments — bill pros in GHL.**
Your Stripe is already connected to GHL, so GHL order forms/subscriptions give you the $297 founding and $397 standard plans with dunning, receipts, and cancellation handled, no second Stripe surface. SuCasa receives a webhook on paid/canceled and flips `pros.plan`, `pros.active`, and `accepting_leads`. Adding Lovable payments would create a second, competing subscription record for the same customer — avoid it for MVP.

**4. Directory — Lovable is the source of truth, synced out to GHL.**
Routing already depends on SuCasa data: `pros`, `pro_coverage` (category + zip/metro), `rr_cursor` round-robin state, `lead_offers` SLA timers. GHL has no equivalent. So pros are created/edited in SuCasa and pushed to GHL as contacts for comms and billing tags. Your existing GHL vendor list gets imported once into `pros` + `pro_coverage` as a seed. One-way (SuCasa → GHL) avoids conflict reconciliation.

## What's still pending for the MVP

Ordered by what unblocks revenue.

1. **Pro self-serve onboarding + billing** — public signup form (business, categories, coverage zips/metros, contact), GHL checkout link for $297/$397, webhook that activates the pro and turns on lead flow. Without this every pro is added by hand.
2. **Language field** — onboarding step, profile edit, GHL field, AI assistant + findings respond in the chosen language.
3. **Notification events into GHL** — one clean event contract for: new request created, lead offered to pro, lead claimed, job scheduled, job completed + invoice, lender intro requested. Today the sync queue carries entity syncs, not lifecycle notifications.
4. **Directory import + admin management** — one-time import of the GHL vendor list into `pros`/`pro_coverage`, plus admin screens to add/edit/suspend a pro and adjust their coverage.
5. **Homeowner profile editing** — homeowners can currently only set details during onboarding; they need an edit screen (contact, address, language, goals).
6. **Reviews / ratings on completed jobs** — `pros.rating` and `reviews_count` exist but nothing writes them; a post-completion rating prompt closes the loop and feeds the directory.
7. **Admin ops polish** — request list with status filters and manual reassignment when the round-robin stalls, plus core metrics (requests, claim rate, SLA misses, active pros).

## Technical notes

- Language: new `profiles.language` column (`'en' | 'es'`, default `'en'`), surfaced in `src/routes/onboarding.tsx`, read in `src/lib/assistant.functions.ts` and `src/lib/inspection.server.ts`, mapped in `src/lib/ghl.server.ts`.
- Pro billing: new public webhook route under `src/routes/api/public/` verifying a shared signing secret, updating `pros.plan/active/accepting_leads`. No Lovable payments integration enabled.
- Notifications: extend the existing GHL sync queue with an event/notification op type rather than adding a second delivery mechanism.
- Directory sync stays one-way SuCasa → GHL through the existing queue; GHL contact/opportunity IDs already stored in `ghl_sync_state`.
- No in-app email domain, no email templates, no queue infrastructure for MVP.

## Suggested next step

Start with item 1 (pro self-serve + GHL billing webhook) since it's the only item that turns on revenue, then item 2 (language) as a small follow-on.

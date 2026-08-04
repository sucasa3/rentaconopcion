# Homeowner Campaigns — SuCasa as the brain, GHL as the sender

I agree with the architecture: SuCasa owns the data, the decisions and the personalization; GoHighLevel owns delivery, tracking and conversations. That keeps messaging portable if GHL is ever replaced. Here's how it fits our MVP.

## What we build

### 1. Campaign catalog (12 pre-built campaigns)
Seeded in the database, editable from admin without code:
- Monthly home value update
- Equity checkup / PMI removal
- Home anniversary
- Neighborhood activity (recent nearby sales)
- Maintenance reminders (spring HVAC, fall gutters, smoke detectors, winterization)
- Seasonal / tax + homestead exemption reminders
- Vendor recommendation when maintenance is due
- Refi opportunity (reuses the existing refi signal logic)

Each campaign row holds: key, name, description, channel (email first), cadence (monthly / seasonal / event-triggered), the data fields it needs, and an AI prompt template.

### 2. Org-level activation (lenders + agents)
Agents don't exist yet as a role, so we generalize the existing lender structure into **partner orgs** with a type of `lender` or `agent`. Existing lender orgs keep working unchanged. Each org gets a Campaigns tab in its dashboard:
- Toggle campaigns on/off for the whole portfolio, or per client
- Preview the exact message a given client would receive
- See last sent / next scheduled per client

### 3. Scheduler + personalization engine
A cron tick (same pattern as the existing leads tick) runs daily and:
- Finds homeowners whose campaign is due (cadence + anniversary + value-change thresholds)
- Pulls their live data — ATTOM value/equity/mortgage, maintenance timeline, inspection findings, nearby sales
- Skips sends when there's nothing meaningful to say (e.g. value moved < 0.5%)
- Generates the personalized copy with Gemini in the homeowner's language (we already store `language`)
- Writes a `campaign_send` row, then hands the payload to GHL

### 4. GHL handoff
Two-step, which is the most robust with the API we already use:
1. Write the computed values onto the GHL contact as custom fields (`sc_value`, `sc_equity`, `sc_rate`, `sc_savings`, `sc_campaign_body`, `sc_cta_url`, `sc_agent_name`).
2. Apply a campaign tag (e.g. `sucasa_monthly_value_update`) that triggers the GHL workflow.

You build the branded email template once per campaign in GHL and it merges our fields. Copy changes never require a redeploy. All handoffs go through the existing `ghl_sync_queue` + drain cron, so retries and error logging come for free. If you later prefer one inbound webhook per campaign, the same payload can be POSTed instead — it's a config flag on the campaign row.

### 5. Homeowner dashboard
A small "Your updates" card: what was last sent, what's coming next, and the ability to opt out per channel.

### 6. Admin panel
Create/edit campaigns, edit AI prompts, set cadence and thresholds, dry-run a campaign against a real homeowner, and see send history with GHL delivery status pulled back on the existing webhook.

## Technical notes

- New tables: `campaigns`, `campaign_activations` (org + campaign + optional client scope), `campaign_sends` (homeowner, campaign, payload, status, ghl result, timestamps), plus `partner_orgs.type` added to the lender org table. All with GRANTs and RLS — orgs read only their own rows, homeowners read only their own sends, admin full access.
- New server modules: `src/lib/campaigns.server.ts` (due-detection, data assembly, AI copy) and `src/lib/campaigns.functions.ts` (org + admin + homeowner reads and toggles).
- New public cron route `src/routes/api/public/campaigns.tick.ts` with `apikey` auth, scheduled daily via pg_cron, mirroring `sucasa-leads-tick`.
- GHL custom-field upsert added to `src/lib/ghl.server.ts`; new `campaign` entity type in the sync queue drain.
- Gemini via the existing AI gateway, same model as the assistant, with a strict schema so copy stays short and factual.
- Guardrails: no send without a confirmed email, per-homeowner frequency cap (max 2/month), unsubscribe respected, and every campaign send is transactional/relationship content tied to that homeowner's own property data.

## Scope order

1. Schema + campaign catalog seed + admin panel
2. Scheduler, personalization, GHL handoff (email only)
3. Org campaign tab for lenders and agents
4. Homeowner "Your updates" card
5. SMS as a later add-on

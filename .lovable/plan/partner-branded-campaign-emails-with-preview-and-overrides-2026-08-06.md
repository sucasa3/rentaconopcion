# Partner-branded campaign emails with preview and overrides

Today a lender or agent can only switch a campaign on or off. They can't see what the client receives, and the only trace of their brand is their org name inside the AI prompt. This plan gives both dashboards a real campaign workspace: their branding on every email, a live preview of a real client's message, and the ability to override the wording per campaign.

## How the email will look to the client

Partner-branded, SuCasa-powered:

- From name: the partner's sending name (e.g. "Jane Smith — Acme Lending")
- Reply-to: the partner's own email, so replies land in their inbox
- Signature block: partner logo, contact name, title, phone, email, license number
- Footer: small "Sent by SuCasa on behalf of {Partner}" line, required for deliverability and compliance

No DNS work for the partner. Delivery still runs through GoHighLevel, so all of the above ships as merge fields on the contact and gets placed once in the GHL template.

## What each dashboard gets

A "Campaigns" page reachable from both the lender and agent portfolio views (the lender page exists today; the agent gets an equivalent one).

1. **Brand & sender card** — editable by org admins: sending name, reply-to email, contact name/title/phone, license number, logo upload, and a short sign-off line. Shown as a live email-signature preview as they type.
2. **Campaign list with preview** — each campaign row gains a "Preview" action. Picking a client from their portfolio renders the exact subject and body that client would receive, with their branding applied, generated from real cached property data. No send, no cost to the property-records allowance.
3. **Per-campaign overrides** — for each campaign the partner can set:
   - a custom subject (optional; blank = AI-written)
   - a custom intro line and a custom closing line
   - a custom call-to-action label and URL
   The AI still writes the data paragraph in the middle so numbers stay accurate. A "Reset to default" clears the override.
4. **Recent messages** — kept as-is, plus the subject actually sent.

Guardrails: overrides are limited in length, the property numbers themselves are never editable, and the unsubscribe/footer block cannot be removed.

## Technical notes

- **Migration**: add branding columns to `lender_orgs` (`sender_name`, `reply_to_email`, `contact_name`, `contact_title`, `contact_phone`, `license_number`, `logo_url`, `signoff`). New table `campaign_org_overrides` (org, campaign, subject, intro, closing, cta_label, cta_url, updated_by, timestamps) with GRANTs to `authenticated`/`service_role`, RLS scoped to `lender_members` of that org plus admin. New public storage bucket `partner-logos` with owner-scoped write policies.
- **Engine**: `campaigns.server.ts` — `generateCopy` takes the org branding + override row, uses the override subject/intro/closing verbatim when set, and `buildPayload` adds `sender_name`, `reply_to`, `contact_name`, `contact_title`, `contact_phone`, `license`, `logo_url`, `signoff`, `sent_on_behalf_of` merge fields.
- **Server fns** in `campaigns.functions.ts`: `getOrgBranding` / `saveOrgBranding`, `getCampaignOverrides` / `saveCampaignOverride`, and `previewCampaignForClient` (org-member gated, dry-run only, reads cached property records, never calls the property-records provider).
- **UI**: extend `src/routes/_authenticated/lender/campaigns.tsx`, add `src/routes/_authenticated/agent/campaigns.tsx` sharing new components `campaign-brand-card.tsx`, `campaign-override-dialog.tsx`, `campaign-preview-dialog.tsx`. Add a Campaigns link on both portfolio index pages.
- **GHL**: `pushCampaignContact` already forwards every payload key as an `sc_*` custom field, so the new branding fields flow through without an API change. The GHL email template needs the new merge tags placed once (from name, reply-to, signature block) — a one-time setup step in GHL, no redeploy.

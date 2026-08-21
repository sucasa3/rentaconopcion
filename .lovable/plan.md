# Dry-run one campaign email to Neil@SuCasa.com

## What exists today

Campaign "sends" currently generate the copy, record the send, and push the contact + payload into GoHighLevel. The project has branded auth emails only — there is no app-email template or send path yet, so nothing actually lands in an inbox from SuCasa.

## What this plan does

1. **Set up app email sending** on the verified `notify.sucasa.com` domain (template registry + server-only send helper).
2. **Add a campaign email template** that renders the generated subject/body with the sender's branding: sender name, logo, contact name/title/phone, license number, sign-off, reply-to, and the CTA button. Unsubscribe is handled automatically by the platform.
3. **Wire the send into the campaign pipeline** so a real send emails the recipient first, then pushes to GoHighLevel — a CRM failure still won't block the email, and an email failure is recorded on the send row.
4. **Trigger one test send** to `Neil@SuCasa.com`:
   - Pick one active campaign for the SuCasa lender org.
   - Generate copy, send the email, push the contact/opportunity to GHL.
   - Report back: delivery status from the email logs, the exact from-name and reply-to used, and whether the GHL contact + opportunity appeared.
5. **No bulk sends.** The test is scoped to the single address; the daily cron audience stays as-is.

## What you check after

In your inbox: from-name, reply-to, logo/branding, body copy, CTA link, unsubscribe footer. In GHL: the contact, its custom fields (`sc_value`, `sc_equity`, `sc_campaign_body`, `sc_cta_url`), the campaign tag, and the opportunity.

## Technical notes

- Templates live in `src/lib/email-templates/` as React Email components, registered in the template registry; the send helper is server-only.
- The send happens inside `runCampaignTick` in `src/lib/campaigns-run.server.ts`, using an idempotency key derived from the send row id so retries don't duplicate.
- Sender identity resolves as today: MLO member profile fields fall back to lender org defaults.

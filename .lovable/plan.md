# Per-MLO sender identity for campaign emails

Today, campaign branding (from name, reply-to, contact block, logo, sign-off) is stored once per organization on `lender_orgs` and applied to every email that org sends. That works for a single-MLO demo org, but not for real usage where many loan officers (and agents) live under the same brokerage or share the platform. Each MLO needs their own sender identity, with the org acting only as a fallback/default.

## What changes for users

- Every lender/agent member gets a "My email identity" card: from name, reply-to email, contact name, title, phone, license/NMLS, headshot or logo, sign-off line.
- New members are seeded from their account profile (name, email) and the org defaults so nothing is blank on day one.
- Emails to a homeowner are branded with the MLO who owns that client's portfolio — not a generic org identity.
- Branch managers keep the org-level card, which now reads as "Team defaults" and fills any field an individual left blank.
- Campaign preview shows the identity that will actually be used for the selected portfolio, so an MLO can see their own signature before sending.

## Resolution order

For each client in a campaign run:

```text
portfolio.assigned_user_id -> member sender profile field
   -> falls back to org field (lender_orgs)
      -> falls back to org name / no-reply default
```

Unassigned portfolios keep using the org identity, so nothing breaks for orgs that never assign owners.

## Technical detail

1. Migration: new table `public.lender_member_profiles` keyed by `(lender_org_id, user_id)` with `sender_name`, `reply_to_email`, `contact_name`, `contact_title`, `contact_phone`, `license_number`, `logo_url`, `signoff`, timestamps. GRANTs for `authenticated` (select/insert/update) and `service_role`; RLS so a member reads any profile in their own org and writes only their own row, and org admins/managers may write any row in their org.
2. `src/lib/campaigns-run.server.ts`: load `lender_portfolios.assigned_user_id`, batch-fetch member profiles for those user ids, and build the branding object per client with the fallback chain above instead of the flat org lookup.
3. `src/lib/campaigns.server.ts`: keep the `Branding` shape, but have the merge helper accept a member profile plus the org row and coalesce field-by-field.
4. New `src/components/member-brand-card.tsx` (reusing the field list and logo-upload flow from `campaign-brand-card.tsx`), plus server fns in `src/lib/campaigns.functions.ts` to read/update the current user's member profile.
5. `src/components/campaigns-workspace.tsx`: render the member card first, then the org card labelled as team defaults (managers only for editing; others see it read-only).
6. `src/components/campaign-preview-dialog.tsx`: resolve the same branding chain for the previewed portfolio owner.
7. Seed existing members: on first read, if no row exists, return a virtual profile derived from `profiles.full_name`/`email` merged with org defaults; persist on first save.

No changes to GHL sync, sending cadence, campaign copy, or the DNS/domain setup already in progress.

# Why Call, Text and Email are locked — and how to unlock them safely

## What is happening

The buttons are locked because SuCasa has no recorded contact permission for these homeowners.

Confirmed from the data:

- The contact-permission table is completely empty (0 rows for 1,088 homeowners).
- Every imported homeowner carries `contact_marketing_permission = unknown` and relationship `org_uploaded`.
- Only 152 of 1,088 homeowners have a phone number on file at all (all 1,088 have an email).

The gate works like this today: a channel unlocks only if (a) an explicit permission is on file for that channel, or (b) the homeowner personally asked this lender to connect. Imported book records meet neither, so all three buttons show as locked with "No contact permission recorded for this channel." That is correct behavior against the current rules — the rules just have no way to reflect "this is my own existing customer."

## The fix

Recognize an existing customer relationship as a basis for a manual, one-to-one touch, while keeping everything else strict.

1. Existing-relationship default
   - For homeowners in the lender's own book (uploaded/borrower/client records), allow manual Call, Text and Email.
   - Automated/campaign sending stays locked — it still requires explicit recorded permission.
   - Do-not-call / do-not-text / do-not-email suppression always wins, unchanged.
   - Sponsored and agent-connected homeowners keep today's stricter rules — no change.

2. Honest reason text
   - Unlocked buttons explain the basis: "Your existing customer — manual, one-to-one contact only."
   - A channel with no phone or email on file shows "No phone number on file" instead of a permission message, so the lender knows the difference between "not allowed" and "no data." This alone fixes ~86% of the locked Call/Text buttons, which are missing a phone number, not permission.

3. Record permission per homeowner
   - Add a small control on the homeowner record to log what the homeowner agreed to (channel, basis, date), writing a real permission row.
   - Once recorded, that explicit permission takes over from the relationship default and can also enable campaign sending.

4. Marketing-permission field
   - Where a lender's import supplies a real marketing-permission value, it seeds the permission record instead of staying `unknown`.

## Technical notes

- `src/lib/lender-access.ts` — `channelDecision()` gains an existing-relationship branch (manual only, `automatedAllowed: false`), plus a distinct "no contact detail on file" outcome.
- `src/lib/lender-workspace.server.ts` — pass whether phone/email exist into the channel decision so reasons are accurate.
- `src/components/lender-contact-card.tsx` — show the reason on locked chips; no layout change.
- Homeowner detail view — permission-recording control calling a new gated server function that writes `outreach_channel_permissions`.
- Tests in `src/lib/lender-access.test.ts` — suppression still wins, sponsored/agent-connected unchanged, automated stays gated, missing-contact-detail reason.
- No schema change; `outreach_channel_permissions` already has the needed columns.

## Compliance stance preserved

Visibility still does not imply permission; suppression lists still override everything; automated outreach still needs explicit consent; sponsored-homeowner anonymity and all existing access categories are untouched.

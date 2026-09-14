# Fix the 404 claim link and reduce spam placement

## What's happening

**The 404 is real and expected.** The invitation email links to the live site at
`rentaconopcion.lovable.app/professional-invite`. I checked that address: the live site
answers, but the claim page itself returns 404. The claim page exists in the project but has
never been included in a publish, so the live site doesn't have it yet. It is not a domain
problem, and it is not a broken link or a bad token.

**Junk placement is a reputation matter, not a setup error.** Sending from
`notify.sucasa.com` is fully verified and correctly delegated. A brand-new sending
subdomain with almost no history is routinely filed as junk by Hotmail/Outlook for the
first sends. Nothing is misconfigured.

## Plan

1. **Publish the app** so the claim page goes live. Then re-check the exact link from your
   email and confirm it opens the claim page instead of 404.
2. **Re-check the claim flow end to end** on the live site: open the link, sign in with
   neilterc+1@hotmail.com, claim, and confirm the agent's Professional Network row switches
   to "On SuCasa".
3. **Re-run the separation checks** after the claim: no homeowner sharing record, no lender
   access, no monitoring capacity, no credits, no paid entitlement — only the audit trail.
4. **Improve deliverability on the invitation email** (small, copy/structure-level changes
   that inbox filters weigh):
   - a plain-text alternative alongside the styled version
   - a visible sender identity and a real reply-to address on the invitation
   - a one-line unsubscribe/decline reference in the footer text
5. **Warm-up guidance for you** (no code): mark the message "not junk" and add the sender to
   your contacts on the test account; ask the first handful of real recipients to do the
   same. Placement improves as the subdomain builds history.

## Notes

- Nothing about the token, expiry or security changes here.
- If you would rather the invitation link use a SuCasa domain instead of the Lovable
  address, that is a separate step: connect the domain to the project, then the link base
  gets pointed at it. Tell me if you want that included.

## Technical detail

- Claim link base: `PUBLIC_SITE_URL` env, defaulting to `https://rentaconopcion.lovable.app`.
- Verified live: `GET /` → 200, `GET /professional-invite?t=...` → 404, i.e. the published
  build predates `src/routes/professional-invite.tsx`.
- Email domain `notify.sucasa.com`: verified, NS delegation active, auth emails enabled.
- Deliverability edits are confined to `src/lib/email-templates/professional-invite.tsx`
  and the shared brand wrapper; no change to `professional-invitations.server.ts` logic.

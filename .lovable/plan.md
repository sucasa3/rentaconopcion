# Fix the invitation email logo and agent account setup

## 1. The invitation email shows a generic house, not the SuCasa logo

The email header draws a small house shape in code instead of using the real SuCasa
logo we already have for the website.

Fix: put the actual SuCasa logo image in the email header (white logo mark on the
deep-blue bar, sized for mobile, with "SuCasa" as the alt text so it still reads
correctly if a mail app blocks images). Because email needs a full web address for
images, the logo will be referenced from the live SuCasa site address rather than a
local file. This changes every SuCasa email at once — invitations, campaign updates,
sign-up, password reset — since they all share the same header.

## 2. A new agent only gets a homeowner account

Today there is no way for an agent to get an agent workspace. Every new account is
created as a homeowner, and the only way to become an agent is for an administrator
to run a demo setup by hand. That is why info@sucasa.com landed on the homeowner
dashboard with no place to add customers.

What will change:

1. **Invitation link becomes a real acceptance page.** The "Review invitation" button
   in the email leads to a page that asks the person to sign in or create an account
   with the invited email address.
2. **Accepting the invitation creates the agent workspace.** On acceptance we create
   the agent's own agency (they confirm the agency name, pre-filled from the
   invitation), make them its owner, create their first client book, and connect them
   to the lender who invited them.
3. **They land in the agent workspace, not the homeowner dashboard.** After setup they
   go straight to the agent home where they can add customers and import a book.
4. **Self-serve path for agents with no invitation.** A short "Set up my agent
   workspace" step (agency name only) available from the agents page, so an agent who
   signs up directly is not stuck on the homeowner dashboard.
5. **Fix the existing account.** Create the agent workspace for info@sucasa.com and
   connect the pending SuCasa Demo Lender invitation, so that account works without
   re-registering.

Nothing changes for homeowners: an agent still keeps a homeowner profile, they simply
also get an agent workspace.

## Technical notes

- `src/lib/email-templates/brand.tsx`: replace the inline SVG with `<Img>` pointing at
  the hosted SuCasa logo (absolute URL built from the site URL + the existing
  `src/assets/sucasa-logo.png.asset.json` pointer path); keep the white rounded tile
  and wordmark layout.
- New `src/lib/agent-onboarding.functions.ts`:
  - `ensureAgentWorkspace({ agencyName })` — idempotent: creates `lender_orgs`
    (`org_type: 'agent'`), `lender_members` owner row, a default `lender_portfolios`
    book; uses admin client only after verifying the caller's own session.
  - `acceptAgentInviteAsNewAgent({ connectionId, agencyName })` — provisions the
    workspace then reuses existing `respondToInvite` to link the connection.
- New route `src/routes/agent-invite.tsx` (public): reads the invitation, prompts for
  sign-in/sign-up, then calls the accept function and navigates to `/agent`.
- `src/lib/network.functions.ts`: invite email `acceptUrl` becomes
  `${siteUrl}/agent-invite?c=<connectionId>`.
- `getMyWorkspace` already routes agent org members to `/agent`; no change needed.
- One-off data fix for info@sucasa.com via the same provisioning path.
- No schema changes. No change to access gates, consent, sponsored-homeowner privacy,
  compliance or ranking logic.

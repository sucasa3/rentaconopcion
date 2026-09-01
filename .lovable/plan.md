# Homeowner account activation invitations

## Goal
Give agents and lenders a clear way to invite an imported homeowner to activate their SuCasa account, while preserving the existing client record and linking it to the homeowner account after activation.

## Current flow confirmed
- Agents and lenders can add a homeowner/client with name, address, and optional email, or import clients in bulk.
- A client is considered activated only when `lender_portfolio_clients.homeowner_id` is populated.
- Standard signup creates the auth/profile record, but it does not currently match a new signup back to an existing client by email.
- An invite email template already exists, but no homeowner-facing invite action currently sends it.

## Implementation
1. **Add a secure invitation model and server functions**
   - Store a hashed, expiring, single-use activation token tied to the specific portfolio client and inviter, with resend/revocation state and timestamps.
   - Add authenticated server functions for agents/lenders to invite or resend an invite only for client records they are authorized to access.
   - On acceptance, securely resolve the token, create or complete the homeowner account through the backend auth flow, link `homeowner_id`, and preserve the imported property and financial data.
   - Make the link idempotent: repeat clicks, resends, and an already-activated client produce a clear result rather than duplicate accounts or links.

2. **Wire branded activation email delivery**
   - Use the existing managed email route and invite template, adding the homeowner’s name, the inviter’s organization/MLO identity, the existing home context, expiration, and a primary “Activate my home” CTA.
   - Keep email contents limited to the minimum needed to identify the invitation; do not expose financial details in the email.
   - Handle existing email addresses with a safe “sign in to connect your home” path instead of creating a second account.

3. **Add the invitation experience to business workflows**
   - Add an “Invite to activate” action to homeowner rows/detail views for both agent and lender experiences.
   - Show clear states: not invited, invitation sent with date, resend, activated, and missing email.
   - Add a compact activation status/filter so business users can see which homeowners still need activation without confusing it with property-data enrichment.
   - After a successful send, refresh the client/work-queue counts and show a concise confirmation/error toast.

4. **Create the public activation route**
   - Add a public `/activate` page that validates the token, explains which home is being connected, and supports both new-account creation and sign-in for existing users.
   - After authentication, link the client and route the homeowner to their Home Profile/dashboard; do not put the activation page behind the authenticated layout.
   - Add a safe expired, revoked, already-used, and invalid-token state with a route back to sign in/support.

5. **Security and validation**
   - Keep token values out of the database and logs by storing only a cryptographic hash.
   - Enforce inviter organization membership, client ownership/scope, expiration, one-time use, and exact-email matching for existing accounts.
   - Add grants and RLS for any new public table in the same migration, with service-role access only where the verified server flow requires it.
   - Cover the key paths: new homeowner, existing account, resend, expired token, wrong email, duplicate click, and already activated client.

## Technical details
- Reuse the project’s TanStack Start `createServerFn` boundary for internal invitation/account-linking operations; do not add an edge function.
- Reuse the existing auth email infrastructure and custom invite template rather than introducing a second mail system.
- Preserve the current signup behavior and email-confirmation setting unless the activation test explicitly requires a configuration change.
- Update route head metadata for the new public activation route and keep business routes noindex.

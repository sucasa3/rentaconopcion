# Lender seats, branch teams, pricing clarity, and agent homeowner onboarding

Planning only. Nothing gets built, sent or published until you approve.

## 1. What exists today (from reading the code)

**Lender seats**
- `plan_tiers.seat_limit` is set to 1 / 5 / 15 for MLO Growth / Branch / Branch Pro. Billing copies it into `lender_orgs.seat_limit` (`billing.server.ts` applySubscription, `billing.functions.ts` activateComped).
- Nothing reads it. The only way to add a member after signup is `addLenderMember` (`lender.functions.ts`), which is admin-only and has no seat check.
- There is no way for loan officers to invite each other. The `professional_invitations` table only handles agents inviting other professionals.
- Manager tools (funnel, capacity, billing, assigning client books) are gated only by role (`is_lender_manager`: owner/admin/manager), never by plan. So every MLO Growth owner gets all of them.
- Home Profile and agent allowances are pooled across the whole organization (`capacity.server.ts` poolInputFor).
- Agent collaborations (`agent_lender_connections`) belong to the organization. `inviteAgent` (`network.functions.ts`) records `invited_by`, but no officer ownership is enforced.
- Downgrading leaves every member in place.

**Agent homeowner actions**
- The add page `/agent/add-client/$id` exists and works for both manual add and spreadsheet upload (`addAgentPortfolioClient`, `ingestAgentPortfolioCsv` in `agent.functions.ts`).
- On Agent Today (`agent-today.tsx`), the two buttons that lead there only appear when the book is empty (`EmptyBook`). Once an agent has one client, Today has no visible "Add homeowners" button. This is the most likely reason you couldn't find it in the demo.
- `business-dashboard.tsx` has an "Add homeowner" header button, but it only shows where that header is rendered.
- On the client record (`agent/portfolio.$id.tsx`), "email" only opens the agent's own mail app.
- No code sends an invitation for a homeowner to activate their account, and there is no invitation status or resend button. The emails in the code are agent invites, professional invites, introduction invites, campaigns, daily reads and security alerts.
- Adding or importing a homeowner sends no email. No `sendTemplateEmail` call sits on either path. A step-0 check will confirm this, along with whether a phone-verification or capacity gate hides the add page.

## 2. Pricing copy (short cards)

| Plan | EN line | ES line |
|---|---|---|
| MLO Growth $149 | 1 loan officer · Up to 10 agent collaborations | 1 oficial de préstamos · Hasta 10 colaboraciones con agentes |
| Branch $499 | 5 team seats · Up to 25 agent collaborations | 5 puestos de equipo · Hasta 25 colaboraciones con agentes |
| Branch Pro $799 | 15 team seats · Up to 50 agent collaborations | 15 puestos de equipo · Hasta 50 colaboraciones con agentes |

- Under the Branch plans: "Invite your loan officers. Each manages their own clients and agent relationships." / "Invita a tus oficiales de préstamos. Cada uno gestiona sus propios clientes y relaciones con agentes."
- Note: "Manager included in seats. Home Profile and agent limits are shared across the branch." / "El gerente está incluido en los puestos. Los límites de perfiles y agentes se comparten en toda la sucursal."

Applies to `/lenders/pricing` (via `public-plans.ts` plus i18n) and `/lender/billing`. Prices and allowances stay the same.

## 3. Seats and team invitations

**Rule:** seats used = active members (owner included) + pending, unexpired invitations. This must never exceed `lender_orgs.seat_limit`.

1. A new `lender_team_invitations` table:
   - Fields: org, email, hashed token, invited_by, status (pending/accepted/canceled/expired) and an expiry 7 days out.
   - Only one pending invite per org and email.
   - Grants, row-level security and manager-only read access.
2. A single database function `lender_claim_seat(org, kind)` makes every new member go through the same check. It locks the org row (`FOR UPDATE`), counts members and pending invites, and either refuses or reserves a seat. It is used by:
   - `addLenderMember` (admin), which may no longer go over the limit.
   - Invite creation, which reserves a seat.
   - Acceptance, which turns the reservation into a membership in the same step and checks the token, expiry and that the email matches the signed-in account.
   - Two people accepting or inviting at once can't go over the limit, because the row lock makes them take turns.
3. A Team screen for managers (Branch and Branch Pro only):
   - Shows "3 of 5 seats used · 1 pending".
   - Managers can invite, cancel, resend or remove.
   - When the branch is full, it explains why and links to upgrade.
   - MLO Growth sees "Your plan includes 1 loan officer. Upgrade to Branch to add your team."
4. A public `/team-invite` acceptance page:
   - People who are signed out can sign up or sign in, then come back to it.
   - Each officer uses their own login inside the branch, so they don't need a separate paid account.
   - Invitation emails are only sent when a manager explicitly clicks Invite.
5. Downgrades:
   - When an org schedules a downgrade (the payment provider tells us when it takes effect), and active members would be more than the new seat count, the manager must pick who stays before the change.
   - When the downgrade takes effect, members who weren't picked become `suspended`, which locks them out. Their client books, history and connections stay intact and are handed back to the manager.
   - Pending invites beyond the new limit are canceled.
   - If no selection was made, the owner stays and everyone else is suspended (owner-only fallback).
   - Upgrading again restores suspended members.

## 4. Branch permissions

- **Two checks, both on the server:** `branch_team_enabled(org)` is true when `seat_limit > 1`, and the member's role is also checked. Team-wide features need both:
  - Cross-officer reports
  - The team roster
  - Assigning books to other officers (`assignPortfolioOwner`)
  - Org-wide tasks and activity
  - Both checks go into the server functions themselves, not just the navigation.
- **What every officer gets:** their own Today queue, built only from client books where they own or are assigned the book.
- **What solo MLOs keep:** their personal pipeline, billing and capacity tools, all limited to their own books.
- **Who owns each agent collaboration:**
  - A new `owner_member_user_id` on `agent_lender_connections`. Existing rows are filled from `invited_by`, or the org owner when that's empty.
  - Officers can invite and manage only their own collaborations, within the shared branch allowance.
  - Managers can see all of them and reassign them.
- **Separate invite systems:** officer team invites and agent collaboration invites stay completely separate (different tables, emails and screens).
- **Privacy:** joining a branch or adding an agent collaboration never reveals homeowners or grants permission to contact them. Existing consent and relationship rules still decide access. Agent account benefits stay exactly as they are.

## 5. Agent "Add homeowners"

- A prominent "Add homeowners" button is always visible on Agent Today (desktop header and mobile) and on the client book page. It opens a choice between "Add one homeowner" and "Upload a client list", both on the existing add page.
- Clients who don't have a SuCasa account get an "Invite to SuCasa" action on their record. It shows Not invited / Invited (date) / Joined, has Resend with a cooldown, and only sends when the agent clicks it.
  - This depends on a new homeowner-activation email and a tracking table, as no such flow exists yet.
  - It respects the existing consent and communication-preference rules.
- If phone verification or capacity is the block, the reason is shown on the button itself ("Verify your phone to add more homeowners" / "You've reached 100 Home Profiles").
- Uploading a list never sends invitations.
- EN/ES labels: "Add homeowners" / "Agregar propietarios", "Add one homeowner" / "Agregar un propietario", "Upload a client list" / "Subir lista de clientes", "Invite to SuCasa" / "Invitar a SuCasa", "Invited" / "Invitado", "Joined" / "Se unió", "Resend" / "Reenviar".

## 6. Build order

1. Confirm the remaining open points: whether the add page hides behind any gate, and that adding or importing sends no email. This is read-only.
2. Pricing and billing copy.
3. Seat table, the single seat-check function, and the guard on `addLenderMember`.
4. Team invitations, the Team screen and the acceptance page.
5. Plan-based plus role-based gates, each officer's own Today, and collaboration ownership.
6. Downgrade member selection and suspension.
7. Agent "Add homeowners" button and the homeowner invitation status.

## 7. Acceptance checks (synthetic accounts only)

- **Seat limits:** a Branch org with 5 seats refuses a 6th invite, and the admin add path also refuses. Pending invites count toward the limit, and canceling one frees a seat. On MLO Growth, both inviting and the Team screen are refused at the server.
- **Running at the same time:** 10 parallel accepts or invites with 1 seat left produce exactly one success.
- **Invitations:** an expired, canceled or reused link is refused, and so is an accept from an account whose email doesn't match.
- **Officer separation:** an officer can't read another officer's books, Today, tasks or collaborations, even with direct server requests.
- **Manager access:** a manager can see the whole team and reassign books and collaborations. MLO Growth can't use cross-officer tools.
- **Collaborations:** each officer's collaborations count against the shared branch limit, and reassignment is recorded.
- **Homeowner consent:** a new officer sees no homeowners who weren't assigned to them, and has no contact permission without existing consent.
- **Downgrade:** members who weren't picked are suspended and their data is kept. Upgrading again restores them.
- **Agent screens:** "Add homeowners" is visible on desktop and on a 390px phone with a non-empty book. Importing sends no email. An invite sends only on click, and status and resend work.

## Open dependencies

- The payment provider has to tell us when a downgrade is scheduled and when it takes effect, so members can be picked in advance.
- The homeowner-activation email is a new template, and the sending domain must already be verified.
- Suspended members need a new `status` column on `lender_members` (defaults to active, so nothing breaks).

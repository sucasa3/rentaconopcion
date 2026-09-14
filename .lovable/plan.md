# Final smoke test: Professional Network invitation flow

No architecture changes. This is a verification pass; the only code or data changes are the test records needed to run it, plus fixes for anything the test actually breaks.

## What I found before planning

The professional and relationship records in the database are completely empty: 0 professionals, 0 relationships, 0 suggestions, 0 invitations. So there is nothing to invite today, and every checklist item that starts with "Agent sees a lender" cannot run until test records exist. Members and client books are intact (1,088 clients, both agent workspaces present).

## Step 1 — Test records

In your **SuCasa Demo Realty** workspace (you are an owner there), I add:

- One test lender professional with the email **neilterc+1@hotmail.com**, linked to that workspace as a confirmed lender for one client.
- One test lender professional with **no email at all**, to check the non-invitable state and its hint.

Both are clearly marked test records and are removable afterwards. No organizations are auto-created, no homeowner permissions, no monitoring capacity, no paid entitlement.

## Step 2 — Browser verification (I run this)

Signed in as your agent account:

1. Professional Network shows both test lenders under "My people".
2. "Invite to SuCasa" on the first one flips immediately to "Invitation sent".
3. The no-email lender stays non-invitable and shows the explanatory hint.
4. I read the stored invitation and confirm the emailed link carries the correct signed token, and that the message body contains no homeowner name, address or loan detail.
5. Signed in as a different account, opening that link shows the "this invitation belongs to another address" message and reveals nothing.
6. Link failure cases, each checked on screen: withdrawn, expired, malformed, too short, and a tampered token. Each must show a plain unavailable/needed message with no data and no blank screen.
7. Resend and Withdraw exercised separately, each checked against the state shown in the list afterwards.

## Step 3 — You claim it

I send you the invitation link. You sign in as **neilterc+1@hotmail.com** (confirming that address first) and claim the profile. Then I verify on screen that the agent's list shows **On SuCasa**.

## Step 4 — Separation check

After the claim, I confirm from the records that claiming granted nothing beyond identity:

- no homeowner permission of any kind was created
- the homeowner relationship stays as it was; no sharing was implied
- no monitoring capacity, agent benefit, credit or paid entitlement changed
- every step appears in the audit trail with no homeowner details

## Reporting

I report only failures and corrections. If everything passes, you get a short pass list and nothing else. If the test exposes a real defect I will describe it and propose the minimum fix before changing anything.

## Technical notes

- Test records: `professionals` rows (one with `email_normalized`, one without) plus `relationships` edges of the professional-lender type scoped to org `55035d6b` with `status = confirmed`, written via a data change, not a schema migration.
- Verification uses Playwright against the running app with the injected Supabase session; failure cases hit `/professional-invite` with crafted `t` values.
- Separation is asserted by reading `consent_records`, `relationships`, `agent_base_entitlements`, `premium_memberships` and `agent_credit_ledger` before and after the claim, and `compliance_audit_events` for the event trail.
- Paid lender activation, active/waiting capacity, lender aggregate preview, lender-to-agent expansion and Closing Partner remain out of scope.

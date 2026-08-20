# Fix the GoHighLevel connection first

## What's actually broken

All 18 campaign sends failed with the same error, and it is the only failure recorded:

```text
GHL POST /contacts/upsert [401]: {"statusCode":401,"message":"The token is not authorized for this scope."}
```

That is GHL rejecting the private integration token, not a bug in our payload. `/contacts/upsert` requires the `contacts.write` scope; the token currently in the project doesn't carry it (or was regenerated without it). Every campaign send goes through this one call, so nothing can send until it's fixed.

Secondary risk we can't see yet: even with the right scope, the campaign push writes custom fields (`sc_*`, `sucasa_user_id`, `sucasa_language`) and applies campaign tags. If those fields don't exist in the new GHL location, values silently drop.

## Plan

### 1. GHL connection doctor (admin)
A single "Test GHL connection" panel that runs a read-only checklist and reports pass/fail per item with the raw GHL message:
- Token + location valid (`GET /locations/{id}`)
- Contacts read scope
- Contacts write scope (upsert against a dedicated test contact, e.g. `ghl-check@sucasa.com`)
- Opportunities read/write scope against the homeowners pipeline
- Pipeline and stage IDs resolve to real stages in the new location
- Custom fields present: `sc_value`, `sc_equity`, `sc_campaign_body`, `sc_cta_url`, `sucasa_user_id`, `sucasa_language` — listing any that are missing
- Campaign tags: which of the 12 campaign tags already exist in the location

This turns "it 401s" into an exact list of what to change in GHL, and it stays available for the next token rotation.

### 2. Better error surfacing
`ghl.server.ts` currently throws a raw string. I'll parse GHL's JSON error and classify it (`auth_scope`, `not_found`, `rate_limited`, `bad_request`), so the panel and the sync queue show "Token missing contacts.write scope" instead of a wall of JSON. No behavior change beyond the message.

### 3. Stop a CRM failure from killing an email
Right now a GHL error marks the whole campaign send `failed`, even though email delivery is separate. I'll record CRM outcome separately on the send row (`crm_status`, `crm_error`) so a scope problem in GHL never blocks or hides a delivery problem — and add a "retry CRM push" action for sends whose only failure was GHL.

### 4. Retry the 18 failed sends
Once the token passes the doctor, requeue those 18 through the CRM push and confirm contacts + tags land in the new location.

## What I need from you

Regenerate the private integration token in the new GHL location with at least:
`contacts.readonly`, `contacts.write`, `opportunities.readonly`, `opportunities.write`, `locations.readonly`, and `conversations/message.write` if you want SMS later. Paste it and I'll swap it in, then run the doctor.

If you'd rather not regenerate yet, I can still build the doctor and run it against the current token — it will name the exact missing scopes.

## Technical notes
- New `src/lib/ghl-doctor.server.ts` with read-only probes; exposed through `src/lib/ghl.functions.ts` behind an admin role check.
- New panel rendered in the existing admin route next to `GhlSyncPanel`.
- `campaign_sends` gains `crm_status` and `crm_error` columns with GRANTs matching the existing admin/org-scoped policies.
- No live homeowner email is sent by anything in this plan.

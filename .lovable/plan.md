# Apply the new GHL Private Integration Token

## Goal
Replace the stale GoHighLevel API token with the one you just generated, verify it has the required scopes, and retry the 18 campaign sends that failed with `contacts.write` scope errors.

## Steps

### 1. Update the project secret
Replace `GHL_API_KEY` with the new token:

```text
pit-d8488d2a-0e0a-4ab0-a36b-00edaee3f79c
```

### 2. Run the GHL Connection Doctor
Check:
- Token + location are valid
- Required scopes present: `contacts.readonly`, `contacts.write`, `opportunities.readonly`, `opportunities.write`, `locations.readonly`
- Homeowners pipeline and stage IDs resolve
- Custom fields exist: `sc_value`, `sc_equity`, `sc_campaign_body`, `sc_cta_url`, `sucasa_user_id`, `sucasa_language`
- Campaign tags are present

Report back the exact pass/fail list and any raw GHL error messages.

### 3. Retry the failed campaign sends
If the doctor passes on `contacts.write`:
- Requeue the 18 sends that failed with the scope error
- Confirm contacts, custom fields, tags, and opportunities land in the new GHL location
- Report how many pushed successfully and any remaining failures

### 4. Dry-run one email (after email DNS is active)
Once `notify.sucasa.com` DNS is verified and GHL is green:
- Send one campaign email to an address you control
- Verify from-name, reply-to, unsubscribe, and that the GHL contact/opportunity appears

## What I need from you
Nothing further for steps 1–3 — just approve the plan and I’ll apply the token and run the checks. Step 4 waits for the email DNS to finish verifying in Cloud → Emails.

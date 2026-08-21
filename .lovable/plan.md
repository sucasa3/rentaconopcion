# Finish GHL + email DNS for lender go-live

Goal: unblock the lender service so campaign sends can flow into GoHighLevel and branded emails can actually deliver.

## 1. Finish DNS for notify.sucasa.com (your action)

At the registrar for `sucasa.com`, add:

- **TXT record**
  - Name: `_lovable-email.sucasa.com`
  - Value: the verification string shown in **Project Settings → Email** (copy it fresh; it is unique to the project)
- **NS records**
  - Name: `notify.sucasa.com`
  - Values: `ns3.lovable.cloud` and `ns4.lovable.cloud`

Then wait for verification to turn active in **Cloud → Emails**. Nothing can send until that status is active.

## 2. Regenerate the GHL Private Integration Token (your action)

In the new GHL location:

1. Go to **Settings → API Credentials → Private Integration Token**.
2. Create or regenerate the token with these scopes:
   - `contacts.readonly`
   - `contacts.write`
   - `opportunities.readonly`
   - `opportunities.write`
   - `locations.readonly`
   - `conversations/message.write` (only if you want SMS later)
3. Copy the token and the Location ID.
4. Paste both into the project secrets / env (I will swap them in once you provide them).

## 3. Verify the GHL setup with the doctor (my action)

Once the token is in place I will run the existing **GHL Connection Doctor** from the admin panel and report back exactly:

- Token + location valid
- Each required scope present or missing
- Pipeline and stage IDs resolving
- Custom fields present (`sc_value`, `sc_equity`, `sc_campaign_body`, `sc_cta_url`, `sucasa_user_id`, `sucasa_language`)
- Campaign tags present

If anything is missing, the doctor will list it so you know precisely what to configure in GHL.

## 4. Retry the failed CRM pushes (my action)

After the doctor passes:

- Requeue the 18 campaign sends that previously failed with the `contacts.write` scope error.
- Confirm contacts, custom fields, tags, and opportunities land in the new GHL location.
- Verify the queue drains with no errors.

## 5. Dry-run one email (your action, after DNS is active)

Once DNS and GHL are both green:

- Send one campaign email to an address you control.
- Check from-name, reply-to, unsubscribe, and that the GHL contact/opportunity appears.

No bulk sends will happen automatically; this plan only gets the infrastructure ready.

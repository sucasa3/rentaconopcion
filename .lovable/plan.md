# SuCasa Lender Go-Live Sequence

## Goal
Get the lender service ready for real sends: connect the domain, verify email sending, brand the lender org, activate default campaigns, and run a dry-run.

## Plan

1. **Connect the custom domain**
   - Add the domain to Project Settings → Domains.
   - Add the A records for `@` and `www` (and TXT verification) at the registrar.
   - Wait for verification; this is the prerequisite for everything email-related.

2. **Set up the email sender domain**
   - Use the same root domain for sending (e.g., `notify.yourdomain.com`).
   - Complete the email-domain DNS delegation (NS records from Cloud → Emails).
   - Verify the domain status becomes active before attempting any sends.

3. **Fill in lender org branding**
   - Set sender name, reply-to email, logo, and email sign-off for the production lender org.
   - This ensures emails look like they come from the lender, not a generic system.

4. **Wire default campaign activations**
   - Toggle on the relevant seeded campaigns for the lender org.
   - Confirm the daily 9:00 cron has at least one active campaign to send.

5. **Verify GHL new-account plumbing**
   - Confirm the 12 campaign tags have matching workflows/branded templates in the new GHL location.
   - Confirm custom contact fields exist (`sc_value`, `sc_equity`, `sc_campaign_body`, `sucasa_user_id`, `sucasa_language`).

6. **Run a dry-run to a real address you control**
   - Send one campaign email to your own email address.
   - Check rendering, reply-to, unsubscribe, and GHL contact/opportunity creation.

7. **Open the send to the full book**
   - After the dry-run passes, enable the full campaign audience.
   - Monitor the enrichment queue and send log for the first live batch.

## Open questions
- What is the domain name you want to connect?
- Do you want to use that same domain for email sending, or a subdomain like `notify.yourdomain.com`?

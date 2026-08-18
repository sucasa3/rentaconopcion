UPDATE public.lender_orgs
SET
  sender_name = 'SuCasa Demo Lender',
  reply_to_email = 'lender-demo@sucasa.com',
  contact_name = 'SuCasa Demo Lender',
  contact_title = 'Lending Team',
  contact_phone = '(555) 555-5555',
  license_number = 'NMLS 000000',
  signoff = 'We''re here to help you make the most of your home.'
WHERE id = '11111111-1111-1111-1111-111111111111';

INSERT INTO public.campaign_activations (
  lender_org_id,
  campaign_id,
  portfolio_id,
  portfolio_client_id,
  active
)
SELECT
  '11111111-1111-1111-1111-111111111111',
  c.id,
  NULL,
  NULL,
  true
FROM public.campaigns c
WHERE c.active = true
  AND NOT EXISTS (
    SELECT 1
    FROM public.campaign_activations ca
    WHERE ca.lender_org_id = '11111111-1111-1111-1111-111111111111'
      AND ca.campaign_id = c.id
  );
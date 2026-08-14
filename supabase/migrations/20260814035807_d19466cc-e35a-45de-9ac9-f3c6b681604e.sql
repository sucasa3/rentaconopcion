CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.unschedule('property-enrichment-tick') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'property-enrichment-tick');

SELECT cron.schedule(
  'property-enrichment-tick',
  '*/10 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--94429f0c-1687-4b34-81a7-6195279589c3.lovable.app/api/public/enrich/tick',
    headers := '{"Content-Type": "application/json", "apikey": "sb_publishable_dvSA_Juhtj_ETiv5x_iPxQ_mr3rRu-M"}'::jsonb,
    body := '{"batchSize": 10}'::jsonb
  );
  $$
);
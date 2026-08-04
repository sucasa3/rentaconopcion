select cron.unschedule('sucasa-campaigns-tick') where exists (select 1 from cron.job where jobname = 'sucasa-campaigns-tick');

select cron.schedule(
  'sucasa-campaigns-tick',
  '0 9 * * *',
  $$
  select net.http_post(
    url := 'https://project--94429f0c-1687-4b34-81a7-6195279589c3.lovable.app/api/public/campaigns/tick',
    headers := '{"Content-Type": "application/json", "apikey": "sb_publishable_dvSA_Juhtj_ETiv5x_iPxQ_mr3rRu-M"}'::jsonb,
    body := '{"limit": 200}'::jsonb
  );
  $$
);
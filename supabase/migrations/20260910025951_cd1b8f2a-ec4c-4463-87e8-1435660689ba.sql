CREATE TABLE public.cron_tokens (
  job_key text PRIMARY KEY,
  token text NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.cron_tokens TO service_role;

ALTER TABLE public.cron_tokens ENABLE ROW LEVEL SECURITY;

INSERT INTO public.cron_tokens (job_key) VALUES ('rates_tick')
ON CONFLICT (job_key) DO NOTHING;
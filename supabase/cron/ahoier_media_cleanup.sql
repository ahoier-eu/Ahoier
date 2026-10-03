-- Run once as the Supabase project owner after deploying the Edge Function.
-- First store these two values in Supabase Vault (never in this file or Git):
--   ahoier_project_url       = https://YOUR-PROJECT.supabase.co
--   ahoier_cleanup_secret_key = a Supabase secret API key for this project
-- Both pg_cron and pg_net must be enabled in the project.

select cron.schedule(
  'ahoier-media-cleanup',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'ahoier_project_url')
      || '/functions/v1/ahoier-media-cleanup',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'ahoier_cleanup_secret_key')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);

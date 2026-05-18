CREATE OR REPLACE FUNCTION public.notify_telegram_on_generation_complete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _url text;
  _anon_key text;
BEGIN
  IF NEW.status = 'completed'
     AND NEW.output_video_url IS NOT NULL
     AND NEW.output_video_url <> ''
     AND COALESCE(NEW.settings_json->>'telegram_delivered_at', '') = ''
     AND (
       OLD.status IS DISTINCT FROM 'completed'
       OR OLD.output_video_url IS DISTINCT FROM NEW.output_video_url
     ) THEN
    _url := 'https://mziuxsfxevjnmdwnrqjs.supabase.co/functions/v1/studio-telegram-deliver';
    _anon_key := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdHRwczovL216aXV4c2Z4ZXZqbm1kd25ycWpzLnN1cGFiYXNlLmNvL2F1dGgvdjEiLCJyZWYiOiJteml1eHNmeGV2am5tZHducnFqcyIsInJvbGUiOiJhbm9uIiwiaWF0IjoxNzcxMTY4MzM0LCJleHAiOjIwODY3NDQzMzR9.APi_x5YBKa8bOKpjLGiJUBB5qxi3rKKxWiApQAlf78c';

    BEGIN
      PERFORM net.http_post(
        url := _url,
        headers := jsonb_build_object(
          'apikey', _anon_key,
          'Authorization', 'Bearer ' || _anon_key,
          'Content-Type', 'application/json'
        ),
        body := jsonb_build_object('job_id', NEW.id),
        timeout_milliseconds := 30000
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'notify_telegram_on_generation_complete error: %', SQLERRM;
    END;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_notify_telegram_on_generation_complete ON public.generation_jobs;
CREATE TRIGGER trg_notify_telegram_on_generation_complete
AFTER UPDATE OF status, output_video_url ON public.generation_jobs
FOR EACH ROW
EXECUTE FUNCTION public.notify_telegram_on_generation_complete();
CREATE OR REPLACE FUNCTION public.notify_telegram_on_generation_complete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _url text; _anon_key text;
BEGIN
  IF NEW.status = 'completed' AND (OLD.status IS DISTINCT FROM 'completed') AND NEW.output_video_url IS NOT NULL AND NEW.output_video_url <> '' THEN
    _url := 'https://mziuxsfxevjnmdwnrqjs.supabase.co/functions/v1/studio-telegram-deliver';
    _anon_key := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im16aXV4c2Z4ZXZqbm1kd25ycWpzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzExNjgzMzQsImV4cCI6MjA4Njc0NDMzNH0.APi_x5YBKa8bOKpjLGiJUBB5qxi3rKKxWiApQAlf78c';
    BEGIN
      PERFORM net.http_post(url := _url, headers := jsonb_build_object('apikey', _anon_key, 'Authorization', 'Bearer ' || _anon_key, 'Content-Type', 'application/json'), body := jsonb_build_object('job_id', NEW.id), timeout_milliseconds := 30000);
    EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'notify_telegram error: %', SQLERRM; END;
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_notify_telegram_on_generation_complete ON public.generation_jobs;
CREATE TRIGGER trg_notify_telegram_on_generation_complete AFTER UPDATE ON public.generation_jobs FOR EACH ROW EXECUTE FUNCTION public.notify_telegram_on_generation_complete();
-- Exécuter après 16-aide-ia.sql.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE TABLE IF NOT EXISTS public.catch_ai_queue (
 catch_id uuid PRIMARY KEY REFERENCES public.catches(id) ON DELETE CASCADE,
 state text NOT NULL DEFAULT 'pending' CHECK(state IN('pending','processing','done','failed')),
 attempts integer NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.catch_ai_queue ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.catch_ai_queue FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.catch_ai_queue TO authenticated;
GRANT ALL ON public.catch_ai_queue TO service_role;
DROP POLICY IF EXISTS ai_queue_staff ON public.catch_ai_queue;
CREATE POLICY ai_queue_staff ON public.catch_ai_queue FOR SELECT TO authenticated USING(public.is_staff());

CREATE OR REPLACE FUNCTION public.server_wake_catch_ai()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE secret text;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.contest_settings WHERE id=1 AND ai_enabled AND ai_auto_enabled) THEN RETURN; END IF;
 UPDATE public.catch_ai_queue q SET state='failed',updated_at=now() WHERE q.state IN('pending','processing') AND EXISTS(SELECT 1 FROM public.catches c WHERE c.id=q.catch_id AND (c.status<>'pending' OR c.deleted_at IS NOT NULL OR c.purge_started_at IS NOT NULL));
 IF NOT EXISTS(SELECT 1 FROM public.catch_ai_queue WHERE attempts<3 AND (state='pending' OR (state='processing' AND updated_at<now()-interval '2 minutes'))) THEN RETURN; END IF;
 IF (SELECT count(*) FROM public.catch_ai_reviews WHERE started_at>=date_trunc('day',now(),'UTC')) >= (SELECT ai_daily_limit FROM public.contest_settings WHERE id=1) THEN RETURN; END IF;
 SELECT decrypted_secret INTO secret FROM vault.decrypted_secrets WHERE name='sf_ai_webhook_secret' LIMIT 1;
 IF secret IS NULL OR length(secret)<32 THEN RETURN; END IF;
 PERFORM net.http_post(url:='https://poqsalgjouoznsfalagi.supabase.co/functions/v1/analyze-catch',
  headers:=jsonb_build_object('Content-Type','application/json','x-ai-webhook-secret',secret),body:='{"type":"DRAIN"}'::jsonb,timeout_milliseconds:=120000);
END;
$$;
REVOKE ALL ON FUNCTION public.server_wake_catch_ai() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.enqueue_new_catch_ai()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.status='pending' AND NEW.deleted_at IS NULL AND NEW.purge_started_at IS NULL
  AND EXISTS(SELECT 1 FROM public.contest_settings WHERE id=1 AND ai_enabled AND ai_auto_enabled) THEN
  INSERT INTO public.catch_ai_queue(catch_id) VALUES(NEW.id) ON CONFLICT DO NOTHING;
  PERFORM public.server_wake_catch_ai();
 END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.enqueue_new_catch_ai() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS new_catch_ai_queue ON public.catches;
CREATE TRIGGER new_catch_ai_queue AFTER INSERT ON public.catches FOR EACH ROW EXECUTE FUNCTION public.enqueue_new_catch_ai();

CREATE OR REPLACE FUNCTION public.track_catch_ai_queue()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  UPDATE public.catch_ai_queue SET state='processing',attempts=attempts+1,updated_at=now() WHERE catch_id=NEW.catch_id;
 ELSIF NEW.state='done' THEN
  UPDATE public.catch_ai_queue SET state='done',updated_at=now() WHERE catch_id=NEW.catch_id;
 ELSIF NEW.state='failed' THEN
  UPDATE public.catch_ai_queue SET state=CASE WHEN attempts>=3 THEN 'failed' ELSE 'pending' END,updated_at=now() WHERE catch_id=NEW.catch_id;
 END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.track_catch_ai_queue() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS catch_ai_queue_progress ON public.catch_ai_reviews;
CREATE TRIGGER catch_ai_queue_progress AFTER INSERT OR UPDATE OF state ON public.catch_ai_reviews FOR EACH ROW EXECUTE FUNCTION public.track_catch_ai_queue();
DO $$BEGIN
 IF NOT EXISTS(SELECT 1 FROM cron.job WHERE jobname='street-fishing-ai-queue') THEN
  PERFORM cron.schedule('street-fishing-ai-queue','* * * * *','SELECT public.server_wake_catch_ai();');
 END IF;
END$$;
NOTIFY pgrst,'reload schema';
COMMIT;

BEGIN;
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE SCHEMA IF NOT EXISTS staff_push;
REVOKE ALL ON SCHEMA staff_push FROM PUBLIC, anon, authenticated;
CREATE TABLE IF NOT EXISTS staff_push.settings (
 id boolean PRIMARY KEY CHECK(id), dispatch_token text NOT NULL,
 keys jsonb
);
INSERT INTO staff_push.settings(id,dispatch_token) VALUES(true,gen_random_uuid()::text||gen_random_uuid()::text) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS staff_push.devices (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
 endpoint text UNIQUE NOT NULL, subscription jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS staff_push.deliveries (
 device_id uuid REFERENCES staff_push.devices ON DELETE CASCADE,
 message_id uuid REFERENCES public.contest_messages ON DELETE CASCADE,
 retry_at timestamptz NOT NULL DEFAULT now(), attempts integer NOT NULL DEFAULT 0,
 PRIMARY KEY(device_id,message_id)
);
CREATE INDEX IF NOT EXISTS staff_push_retry ON staff_push.deliveries(retry_at);

CREATE OR REPLACE FUNCTION public.staff_push_settings(candidate jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF candidate IS NOT NULL THEN UPDATE staff_push.settings SET keys=candidate WHERE keys IS NULL; END IF;
 RETURN (SELECT jsonb_build_object('keys',keys,'token',dispatch_token) FROM staff_push.settings WHERE id);
END $$;

CREATE OR REPLACE FUNCTION public.staff_push_device(owner uuid, sub jsonb, enable boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT enable THEN DELETE FROM staff_push.devices WHERE owner_id=owner AND endpoint=sub->>'endpoint'; RETURN true; END IF;
 IF NOT (EXISTS(SELECT 1 FROM public.staff_members WHERE user_id=owner) OR EXISTS(SELECT 1 FROM public.teams WHERE owner_user_id=owner AND registration_status NOT IN ('rejected','cancelled'))) THEN RETURN false; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(owner::text,74));
 IF (SELECT count(*) FROM staff_push.devices WHERE owner_id=owner)>=12 AND NOT EXISTS(SELECT 1 FROM staff_push.devices WHERE owner_id=owner AND endpoint=sub->>'endpoint') THEN RETURN false; END IF;
 INSERT INTO staff_push.devices(owner_id,endpoint,subscription) VALUES(owner,sub->>'endpoint',sub)
 ON CONFLICT(endpoint) DO UPDATE SET subscription=excluded.subscription WHERE staff_push.devices.owner_id=excluded.owner_id;
 RETURN FOUND;
END $$;

CREATE OR REPLACE FUNCTION staff_push.enqueue() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.sender_staff AND NEW.hidden_at IS NULL THEN
  INSERT INTO staff_push.deliveries(device_id,message_id)
  SELECT id,NEW.id FROM staff_push.devices WHERE owner_id<>NEW.author_id ON CONFLICT DO NOTHING;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS notify_staff_message ON public.contest_messages;
CREATE TRIGGER notify_staff_message AFTER INSERT ON public.contest_messages FOR EACH ROW EXECUTE FUNCTION staff_push.enqueue();

CREATE OR REPLACE FUNCTION public.staff_push_claim()
RETURNS TABLE(device_id uuid,message_id uuid,subscription jsonb,attempt integer)
LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 WITH batch AS (
  SELECT q.device_id,q.message_id FROM staff_push.deliveries q
  JOIN staff_push.devices d ON d.id=q.device_id JOIN public.contest_messages m ON m.id=q.message_id
  WHERE q.retry_at<=now() AND q.attempts<8 AND m.sender_staff AND m.hidden_at IS NULL
  AND m.created_at>now()-interval '6 hours'
  AND (EXISTS(SELECT 1 FROM public.staff_members WHERE user_id=d.owner_id) OR EXISTS(SELECT 1 FROM public.teams WHERE owner_user_id=d.owner_id AND registration_status NOT IN ('rejected','cancelled')))
  ORDER BY q.retry_at LIMIT 50 FOR UPDATE OF q SKIP LOCKED
 ), claimed AS (
  UPDATE staff_push.deliveries q SET attempts=q.attempts+1,retry_at=now()+interval '2 minutes'
  FROM batch b WHERE q.device_id=b.device_id AND q.message_id=b.message_id RETURNING q.*
 ) SELECT c.device_id,c.message_id,d.subscription,c.attempts FROM claimed c JOIN staff_push.devices d ON d.id=c.device_id;
$$;
CREATE OR REPLACE FUNCTION public.staff_push_finish(device uuid,msg uuid,attempt_no integer,outcome text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF outcome='expired' THEN DELETE FROM staff_push.devices WHERE id=device;
 ELSIF outcome='done' THEN DELETE FROM staff_push.deliveries WHERE device_id=device AND message_id=msg AND attempts=attempt_no;
 ELSE UPDATE staff_push.deliveries SET retry_at=now()+make_interval(mins=>least(30,attempts*2)) WHERE device_id=device AND message_id=msg AND attempts=attempt_no;
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.staff_push_settings(jsonb),public.staff_push_device(uuid,jsonb,boolean),public.staff_push_claim(),public.staff_push_finish(uuid,uuid,integer,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.staff_push_settings(jsonb),public.staff_push_device(uuid,jsonb,boolean),public.staff_push_claim(),public.staff_push_finish(uuid,uuid,integer,text) TO service_role;

CREATE OR REPLACE FUNCTION public.latest_staff_alert()
RETURNS TABLE(id uuid,body text,created_at timestamptz) LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT m.id,m.body,m.created_at FROM public.contest_messages m
 WHERE public.can_use_contest_chat() AND m.sender_staff AND m.author_id<>auth.uid() AND m.hidden_at IS NULL
 ORDER BY m.created_at DESC,m.id DESC LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.latest_staff_alert() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.latest_staff_alert() TO authenticated;

CREATE OR REPLACE FUNCTION staff_push.tick() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 DELETE FROM staff_push.deliveries q USING public.contest_messages m WHERE q.message_id=m.id AND (m.created_at<=now()-interval '6 hours' OR m.hidden_at IS NOT NULL OR q.attempts>=8 AND q.retry_at<=now());
 IF EXISTS(SELECT 1 FROM staff_push.deliveries WHERE retry_at<=now()) THEN
  PERFORM net.http_post(url:='https://poqsalgjouoznsfalagi.supabase.co/functions/v1/staff-notifications',
   headers:=jsonb_build_object('Content-Type','application/json','x-dispatch-token',(SELECT dispatch_token FROM staff_push.settings WHERE id)),
   body:='{"action":"dispatch"}'::jsonb,timeout_milliseconds:=55000);
 END IF;
END $$;
REVOKE ALL ON FUNCTION staff_push.tick(),staff_push.enqueue() FROM PUBLIC,anon,authenticated;
SELECT cron.schedule('staff-message-notifications','* * * * *','SELECT staff_push.tick()');
NOTIFY pgrst,'reload schema';
COMMIT;

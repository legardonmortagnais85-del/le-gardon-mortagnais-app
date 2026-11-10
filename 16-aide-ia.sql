BEGIN;
ALTER TABLE public.contest_settings ADD COLUMN IF NOT EXISTS ai_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE public.contest_settings ADD COLUMN IF NOT EXISTS ai_auto_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE public.contest_settings ADD COLUMN IF NOT EXISTS ai_daily_limit integer NOT NULL DEFAULT 200;
CREATE TABLE IF NOT EXISTS public.catch_ai_reviews (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 catch_id uuid NOT NULL REFERENCES public.catches(id) ON DELETE CASCADE,
 staff_id uuid NOT NULL,
 photo_path text NOT NULL,
 model text NOT NULL,
 prompt_version text NOT NULL,
 state text NOT NULL CHECK(state IN('processing','done','failed')),
 result jsonb,
 started_at timestamptz NOT NULL DEFAULT now(),
 finished_at timestamptz
);
CREATE INDEX IF NOT EXISTS catch_ai_reviews_catch ON public.catch_ai_reviews(catch_id,started_at DESC);
CREATE INDEX IF NOT EXISTS catch_ai_reviews_time ON public.catch_ai_reviews(started_at DESC);
ALTER TABLE public.catch_ai_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.catch_ai_reviews FROM anon,authenticated;
GRANT SELECT ON public.catch_ai_reviews TO authenticated;
GRANT ALL ON public.catch_ai_reviews TO service_role;
DROP POLICY IF EXISTS ai_reviews_staff ON public.catch_ai_reviews;
CREATE POLICY ai_reviews_staff ON public.catch_ai_reviews FOR SELECT TO authenticated USING(public.is_staff());

CREATE OR REPLACE FUNCTION public.staff_get_ai_settings()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_staff() THEN RAISE EXCEPTION 'Accès réservé au staff'; END IF;
 RETURN (SELECT jsonb_build_object('enabled',s.ai_enabled,'automatic',s.ai_auto_enabled,'daily_limit',s.ai_daily_limit,
 'used_today',(SELECT count(*) FROM public.catch_ai_reviews r WHERE r.started_at>=date_trunc('day',now(),'UTC')))
 FROM public.contest_settings s WHERE s.id=1);
END;
$$;
REVOKE ALL ON FUNCTION public.staff_get_ai_settings() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.staff_get_ai_settings() TO authenticated;

CREATE OR REPLACE FUNCTION public.staff_set_ai_settings(p_enabled boolean,p_daily_limit integer,p_automatic boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_staff() THEN RAISE EXCEPTION 'Accès réservé au staff'; END IF;
 IF p_automatic IS NULL OR p_enabled IS NULL OR p_daily_limit IS NULL OR p_daily_limit NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'Limite de 1 à 1000 analyses par jour'; END IF;
 UPDATE public.contest_settings SET ai_enabled=p_enabled,ai_auto_enabled=(p_enabled AND p_automatic),ai_daily_limit=p_daily_limit,updated_at=now() WHERE id=1;
 IF NOT FOUND THEN RAISE EXCEPTION 'Réglages absents'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.staff_set_ai_settings(boolean,integer,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.staff_set_ai_settings(boolean,integer,boolean) TO authenticated;

-- Réservation atomique côté serveur : aucun participant ne peut la déclencher directement.
CREATE OR REPLACE FUNCTION public.server_claim_catch_ai(p_catch_id uuid,p_staff_id uuid,p_model text,p_prompt_version text,p_automatic boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE cfg record; photo text; cached record; review_id uuid;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.staff_members WHERE user_id=p_staff_id) THEN RAISE EXCEPTION 'Accès réservé au staff'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(2027,16);
 SELECT ai_enabled,ai_auto_enabled,ai_daily_limit INTO cfg FROM public.contest_settings WHERE id=1;
 IF cfg.ai_enabled IS DISTINCT FROM true THEN RAISE EXCEPTION 'Aide IA désactivée dans les réglages staff'; END IF;
 IF p_automatic AND cfg.ai_auto_enabled IS DISTINCT FROM true THEN RAISE EXCEPTION 'Analyse automatique désactivée'; END IF;
 SELECT photo_path INTO photo FROM public.catches WHERE id=p_catch_id AND deleted_at IS NULL AND purge_started_at IS NULL AND (NOT p_automatic OR status='pending');
 IF photo IS NULL OR photo='' THEN RAISE EXCEPTION 'Prise ou photo indisponible'; END IF;
 SELECT * INTO cached FROM public.catch_ai_reviews WHERE catch_id=p_catch_id AND photo_path=photo AND model=p_model AND prompt_version=p_prompt_version AND state='done' ORDER BY started_at DESC LIMIT 1;
 IF FOUND THEN RETURN jsonb_build_object('state','cached','result',cached.result,'id',cached.id,'photo_path',photo); END IF;
 IF EXISTS(SELECT 1 FROM public.catch_ai_reviews WHERE catch_id=p_catch_id AND state='processing' AND started_at>now()-interval '2 minutes') THEN RAISE EXCEPTION 'Analyse déjà en cours pour cette prise'; END IF;
 IF (SELECT count(*) FROM public.catch_ai_reviews WHERE started_at>=date_trunc('day',now(),'UTC'))>=cfg.ai_daily_limit THEN RAISE EXCEPTION 'Limite quotidienne IA atteinte'; END IF;
 IF NOT p_automatic AND (SELECT count(*) FROM public.catch_ai_reviews WHERE staff_id=p_staff_id AND started_at>now()-interval '1 minute')>=10 THEN RAISE EXCEPTION 'Attends une minute avant de relancer une analyse'; END IF;
 IF (SELECT count(*) FROM public.catch_ai_reviews WHERE state='processing' AND started_at>now()-interval '2 minutes')>=3 THEN RAISE EXCEPTION 'Trois analyses sont déjà en cours. Réessaie dans un instant'; END IF;
 INSERT INTO public.catch_ai_reviews(catch_id,staff_id,photo_path,model,prompt_version,state) VALUES(p_catch_id,p_staff_id,photo,p_model,p_prompt_version,'processing') RETURNING id INTO review_id;
 RETURN jsonb_build_object('state','claimed','id',review_id,'photo_path',photo);
END;
$$;
REVOKE ALL ON FUNCTION public.server_claim_catch_ai(uuid,uuid,text,text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.server_claim_catch_ai(uuid,uuid,text,text,boolean) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;

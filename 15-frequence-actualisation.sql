BEGIN;
ALTER TABLE public.contest_settings ADD COLUMN IF NOT EXISTS refresh_seconds integer NOT NULL DEFAULT 15;
ALTER TABLE public.contest_settings DROP CONSTRAINT IF EXISTS contest_refresh_seconds_range;
ALTER TABLE public.contest_settings ADD CONSTRAINT contest_refresh_seconds_range CHECK(refresh_seconds BETWEEN 1 AND 300);
CREATE OR REPLACE FUNCTION public.get_app_refresh_seconds()
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce((SELECT refresh_seconds FROM public.contest_settings WHERE id=1),15);
$$;
REVOKE ALL ON FUNCTION public.get_app_refresh_seconds() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_app_refresh_seconds() TO anon,authenticated;
CREATE OR REPLACE FUNCTION public.staff_set_app_refresh_seconds(p_seconds integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_staff() THEN RAISE EXCEPTION 'Accès réservé au staff'; END IF;
 IF p_seconds IS NULL OR p_seconds NOT BETWEEN 1 AND 300 THEN RAISE EXCEPTION 'Choisis une durée entre 1 et 300 secondes'; END IF;
 UPDATE public.contest_settings SET refresh_seconds=p_seconds,updated_at=now() WHERE id=1;
 IF NOT FOUND THEN RAISE EXCEPTION 'Réglages du concours absents'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.staff_set_app_refresh_seconds(integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.staff_set_app_refresh_seconds(integer) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;

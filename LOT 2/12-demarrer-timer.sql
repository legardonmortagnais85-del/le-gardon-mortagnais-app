-- Exécuter après 11-ouverture-prises.sql.
BEGIN;
CREATE OR REPLACE FUNCTION public.staff_start_contest_timer(p_minutes integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_staff() THEN RAISE EXCEPTION 'Accès réservé au staff'; END IF;
 IF p_minutes IS NULL OR p_minutes<1 OR p_minutes>1440 THEN RAISE EXCEPTION 'Durée de 1 à 1440 minutes'; END IF;
 UPDATE public.contest_settings SET catch_mode='scheduled',contest_open=true,
 catches_open_at=now(),catches_close_at=now()+pg_catalog.make_interval(mins=>p_minutes),updated_at=now() WHERE id=1;
 IF NOT FOUND THEN RAISE EXCEPTION 'Réglages du concours absents'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.staff_start_contest_timer(integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.staff_start_contest_timer(integer) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;

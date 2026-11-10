-- Exécuter après les migrations précédentes. Aucune prise supprimée.
BEGIN;
ALTER TABLE public.contest_settings ADD COLUMN IF NOT EXISTS catch_mode text NOT NULL DEFAULT 'manual';
ALTER TABLE public.contest_settings ADD COLUMN IF NOT EXISTS catches_open_at timestamptz;
ALTER TABLE public.contest_settings ADD COLUMN IF NOT EXISTS catches_close_at timestamptz;

CREATE OR REPLACE FUNCTION public.get_catch_window()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('mode',s.catch_mode,'opens_at',s.catches_open_at,'closes_at',s.catches_close_at,
 'is_open',CASE WHEN s.catch_mode='scheduled' THEN s.catches_open_at IS NOT NULL AND s.catches_close_at IS NOT NULL AND now()>=s.catches_open_at AND now()<s.catches_close_at ELSE s.contest_open END,
 'server_now',now()) FROM public.contest_settings s WHERE s.id=1;
$$;
REVOKE ALL ON FUNCTION public.get_catch_window() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_catch_window() TO authenticated;

CREATE OR REPLACE FUNCTION public.staff_set_catch_window(p_mode text,p_open boolean,p_start text DEFAULT NULL,p_end text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_start timestamptz;v_end timestamptz;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_staff() THEN RAISE EXCEPTION 'Accès réservé au staff'; END IF;
 IF p_mode IS NULL OR p_mode NOT IN ('manual','scheduled') OR p_open IS NULL THEN RAISE EXCEPTION 'Mode invalide'; END IF;
 IF p_mode='scheduled' THEN
  -- Les dates saisies sont toujours interprétées à l’heure de Paris, été/hiver inclus.
  v_start:=p_start::timestamp AT TIME ZONE 'Europe/Paris';
  v_end:=p_end::timestamp AT TIME ZONE 'Europe/Paris';
  IF v_start IS NULL OR v_end IS NULL OR v_end<=v_start THEN RAISE EXCEPTION 'La fermeture doit être après l’ouverture'; END IF;
 END IF;
 UPDATE public.contest_settings SET catch_mode=p_mode,
 contest_open=CASE WHEN p_mode='scheduled' THEN true ELSE p_open END,
 catches_open_at=CASE WHEN p_mode='scheduled' THEN v_start ELSE catches_open_at END,
 catches_close_at=CASE WHEN p_mode='scheduled' THEN v_end ELSE catches_close_at END,updated_at=now() WHERE id=1;
 IF NOT FOUND THEN RAISE EXCEPTION 'Réglages du concours absents'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.staff_set_catch_window(text,boolean,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.staff_set_catch_window(text,boolean,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.enforce_catch_window()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT coalesce((public.get_catch_window()->>'is_open')::boolean,false) THEN
  RAISE EXCEPTION 'Les déclarations de prises sont fermées. Le staff peut les rouvrir.';
 END IF;
 RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS enforce_catch_window ON public.catches;
CREATE TRIGGER enforce_catch_window BEFORE INSERT ON public.catches FOR EACH ROW EXECUTE FUNCTION public.enforce_catch_window();
NOTIFY pgrst,'reload schema';
COMMIT;

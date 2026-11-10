BEGIN;
ALTER TABLE public.contest_settings
 ADD COLUMN IF NOT EXISTS gallery_allowed boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.get_gallery_permission()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce((SELECT gallery_allowed FROM public.contest_settings WHERE id=1),false);
$$;
REVOKE ALL ON FUNCTION public.get_gallery_permission() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_gallery_permission() TO authenticated;

CREATE OR REPLACE FUNCTION public.staff_set_gallery_permission(p_enabled boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_staff() THEN
  RAISE EXCEPTION 'Accès réservé au staff';
 END IF;
 IF p_enabled IS NULL THEN RAISE EXCEPTION 'Choisis un réglage valide'; END IF;
 UPDATE public.contest_settings SET gallery_allowed=p_enabled,updated_at=now() WHERE id=1;
 IF NOT FOUND THEN RAISE EXCEPTION 'Réglages du concours absents'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.staff_set_gallery_permission(boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.staff_set_gallery_permission(boolean) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;

-- Exécuter APRÈS 01-suppression-staff.sql dans Supabase > SQL Editor.
BEGIN;
ALTER TABLE public.catches ADD COLUMN IF NOT EXISTS purge_started_at timestamptz;
REVOKE UPDATE (purge_started_at) ON public.catches FROM anon, authenticated;
CREATE OR REPLACE FUNCTION public.staff_purge_catch(p_catch_id uuid, p_finalize boolean DEFAULT false)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v public.catches%ROWTYPE;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_staff() THEN RAISE EXCEPTION 'Accès réservé au staff'; END IF;
 SELECT * INTO v FROM public.catches WHERE id=p_catch_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Prise introuvable ou déjà supprimée'; END IF;
 IF v.deleted_at IS NULL THEN RAISE EXCEPTION 'Placez cette prise dans la corbeille avant de la supprimer définitivement'; END IF;
 IF p_finalize THEN
  IF v.purge_started_at IS NULL THEN RAISE EXCEPTION 'Suppression non préparée'; END IF;
  DELETE FROM public.catches WHERE id=p_catch_id;
 ELSE
  UPDATE public.catches SET purge_started_at=coalesce(purge_started_at,now()) WHERE id=p_catch_id;
 END IF;
 RETURN v.photo_path;
END;
$$;
REVOKE ALL ON FUNCTION public.staff_purge_catch(uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.staff_purge_catch(uuid,boolean) TO authenticated;
CREATE OR REPLACE FUNCTION public.guard_purging_catch()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.purge_started_at IS NOT NULL THEN RAISE EXCEPTION 'État de suppression invalide'; END IF;
 ELSIF OLD.purge_started_at IS NOT NULL AND
   (NEW.deleted_at IS NULL OR NEW.purge_started_at IS NULL OR NEW.status <> 'rejected') THEN
  RAISE EXCEPTION 'Suppression définitive engagée : terminez la suppression';
 END IF;
 RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS zz_guard_purging_catch ON public.catches;
CREATE TRIGGER zz_guard_purging_catch BEFORE INSERT OR UPDATE ON public.catches
 FOR EACH ROW EXECUTE FUNCTION public.guard_purging_catch();
-- Autorise uniquement le staff à effacer les photos des prises en cours de purge.
DROP POLICY IF EXISTS staff_delete_trashed_catch_photo ON storage.objects;
CREATE POLICY staff_delete_trashed_catch_photo ON storage.objects
 FOR DELETE TO authenticated
 USING (bucket_id='photos-prises' AND public.is_staff() AND EXISTS (
  SELECT 1 FROM public.catches c WHERE c.photo_path=storage.objects.name
   AND c.deleted_at IS NOT NULL AND c.purge_started_at IS NOT NULL
 ));
COMMIT;

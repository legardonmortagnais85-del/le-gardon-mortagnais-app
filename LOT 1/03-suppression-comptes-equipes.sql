-- Exécuter dans Supabase SQL Editor avant de déployer cette version.
-- Installe la fonctionnalité ; ne supprime aucun compte à l'exécution.
BEGIN;
CREATE TABLE IF NOT EXISTS public.participant_deletions (
 user_id uuid PRIMARY KEY,
 requested_by uuid NOT NULL,
 started_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.participant_deletions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.participant_deletions FROM anon,authenticated;

CREATE OR REPLACE FUNCTION public.guard_participant_deletion()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE target uuid;
BEGIN
 IF TG_TABLE_NAME='teams' THEN target:=NEW.owner_user_id;
 ELSE SELECT owner_user_id INTO target FROM public.teams WHERE id=NEW.team_id;
 END IF;
 IF EXISTS(SELECT 1 FROM public.participant_deletions WHERE user_id=target) THEN
  RAISE EXCEPTION 'Suppression du compte engagée : les nouvelles inscriptions et prises sont bloquées';
 END IF;
 RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS guard_deleting_participant_team ON public.teams;
CREATE TRIGGER guard_deleting_participant_team BEFORE INSERT OR UPDATE OF owner_user_id
 ON public.teams FOR EACH ROW EXECUTE FUNCTION public.guard_participant_deletion();
DROP TRIGGER IF EXISTS guard_deleting_participant_catch ON public.catches;
CREATE TRIGGER guard_deleting_participant_catch BEFORE INSERT OR UPDATE OF team_id
 ON public.catches FOR EACH ROW EXECUTE FUNCTION public.guard_participant_deletion();

CREATE OR REPLACE FUNCTION public.staff_delete_participant(p_team_id uuid,p_finalize boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE target uuid; paths jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_staff() THEN RAISE EXCEPTION 'Accès réservé au staff'; END IF;
 SELECT owner_user_id INTO target FROM public.teams WHERE id=p_team_id FOR UPDATE;
 IF NOT FOUND OR target IS NULL THEN RAISE EXCEPTION 'Équipe introuvable ou sans compte participant associé'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(target::text,2027));
 IF target=auth.uid() OR EXISTS(SELECT 1 FROM public.staff_members WHERE user_id=target) THEN
  RAISE EXCEPTION 'La suppression des comptes staff est interdite';
 END IF;
 SELECT coalesce(jsonb_agg(DISTINCT c.photo_path) FILTER(WHERE c.photo_path IS NOT NULL),'[]'::jsonb)
 INTO paths FROM public.catches c JOIN public.teams t ON t.id=c.team_id WHERE t.owner_user_id=target;
 IF NOT p_finalize THEN
  INSERT INTO public.participant_deletions(user_id,requested_by)
  VALUES(target,auth.uid()) ON CONFLICT(user_id) DO NOTHING;
 ELSE
  IF NOT EXISTS(SELECT 1 FROM public.participant_deletions WHERE user_id=target) THEN
   RAISE EXCEPTION 'Suppression non préparée';
  END IF;
  IF EXISTS(SELECT 1 FROM storage.objects o WHERE o.bucket_id='photos-prises' AND o.name IN (
   SELECT c.photo_path FROM public.catches c JOIN public.teams t ON t.id=c.team_id WHERE t.owner_user_id=target
  )) THEN RAISE EXCEPTION 'Des photos restent à effacer : réessayez la suppression'; END IF;
  DELETE FROM public.catches WHERE team_id IN(SELECT id FROM public.teams WHERE owner_user_id=target);
  DELETE FROM public.payments WHERE team_id IN(SELECT id FROM public.teams WHERE owner_user_id=target);
  DELETE FROM public.teams WHERE owner_user_id=target;
  DELETE FROM auth.users WHERE id=target;
  DELETE FROM public.participant_deletions WHERE user_id=target;
 END IF;
 RETURN jsonb_build_object('photo_paths',paths);
END;
$$;
REVOKE ALL ON FUNCTION public.staff_delete_participant(uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.staff_delete_participant(uuid,boolean) TO authenticated;
-- La politique Storage doit pouvoir tester le marqueur sans exposer la table.
CREATE OR REPLACE FUNCTION public.participant_deletion_started(p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT public.is_staff() AND EXISTS(SELECT 1 FROM public.participant_deletions WHERE user_id=p_user_id);
$$;
REVOKE ALL ON FUNCTION public.participant_deletion_started(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.participant_deletion_started(uuid) TO authenticated;
DROP POLICY IF EXISTS staff_delete_participant_photos ON storage.objects;
CREATE POLICY staff_delete_participant_photos ON storage.objects FOR DELETE TO authenticated
 USING(bucket_id='photos-prises' AND public.is_staff() AND EXISTS(
  SELECT 1 FROM public.catches c JOIN public.teams t ON t.id=c.team_id
  WHERE c.photo_path=storage.objects.name AND public.participant_deletion_started(t.owner_user_id)
 ));
NOTIFY pgrst,'reload schema';
COMMIT;

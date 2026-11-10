-- 40 équipes CONFIRMÉES maximum. Les demandes en attente ne réservent plus de place.
-- Exécuter une fois dans le projet du concours, avant publication des nouveaux fichiers.
BEGIN;
DO $$ BEGIN
 IF (SELECT count(*) FROM public.teams WHERE registration_status='confirmed')>40 THEN
  RAISE EXCEPTION 'Plus de 40 équipes confirmées existent : vérifier avant de modifier la capacité';
 END IF;
 IF EXISTS(SELECT 1 FROM public.teams WHERE registration_status='confirmed' AND (team_number IS NULL OR team_number>40)) THEN
  RAISE EXCEPTION 'Un numéro confirmé est absent ou dépasse 40 : corriger la numérotation existante';
 END IF;
END $$;
UPDATE public.teams SET team_number=NULL WHERE registration_status<>'confirmed';

CREATE OR REPLACE FUNCTION public.guard_team_capacity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE slot integer;
BEGIN
 PERFORM pg_catalog.pg_advisory_xact_lock(2027,1);
 IF NEW.registration_status='confirmed' THEN
  IF (SELECT count(*) FROM public.teams WHERE registration_status='confirmed' AND id<>NEW.id)>=40 THEN
   RAISE EXCEPTION 'Les 40 places sont déjà confirmées';
  END IF;
  IF NEW.team_number IS NULL THEN
   SELECT n INTO slot FROM pg_catalog.generate_series(1,40) n
   WHERE NOT EXISTS(SELECT 1 FROM public.teams t WHERE t.team_number=n AND t.id<>NEW.id)
   ORDER BY n LIMIT 1;
   IF slot IS NULL THEN RAISE EXCEPTION 'Aucun numéro disponible entre 1 et 40'; END IF;
   NEW.team_number:=slot;
  END IF;
  IF NEW.team_number NOT BETWEEN 1 AND 40 THEN RAISE EXCEPTION 'Numéro d’équipe compris entre 1 et 40 attendu'; END IF;
 ELSE NEW.team_number:=NULL;
 END IF;
 RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS guard_team_capacity ON public.teams;
CREATE TRIGGER guard_team_capacity BEFORE INSERT OR UPDATE OF registration_status,team_number
 ON public.teams FOR EACH ROW EXECUTE FUNCTION public.guard_team_capacity();

CREATE OR REPLACE FUNCTION public.register_duo(
 p_team_name text,p_captain_first_name text,p_captain_last_name text,p_captain_phone text,
 p_partner_first_name text,p_partner_last_name text,p_partner_email text,p_partner_phone text
)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE uid uuid:=auth.uid(); email text;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Connecte-toi avant de t’inscrire'; END IF;
 SELECT u.email INTO email FROM auth.users u WHERE u.id=uid AND u.email_confirmed_at IS NOT NULL;
 IF email IS NULL THEN RAISE EXCEPTION 'Confirme ton adresse e-mail avant de t’inscrire'; END IF;
 IF EXISTS(SELECT 1 FROM public.staff_members WHERE user_id=uid) THEN RAISE EXCEPTION 'Utilise un compte pêcheur distinct du compte staff'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.contest_settings WHERE id=1 AND registration_open) THEN RAISE EXCEPTION 'Les inscriptions sont fermées'; END IF;
 IF length(trim(coalesce(p_team_name,''))) NOT BETWEEN 2 AND 70
 OR length(trim(coalesce(p_captain_first_name,''))) NOT BETWEEN 2 AND 70
 OR length(trim(coalesce(p_captain_last_name,''))) NOT BETWEEN 2 AND 70
 OR length(trim(coalesce(p_partner_first_name,''))) NOT BETWEEN 2 AND 70
 OR length(trim(coalesce(p_partner_last_name,''))) NOT BETWEEN 2 AND 70
 OR length(trim(coalesce(p_captain_phone,''))) NOT BETWEEN 6 AND 30
 OR length(trim(coalesce(p_partner_phone,''))) NOT BETWEEN 6 AND 30
 OR length(trim(coalesce(p_partner_email,''))) NOT BETWEEN 5 AND 254
 OR trim(p_partner_email) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
  RAISE EXCEPTION 'Vérifie les informations des deux pêcheurs';
 END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(2027,1);
 IF EXISTS(SELECT 1 FROM public.teams WHERE owner_user_id=uid) THEN RAISE EXCEPTION 'Ce compte possède déjà une équipe'; END IF;
 IF (SELECT count(*) FROM public.teams WHERE registration_status='confirmed')>=40 THEN RAISE EXCEPTION 'Les 40 places sont déjà confirmées'; END IF;
 INSERT INTO public.teams(team_number,team_name,captain_first_name,captain_last_name,captain_email,captain_phone,partner_first_name,partner_last_name,partner_email,partner_phone,owner_user_id,registration_status)
 VALUES(NULL,trim(p_team_name),trim(p_captain_first_name),trim(p_captain_last_name),email,trim(p_captain_phone),trim(p_partner_first_name),trim(p_partner_last_name),trim(p_partner_email),trim(p_partner_phone),uid,'pending');
 -- 0 = demande en attente, numéro attribué uniquement lors de la confirmation.
 RETURN 0;
END;
$$;
REVOKE ALL ON FUNCTION public.register_duo(text,text,text,text,text,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.register_duo(text,text,text,text,text,text,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.staff_set_registration(p_team_id uuid,p_status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_staff() THEN RAISE EXCEPTION 'Accès réservé au staff'; END IF;
 IF p_status NOT IN('confirmed','rejected') THEN RAISE EXCEPTION 'Statut non autorisé'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(2027,1);
 UPDATE public.teams SET registration_status=p_status WHERE id=p_team_id AND registration_status='pending';
 IF NOT FOUND THEN RAISE EXCEPTION 'Équipe introuvable ou déjà traitée'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.staff_set_registration(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.staff_set_registration(uuid,text) TO authenticated;

-- Empêche une finalisation de purge laissant une photo stockée sans prise associée.
CREATE OR REPLACE FUNCTION public.staff_purge_catch(p_catch_id uuid,p_finalize boolean DEFAULT false)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v public.catches%ROWTYPE;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_staff() THEN RAISE EXCEPTION 'Accès réservé au staff'; END IF;
 SELECT * INTO v FROM public.catches WHERE id=p_catch_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Prise introuvable ou déjà supprimée'; END IF;
 IF v.deleted_at IS NULL THEN RAISE EXCEPTION 'Place cette prise dans la corbeille avant de la supprimer définitivement'; END IF;
 IF p_finalize THEN
  IF v.purge_started_at IS NULL THEN RAISE EXCEPTION 'Suppression non préparée'; END IF;
  IF EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='photos-prises' AND name=v.photo_path) THEN
   RAISE EXCEPTION 'La photo reste stockée. Réessaie pour terminer la suppression';
  END IF;
  DELETE FROM public.catches WHERE id=p_catch_id;
 ELSE UPDATE public.catches SET purge_started_at=coalesce(purge_started_at,now()) WHERE id=p_catch_id;
 END IF;
 RETURN v.photo_path;
END;
$$;
REVOKE ALL ON FUNCTION public.staff_purge_catch(uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.staff_purge_catch(uuid,boolean) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
SELECT count(*) FILTER(WHERE registration_status='confirmed') AS equipes_confirmees,
 40-count(*) FILTER(WHERE registration_status='confirmed') AS places_disponibles
 FROM public.teams;

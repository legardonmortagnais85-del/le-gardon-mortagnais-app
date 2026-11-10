-- Modification des informations d’équipe réservée au staff.
BEGIN;
CREATE OR REPLACE FUNCTION public.staff_update_team(
 p_team_id uuid,
 p_team_name text,
 p_captain_first_name text,
 p_captain_last_name text,
 p_captain_phone text,
 p_partner_first_name text,
 p_partner_last_name text,
 p_partner_email text,
 p_partner_phone text
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE owner_id uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_staff() THEN RAISE EXCEPTION 'Accès réservé au staff'; END IF;
 SELECT owner_user_id INTO owner_id FROM public.teams WHERE id=p_team_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Équipe introuvable'; END IF;
 IF EXISTS(SELECT 1 FROM public.participant_deletions WHERE user_id=owner_id) THEN
  RAISE EXCEPTION 'Suppression de ce compte déjà engagée';
 END IF;
 IF length(trim(coalesce(p_team_name,''))) NOT BETWEEN 2 AND 70
 OR length(trim(coalesce(p_captain_first_name,''))) NOT BETWEEN 2 AND 70
 OR length(trim(coalesce(p_captain_last_name,''))) NOT BETWEEN 2 AND 70
 OR length(trim(coalesce(p_partner_first_name,''))) NOT BETWEEN 2 AND 70
 OR length(trim(coalesce(p_partner_last_name,''))) NOT BETWEEN 2 AND 70
 OR length(trim(coalesce(p_captain_phone,''))) NOT BETWEEN 6 AND 30
 OR length(trim(coalesce(p_partner_phone,''))) NOT BETWEEN 6 AND 30
 OR length(trim(coalesce(p_partner_email,''))) NOT BETWEEN 5 AND 254
 OR trim(p_partner_email) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
  RAISE EXCEPTION 'Vérifie le nom de l’équipe et les coordonnées des deux pêcheurs';
 END IF;
 UPDATE public.teams SET
 team_name=trim(p_team_name),
 captain_first_name=trim(p_captain_first_name),
 captain_last_name=trim(p_captain_last_name),
 captain_phone=trim(p_captain_phone),
 partner_first_name=trim(p_partner_first_name),
 partner_last_name=trim(p_partner_last_name),
 partner_email=trim(p_partner_email),
 partner_phone=trim(p_partner_phone)
 WHERE id=p_team_id;
END;
$$;
REVOKE ALL ON FUNCTION public.staff_update_team(uuid,text,text,text,text,text,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.staff_update_team(uuid,text,text,text,text,text,text,text,text) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;

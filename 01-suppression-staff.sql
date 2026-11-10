-- À exécuter UNE FOIS dans Supabase > SQL Editor AVANT de déployer le site.
BEGIN;
ALTER TABLE public.catches ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.catches ADD COLUMN IF NOT EXISTS deleted_by uuid;
-- Les colonnes de corbeille sont modifiées seulement par les fonctions ci-dessous.
REVOKE UPDATE (deleted_at, deleted_by) ON public.catches FROM anon, authenticated;
CREATE OR REPLACE FUNCTION public.staff_trash_catch(p_catch_id uuid, p_restore boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_deleted timestamptz;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_staff() THEN
  RAISE EXCEPTION 'Accès réservé au staff';
 END IF;
 SELECT deleted_at INTO v_deleted FROM public.catches WHERE id=p_catch_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Prise introuvable'; END IF;
 IF p_restore THEN
  IF v_deleted IS NULL THEN RAISE EXCEPTION 'Cette prise a déjà été restaurée'; END IF;
  -- Une restauration repasse par le contrôle du staff et ne recrédite pas de points.
  UPDATE public.catches SET deleted_at=NULL, deleted_by=NULL, status='pending'
   WHERE id=p_catch_id;
 ELSE
  IF v_deleted IS NOT NULL THEN RAISE EXCEPTION 'Cette prise est déjà dans la corbeille'; END IF;
  UPDATE public.catches SET deleted_at=now(), deleted_by=auth.uid(), status='rejected'
   WHERE id=p_catch_id;
 END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.staff_trash_catch(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_trash_catch(uuid, boolean) TO authenticated;
-- Empêche qu'une correction concurrente réactive une prise mise à la corbeille.
CREATE OR REPLACE FUNCTION public.guard_trashed_catch()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
 IF NEW.deleted_at IS NOT NULL AND NEW.status <> 'rejected' THEN
  RAISE EXCEPTION 'Restaurez cette prise depuis la corbeille avant de la modifier';
 END IF;
 IF TG_OP='INSERT' AND (NEW.deleted_at IS NOT NULL OR NEW.deleted_by IS NOT NULL) THEN
  RAISE EXCEPTION 'Une nouvelle prise ne peut pas être dans la corbeille';
 END IF;
 RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS zz_guard_trashed_catch ON public.catches;
CREATE TRIGGER zz_guard_trashed_catch BEFORE INSERT OR UPDATE ON public.catches
 FOR EACH ROW EXECUTE FUNCTION public.guard_trashed_catch();
-- Le statut rejected exclut déjà la prise du barème actuel ; ce filtre protège
-- aussi le classement au cas où les règles de statut évolueraient.
CREATE OR REPLACE FUNCTION public.get_ranking()
RETURNS TABLE (team_number integer, team_name text, catch_count bigint, points bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT t.team_number,t.team_name,count(c.id),coalesce(sum(c.length_mm),0)::bigint
 FROM public.teams t
 LEFT JOIN public.catches c ON c.team_id=t.id AND c.status='approved' AND c.deleted_at IS NULL
 WHERE t.registration_status='confirmed'
 AND (public.is_staff() OR EXISTS(SELECT 1 FROM public.contest_settings s WHERE s.id=1 AND s.ranking_visible))
 GROUP BY t.id,t.team_number,t.team_name
 ORDER BY 4 DESC,3 DESC,t.team_number ASC;
$$;
REVOKE ALL ON FUNCTION public.get_ranking() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_ranking() TO authenticated;
COMMIT;

-- 5 espèces, bonus de diversité : 300 points pour 3/4, 500 pour 5 (non cumulés).
-- Exécuter après 06-coefficients.sql. Aucune prise existante supprimée.
BEGIN;
DELETE FROM public.species_coefficients WHERE species='Black-bass';
CREATE OR REPLACE FUNCTION public.staff_set_coefficients(p_coefficients jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE item record;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_staff() THEN RAISE EXCEPTION 'Accès réservé au staff'; END IF;
 IF jsonb_typeof(p_coefficients) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Barème invalide'; END IF;
 IF (SELECT count(*) FROM jsonb_object_keys(p_coefficients))<>5 THEN RAISE EXCEPTION 'Indique les cinq coefficients'; END IF;
 FOR item IN SELECT key,value FROM jsonb_each(p_coefficients) LOOP
  IF item.key NOT IN('Brochet','Sandre','Perche','Chevesne','Silure')
   OR jsonb_typeof(item.value)<>'number' THEN RAISE EXCEPTION 'Espèce ou coefficient invalide'; END IF;
  IF (item.value::text)::numeric<0 OR (item.value::text)::numeric>100
   OR round((item.value::text)::numeric,2)<>(item.value::text)::numeric THEN
   RAISE EXCEPTION 'Coefficient entre 0 et 100, avec deux décimales maximum';
  END IF;
 END LOOP;
 PERFORM pg_catalog.pg_advisory_xact_lock(2027,6);
 FOR item IN SELECT key,value FROM jsonb_each(p_coefficients) LOOP
  INSERT INTO public.species_coefficients(species,coefficient,updated_by,updated_at)
  VALUES(item.key,(item.value::text)::numeric,auth.uid(),now())
  ON CONFLICT(species) DO UPDATE SET coefficient=excluded.coefficient,updated_by=excluded.updated_by,updated_at=excluded.updated_at;
 END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.staff_set_coefficients(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.staff_set_coefficients(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.guard_contest_species()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP='UPDATE' THEN
  IF NEW.species IS NOT DISTINCT FROM OLD.species THEN RETURN NEW; END IF;
 END IF;
 IF NEW.species NOT IN('Brochet','Sandre','Perche','Chevesne','Silure') OR NEW.species IS NULL THEN
  RAISE EXCEPTION 'Espèce hors concours. Espèces autorisées : brochet, sandre, perche, chevesne, silure';
 END IF;
 RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS guard_contest_species ON public.catches;
CREATE TRIGGER guard_contest_species BEFORE INSERT OR UPDATE OF species ON public.catches
 FOR EACH ROW EXECUTE FUNCTION public.guard_contest_species();

CREATE OR REPLACE FUNCTION public.get_ranking_details()
RETURNS TABLE(team_number integer,team_name text,catch_count bigint,species_count bigint,base_points bigint,bonus_points bigint,points bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 WITH totals AS (
  SELECT t.id,t.team_number,t.team_name,count(c.id) AS catch_count,
   count(DISTINCT c.species) AS species_count,
   coalesce(sum(round(c.length_mm::numeric*coalesce(k.coefficient,1))),0)::bigint AS base_points
  FROM public.teams t
  LEFT JOIN public.catches c ON c.team_id=t.id AND c.status='approved' AND c.deleted_at IS NULL
   AND c.species IN('Brochet','Sandre','Perche','Chevesne','Silure')
  LEFT JOIN public.species_coefficients k ON k.species=c.species
  WHERE t.registration_status='confirmed'
   AND (public.is_staff() OR EXISTS(SELECT 1 FROM public.contest_settings s WHERE s.id=1 AND s.ranking_visible))
  GROUP BY t.id,t.team_number,t.team_name
 ), scored AS (
  SELECT totals.*,CASE WHEN species_count>=5 THEN 500 WHEN species_count>=3 THEN 300 ELSE 0 END::bigint AS bonus_points
  FROM totals
 )
 SELECT team_number,team_name,catch_count,species_count,base_points,bonus_points,base_points+bonus_points AS points
 FROM scored ORDER BY points DESC,catch_count DESC,team_number ASC;
$$;
REVOKE ALL ON FUNCTION public.get_ranking_details() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_ranking_details() TO authenticated;
-- Compatibilité avec les anciennes versions de l’application.
CREATE OR REPLACE FUNCTION public.get_ranking()
RETURNS TABLE(team_number integer,team_name text,catch_count bigint,points bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT r.team_number,r.team_name,r.catch_count,r.points FROM public.get_ranking_details() r ORDER BY r.points DESC,r.catch_count DESC,r.team_number ASC;
$$;
REVOKE ALL ON FUNCTION public.get_ranking() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_ranking() TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;

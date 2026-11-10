BEGIN;
CREATE OR REPLACE FUNCTION public.get_public_ranking()
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
   AND EXISTS(SELECT 1 FROM public.contest_settings s WHERE s.id=1 AND s.ranking_visible)
  GROUP BY t.id,t.team_number,t.team_name
 ), scored AS (
  SELECT totals.*,CASE WHEN species_count>=5 THEN 500 WHEN species_count>=3 THEN 300 ELSE 0 END::bigint AS bonus_points
  FROM totals
 )
 SELECT team_number,team_name,catch_count,species_count,base_points,bonus_points,base_points+bonus_points AS points
 FROM scored ORDER BY points DESC,catch_count DESC,team_number ASC;
$$;
REVOKE ALL ON FUNCTION public.get_public_ranking() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_ranking() TO anon, authenticated;
CREATE OR REPLACE FUNCTION public.is_ranking_public() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.contest_settings WHERE id=1 AND ranking_visible);
$$;
REVOKE ALL ON FUNCTION public.is_ranking_public() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_ranking_public() TO anon, authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;

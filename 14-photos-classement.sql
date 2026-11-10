BEGIN;
-- Les visiteurs anonymes conservent uniquement le classement chiffré.
CREATE OR REPLACE FUNCTION public.can_view_ranking_photos()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT auth.uid() IS NOT NULL AND (
  public.is_staff() OR (
   EXISTS(SELECT 1 FROM public.teams WHERE owner_user_id=auth.uid() AND registration_status='confirmed')
   AND EXISTS(SELECT 1 FROM public.contest_settings WHERE id=1 AND ranking_visible)
  )
 );
$$;
REVOKE ALL ON FUNCTION public.can_view_ranking_photos() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.can_view_ranking_photos() TO authenticated;

CREATE OR REPLACE FUNCTION public.can_read_ranking_photo(p_path text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT public.can_view_ranking_photos() AND EXISTS(
  SELECT 1 FROM public.catches c JOIN public.teams t ON t.id=c.team_id
  WHERE c.photo_path=p_path AND c.status='approved' AND c.deleted_at IS NULL
   AND c.purge_started_at IS NULL AND t.registration_status='confirmed'
   AND c.species IN('Brochet','Sandre','Perche','Chevesne','Silure')
 );
$$;
REVOKE ALL ON FUNCTION public.can_read_ranking_photo(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.can_read_ranking_photo(text) TO authenticated;

-- Remplace la restriction staff seule ; les photos non validées restent staff seules.
DROP POLICY IF EXISTS photos_read_staff_only ON storage.objects;
CREATE POLICY photos_read_staff_only ON storage.objects
 AS RESTRICTIVE FOR SELECT TO authenticated
 USING(bucket_id<>'photos-prises' OR public.is_staff() OR public.can_read_ranking_photo(name));
DROP POLICY IF EXISTS photos_read_ranked_participants ON storage.objects;
CREATE POLICY photos_read_ranked_participants ON storage.objects
 FOR SELECT TO authenticated
 USING(bucket_id='photos-prises' AND public.can_read_ranking_photo(name));

CREATE OR REPLACE FUNCTION public.get_rank_team_catches(p_team_number integer,p_offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 IF NOT public.can_view_ranking_photos() THEN RAISE EXCEPTION 'Photos réservées aux équipes confirmées et au staff lorsque le classement est affiché'; END IF;
 IF p_offset IS NULL OR p_offset<0 THEN RAISE EXCEPTION 'Page invalide'; END IF;
 SELECT jsonb_build_object('team_name',t.team_name,'team_number',t.team_number,
  'catch_count',(SELECT count(*) FROM public.catches c WHERE c.team_id=t.id AND c.status='approved' AND c.deleted_at IS NULL AND c.purge_started_at IS NULL AND c.species IN('Brochet','Sandre','Perche','Chevesne','Silure')),
  'catches',coalesce((SELECT jsonb_agg(row_to_json(q)) FROM (
   SELECT c.id,c.species,c.length_mm,c.photo_path,c.created_at FROM public.catches c
   WHERE c.team_id=t.id AND c.status='approved' AND c.deleted_at IS NULL AND c.purge_started_at IS NULL
    AND c.species IN('Brochet','Sandre','Perche','Chevesne','Silure')
   ORDER BY c.created_at DESC,c.id LIMIT 50 OFFSET p_offset
  ) q),'[]'::jsonb)) INTO result
 FROM public.teams t WHERE t.team_number=p_team_number AND t.registration_status='confirmed';
 IF result IS NULL THEN RAISE EXCEPTION 'Équipe introuvable'; END IF;
 RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.get_rank_team_catches(integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_rank_team_catches(integer,integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_best_rank_catches()
RETURNS TABLE(species text,length_mm integer,team_number integer,team_name text,photo_path text,tied_count bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT public.can_view_ranking_photos() THEN RAISE EXCEPTION 'Photos réservées aux équipes confirmées et au staff lorsque le classement est affiché'; END IF;
 RETURN QUERY
 WITH ranked AS (
  SELECT c.species,c.length_mm,t.team_number,t.team_name,c.photo_path,
   row_number() OVER(PARTITION BY c.species ORDER BY c.length_mm DESC,c.created_at,c.id) AS position,
   count(*) OVER(PARTITION BY c.species,c.length_mm) AS ties
  FROM public.catches c JOIN public.teams t ON t.id=c.team_id
  WHERE c.status='approved' AND c.deleted_at IS NULL AND c.purge_started_at IS NULL AND t.registration_status='confirmed'
   AND c.species IN('Brochet','Sandre','Perche','Chevesne','Silure')
 ) SELECT r.species,r.length_mm,r.team_number,r.team_name,r.photo_path,r.ties FROM ranked r WHERE r.position=1 ORDER BY r.species;
END;
$$;
REVOKE ALL ON FUNCTION public.get_best_rank_catches() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_best_rank_catches() TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;

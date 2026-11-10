-- Barème par espèce. Exécuter dans Supabase SQL Editor avant publication.
BEGIN;
CREATE TABLE IF NOT EXISTS public.species_coefficients (
 species text PRIMARY KEY CHECK(species IN('Brochet','Sandre','Perche','Chevesne','Silure','Black-bass')),
 coefficient numeric(6,2) NOT NULL DEFAULT 1 CHECK(coefficient BETWEEN 0 AND 100),
 updated_at timestamptz NOT NULL DEFAULT now(),
 updated_by uuid
);
INSERT INTO public.species_coefficients(species)
VALUES('Brochet'),('Sandre'),('Perche'),('Chevesne'),('Silure'),('Black-bass')
ON CONFLICT(species) DO NOTHING;
ALTER TABLE public.species_coefficients ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.species_coefficients FROM anon,authenticated;
GRANT SELECT(species,coefficient) ON public.species_coefficients TO authenticated;
DROP POLICY IF EXISTS coefficients_read ON public.species_coefficients;
CREATE POLICY coefficients_read ON public.species_coefficients FOR SELECT TO authenticated USING(true);
CREATE OR REPLACE FUNCTION public.staff_set_coefficients(p_coefficients jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE item record;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_staff() THEN RAISE EXCEPTION 'Accès réservé au staff'; END IF;
 IF jsonb_typeof(p_coefficients) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Barème invalide'; END IF;
 IF (SELECT count(*) FROM jsonb_object_keys(p_coefficients))<>6 THEN RAISE EXCEPTION 'Indique les six coefficients'; END IF;
 FOR item IN SELECT key,value FROM jsonb_each(p_coefficients) LOOP
  IF item.key NOT IN('Brochet','Sandre','Perche','Chevesne','Silure','Black-bass')
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
CREATE OR REPLACE FUNCTION public.get_ranking()
RETURNS TABLE(team_number integer,team_name text,catch_count bigint,points bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT t.team_number,t.team_name,count(c.id),
 coalesce(sum(round(c.length_mm::numeric*coalesce(k.coefficient,1))),0)::bigint
 FROM public.teams t
 LEFT JOIN public.catches c ON c.team_id=t.id AND c.status='approved' AND c.deleted_at IS NULL
 LEFT JOIN public.species_coefficients k ON k.species=c.species
 WHERE t.registration_status='confirmed'
 AND (public.is_staff() OR EXISTS(SELECT 1 FROM public.contest_settings s WHERE s.id=1 AND s.ranking_visible))
 GROUP BY t.id,t.team_number,t.team_name
 ORDER BY 4 DESC,3 DESC,t.team_number ASC;
$$;
REVOKE ALL ON FUNCTION public.get_ranking() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_ranking() TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;

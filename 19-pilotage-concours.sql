BEGIN;

-- Heure déclarée par le téléphone. created_at reste l'heure de réception du serveur.
ALTER TABLE public.catches ADD COLUMN IF NOT EXISTS declared_on_device_at timestamptz;
GRANT INSERT (declared_on_device_at), SELECT (declared_on_device_at)
 ON public.catches TO authenticated;

-- Les visiteurs de l'accueil peuvent consulter l'état et les horaires.
GRANT EXECUTE ON FUNCTION public.get_catch_window() TO anon;

ALTER TABLE public.contest_settings
 ADD COLUMN IF NOT EXISTS species_minimums jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE OR REPLACE FUNCTION public.get_species_minimums()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT species_minimums FROM public.contest_settings WHERE id=1
$$;
REVOKE ALL ON FUNCTION public.get_species_minimums() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_species_minimums() TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.staff_set_species_minimums(p_values jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE item record;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_staff() THEN RAISE EXCEPTION 'Accès réservé au staff'; END IF;
 IF jsonb_typeof(p_values) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Tailles invalides'; END IF;
 IF (SELECT count(*) FROM jsonb_object_keys(p_values))<>5 THEN RAISE EXCEPTION 'Cinq espèces attendues'; END IF;
 FOR item IN SELECT * FROM jsonb_each(p_values) LOOP
  IF item.key NOT IN ('Brochet','Sandre','Perche','Chevesne','Silure') THEN RAISE EXCEPTION 'Espèce invalide'; END IF;
  IF item.value <> 'null'::jsonb THEN
   IF jsonb_typeof(item.value)<>'number' OR item.value::text !~ '^[0-9]{1,4}$' THEN RAISE EXCEPTION 'Millimètres entiers attendus'; END IF;
   IF (item.value::text)::integer NOT BETWEEN 1 AND 3000 THEN RAISE EXCEPTION 'Taille hors limites'; END IF;
  END IF;
 END LOOP;
 UPDATE public.contest_settings SET species_minimums=p_values,updated_at=now() WHERE id=1;
 IF NOT FOUND THEN RAISE EXCEPTION 'Réglages du concours absents'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.staff_set_species_minimums(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.staff_set_species_minimums(jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;

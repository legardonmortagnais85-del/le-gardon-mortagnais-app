-- Contrôles en lecture seule à exécuter après installation du script 09.
SELECT schemaname,tablename,rowsecurity FROM pg_tables
 WHERE schemaname='public' AND tablename IN('teams','catches','staff_members','payments','contest_settings','contest_messages','species_coefficients','participant_deletions')
 ORDER BY tablename;
SELECT n.nspname AS schema,p.proname AS fonction,p.prosecdef AS security_definer,p.proconfig AS configuration,
 has_function_privilege('anon',p.oid,'EXECUTE') AS executable_sans_connexion
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname IN('register_duo','staff_set_registration','staff_update_team','staff_delete_participant','staff_trash_catch','staff_purge_catch','staff_set_coefficients','get_ranking_details')
 ORDER BY p.proname;
SELECT id,public AS stockage_public FROM storage.buckets WHERE id='photos-prises';
SELECT count(*) FILTER(WHERE registration_status='confirmed') AS equipes_confirmees,
 40-count(*) FILTER(WHERE registration_status='confirmed') AS places_disponibles FROM public.teams;

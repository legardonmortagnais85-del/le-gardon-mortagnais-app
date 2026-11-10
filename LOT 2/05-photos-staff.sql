-- Photos privées, consultables et téléchargeables uniquement par le staff.
BEGIN;
UPDATE storage.buckets SET public=false WHERE id='photos-prises';
-- Cette restriction s'applique même si une ancienne politique autorise
-- les participants à lire leurs propres photos.
DROP POLICY IF EXISTS photos_read_staff_only ON storage.objects;
CREATE POLICY photos_read_staff_only ON storage.objects
 AS RESTRICTIVE FOR SELECT TO authenticated
 USING(bucket_id<>'photos-prises' OR public.is_staff());
DROP POLICY IF EXISTS photos_read_staff_allow ON storage.objects;
CREATE POLICY photos_read_staff_allow ON storage.objects
 FOR SELECT TO authenticated
 USING(bucket_id='photos-prises' AND public.is_staff());
DROP POLICY IF EXISTS photos_read_no_anon ON storage.objects;
CREATE POLICY photos_read_no_anon ON storage.objects
 AS RESTRICTIVE FOR SELECT TO anon
 USING(bucket_id<>'photos-prises');
NOTIFY pgrst,'reload schema';
COMMIT;

BEGIN;
-- Les visiteurs peuvent consulter les cinq coefficients du règlement.
GRANT SELECT (species, coefficient) ON public.species_coefficients TO anon;
DROP POLICY IF EXISTS coefficients_public_read ON public.species_coefficients;
CREATE POLICY coefficients_public_read ON public.species_coefficients FOR SELECT TO anon
 USING (species IN ('Brochet','Sandre','Perche','Chevesne','Silure'));

-- Le nom du duo est public. Les coordonnées et identifiants de connexion restent inchangés.
UPDATE public.teams
SET team_name = CASE WHEN team_number IS NULL THEN 'Duo ' || left(id::text,8)
                     ELSE 'Équipe ' || team_number::text END
WHERE team_name ~ '[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+';
ALTER TABLE public.teams DROP CONSTRAINT IF EXISTS teams_public_name_no_email;
ALTER TABLE public.teams ADD CONSTRAINT teams_public_name_no_email
 CHECK (team_name !~ '[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+');
NOTIFY pgrst, 'reload schema';
COMMIT;

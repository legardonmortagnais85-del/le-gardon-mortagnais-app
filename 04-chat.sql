-- Installer le chat dans Supabase > SQL Editor. Aucune donnée existante effacée.
BEGIN;
CREATE TABLE IF NOT EXISTS public.contest_messages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 author_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 sender_name text NOT NULL,
 sender_staff boolean NOT NULL DEFAULT false,
 body text NOT NULL CHECK(char_length(body) BETWEEN 1 AND 1000),
 created_at timestamptz NOT NULL DEFAULT now(),
 hidden_at timestamptz,
 hidden_by uuid
);
CREATE INDEX IF NOT EXISTS contest_messages_recent ON public.contest_messages(created_at DESC,id DESC);
CREATE OR REPLACE FUNCTION public.can_use_contest_chat()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT auth.uid() IS NOT NULL AND (
 public.is_staff() OR EXISTS(SELECT 1 FROM public.teams t WHERE t.owner_user_id=auth.uid()
 AND t.registration_status NOT IN ('rejected','cancelled')));
$$;
REVOKE ALL ON FUNCTION public.can_use_contest_chat() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.can_use_contest_chat() TO authenticated;
ALTER TABLE public.contest_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.contest_messages FROM anon,authenticated;
GRANT SELECT(id,sender_name,sender_staff,body,created_at) ON public.contest_messages TO authenticated;
DROP POLICY IF EXISTS contest_chat_read ON public.contest_messages;
CREATE POLICY contest_chat_read ON public.contest_messages FOR SELECT TO authenticated
 USING(hidden_at IS NULL AND public.can_use_contest_chat());
CREATE OR REPLACE FUNCTION public.send_contest_message(p_body text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE uid uuid:=auth.uid(); name text; isstaff boolean; msg text:=trim(coalesce(p_body,'')); result uuid;
BEGIN
 IF NOT public.can_use_contest_chat() THEN RAISE EXCEPTION 'Chat réservé aux équipes inscrites et au staff'; END IF;
 IF char_length(msg) NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'Message de 1 à 1000 caractères attendu'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(uid::text,202704));
 IF EXISTS(SELECT 1 FROM public.contest_messages WHERE author_id=uid AND created_at>clock_timestamp()-interval '2 seconds') THEN
  RAISE EXCEPTION 'Attends deux secondes avant de renvoyer un message';
 END IF;
 isstaff:=public.is_staff();
 IF isstaff THEN name:='Staff — Organisation';
 ELSE SELECT 'Équipe '||coalesce(t.team_number::text,'—')||' — '||t.team_name INTO name
 FROM public.teams t WHERE t.owner_user_id=uid AND t.registration_status NOT IN ('rejected','cancelled')
 ORDER BY t.created_at LIMIT 1;
 END IF;
 INSERT INTO public.contest_messages(author_id,sender_name,sender_staff,body)
 VALUES(uid,name,isstaff,msg) RETURNING id INTO result;
 RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.send_contest_message(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.send_contest_message(text) TO authenticated;
CREATE OR REPLACE FUNCTION public.staff_hide_contest_message(p_message_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_staff() THEN RAISE EXCEPTION 'Accès réservé au staff'; END IF;
 UPDATE public.contest_messages SET hidden_at=now(),hidden_by=auth.uid() WHERE id=p_message_id AND hidden_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'Message déjà retiré ou introuvable'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.staff_hide_contest_message(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.staff_hide_contest_message(uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;

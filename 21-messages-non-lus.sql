BEGIN;
CREATE TABLE IF NOT EXISTS public.contest_chat_reads (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 read_at timestamptz NOT NULL,
 message_id uuid NOT NULL
);
ALTER TABLE public.contest_chat_reads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.contest_chat_reads FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.contest_chat_unread(displayed_id uuid DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE uid uuid := auth.uid();
BEGIN
 IF NOT public.can_use_contest_chat() THEN RETURN false; END IF;
 IF displayed_id IS NOT NULL THEN
  INSERT INTO public.contest_chat_reads AS r(user_id,read_at,message_id)
  SELECT uid,m.created_at,m.id FROM public.contest_messages m
  WHERE m.id=displayed_id AND m.hidden_at IS NULL
  ON CONFLICT(user_id) DO UPDATE SET read_at=excluded.read_at,message_id=excluded.message_id
  WHERE (r.read_at,r.message_id)<(excluded.read_at,excluded.message_id);
 END IF;
 RETURN EXISTS (
  SELECT 1 FROM public.contest_messages m
  LEFT JOIN public.contest_chat_reads r ON r.user_id=uid
  WHERE m.hidden_at IS NULL AND m.author_id<>uid
  AND (r.user_id IS NULL OR (m.created_at,m.id)>(r.read_at,r.message_id))
 );
END $$;
REVOKE ALL ON FUNCTION public.contest_chat_unread(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.contest_chat_unread(uuid) TO authenticated;
COMMIT;

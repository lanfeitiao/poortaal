CREATE TABLE IF NOT EXISTS public.user_streak (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  last_date date,
  count integer NOT NULL DEFAULT 0 CHECK (count BETWEEN 0 AND 100000),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.user_streak ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read own streak" ON public.user_streak
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
REVOKE ALL ON public.user_streak FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.user_streak TO authenticated;
CREATE POLICY "Insert own streak" ON public.user_streak
  FOR INSERT TO authenticated WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "Update own streak" ON public.user_streak
  FOR UPDATE TO authenticated USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

CREATE OR REPLACE FUNCTION public.sync_learning_streak(
  p_local_date date DEFAULT NULL, p_local_count integer DEFAULT 0,
  p_practice boolean DEFAULT false
) RETURNS public.user_streak
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  owner_id uuid := auth.uid();
  today date := (now() AT TIME ZONE 'Europe/Amsterdam')::date;
  saved public.user_streak;
BEGIN
  IF owner_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_local_count IS NULL OR p_local_count < 0 OR p_local_count > 100000
    OR p_local_date > today THEN RAISE EXCEPTION 'Invalid streak'; END IF;
  INSERT INTO public.user_streak(user_id) VALUES(owner_id) ON CONFLICT DO NOTHING;
  SELECT * INTO saved FROM public.user_streak WHERE user_id = owner_id FOR UPDATE;
  IF p_local_date IS NOT NULL AND p_local_count > 0 THEN
    IF saved.last_date IS NULL OR p_local_date > saved.last_date THEN
      saved.count := greatest(p_local_count,
        CASE WHEN p_local_date = saved.last_date + 1 THEN saved.count + 1 ELSE 1 END);
      saved.last_date := p_local_date;
    ELSIF p_local_date = saved.last_date THEN
      saved.count := greatest(saved.count, p_local_count);
    END IF;
  END IF;
  IF p_practice AND saved.last_date IS DISTINCT FROM today THEN
    saved.count := CASE WHEN saved.last_date = today - 1 THEN saved.count + 1 ELSE 1 END;
    saved.last_date := today;
  END IF;
  UPDATE public.user_streak SET last_date = saved.last_date, count = saved.count,
    updated_at = now() WHERE user_id = owner_id RETURNING * INTO saved;
  RETURN saved;
END;
$$;
REVOKE ALL ON FUNCTION public.sync_learning_streak(date, integer, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_learning_streak(date, integer, boolean) TO authenticated;

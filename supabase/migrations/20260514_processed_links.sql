CREATE TABLE IF NOT EXISTS public.processed_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  normalized_url TEXT NOT NULL,
  original_url TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('reddit', 'x', 'facebook')),
  status TEXT NOT NULL CHECK (status IN ('summarized', 'failed')),
  obsidian_path TEXT NOT NULL,
  original_item_id UUID,
  failure_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, normalized_url)
);

CREATE INDEX IF NOT EXISTS processed_links_user_created_idx
  ON public.processed_links(user_id, created_at DESC);

ALTER TABLE public.processed_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own processed links"
  ON public.processed_links FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own processed links"
  ON public.processed_links FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own processed links"
  ON public.processed_links FOR UPDATE
  USING (auth.uid() = user_id);

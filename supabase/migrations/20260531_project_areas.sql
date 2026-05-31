ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS area TEXT NOT NULL DEFAULT 'demand';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'projects_area_check'
      AND conrelid = 'public.projects'::regclass
  ) THEN
    ALTER TABLE public.projects
      ADD CONSTRAINT projects_area_check CHECK (area IN ('demand', 'delivery', 'personal'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS projects_user_area_position_idx
  ON public.projects(user_id, area, archived_at, position, created_at);

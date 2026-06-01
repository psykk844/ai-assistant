CREATE TABLE IF NOT EXISTS public.project_task_focus (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_task_id uuid NOT NULL,
  lane text NOT NULL DEFAULT 'today' CHECK (lane = 'today'),
  my_day_order integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, project_task_id),
  FOREIGN KEY (project_task_id, user_id) REFERENCES public.project_tasks(id, user_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS project_task_focus_user_lane_order_idx
  ON public.project_task_focus(user_id, lane, my_day_order, created_at);

ALTER TABLE public.project_task_focus ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_task_focus_select_own ON public.project_task_focus;
CREATE POLICY project_task_focus_select_own
  ON public.project_task_focus
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS project_task_focus_insert_own ON public.project_task_focus;
CREATE POLICY project_task_focus_insert_own
  ON public.project_task_focus
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS project_task_focus_update_own ON public.project_task_focus;
CREATE POLICY project_task_focus_update_own
  ON public.project_task_focus
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS project_task_focus_delete_own ON public.project_task_focus;
CREATE POLICY project_task_focus_delete_own
  ON public.project_task_focus
  FOR DELETE
  USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  description TEXT,
  position DOUBLE PRECISION NOT NULL DEFAULT 0,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id, user_id)
);

CREATE TABLE IF NOT EXISTS public.project_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  project_id UUID NOT NULL,
  parent_task_id UUID,
  title TEXT NOT NULL CHECK (length(trim(title)) > 0),
  description TEXT,
  status TEXT NOT NULL DEFAULT 'backlog' CHECK (status IN ('backlog', 'todo', 'doing', 'waiting', 'done')),
  position DOUBLE PRECISION NOT NULL DEFAULT 0,
  due_date DATE,
  labels JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(labels) = 'array'),
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id, user_id),
  UNIQUE (id, user_id, project_id),
  FOREIGN KEY (project_id, user_id) REFERENCES public.projects(id, user_id) ON DELETE CASCADE,
  FOREIGN KEY (parent_task_id, user_id, project_id) REFERENCES public.project_tasks(id, user_id, project_id) ON DELETE CASCADE,
  CHECK (parent_task_id IS NULL OR parent_task_id <> id)
);

CREATE TABLE IF NOT EXISTS public.project_checklist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  task_id UUID NOT NULL,
  title TEXT NOT NULL CHECK (length(trim(title)) > 0),
  completed BOOLEAN NOT NULL DEFAULT false,
  position DOUBLE PRECISION NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (task_id, user_id) REFERENCES public.project_tasks(id, user_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS projects_user_position_idx
  ON public.projects(user_id, position, archived_at, created_at);

CREATE INDEX IF NOT EXISTS projects_active_user_position_idx
  ON public.projects(user_id, archived_at, position, created_at);

CREATE INDEX IF NOT EXISTS project_tasks_project_status_position_idx
  ON public.project_tasks(project_id, status, position, archived_at, parent_task_id, created_at);

CREATE INDEX IF NOT EXISTS project_tasks_active_board_idx
  ON public.project_tasks(project_id, archived_at, parent_task_id, status, position, created_at);

CREATE INDEX IF NOT EXISTS project_tasks_user_project_idx
  ON public.project_tasks(user_id, project_id);

CREATE INDEX IF NOT EXISTS project_checklist_items_task_position_idx
  ON public.project_checklist_items(task_id, position, created_at);

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_checklist_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own projects"
  ON public.projects FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own projects"
  ON public.projects FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own projects"
  ON public.projects FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own projects"
  ON public.projects FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can read own project tasks"
  ON public.project_tasks FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own project tasks"
  ON public.project_tasks FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own project tasks"
  ON public.project_tasks FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own project tasks"
  ON public.project_tasks FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can read own project checklist items"
  ON public.project_checklist_items FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own project checklist items"
  ON public.project_checklist_items FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own project checklist items"
  ON public.project_checklist_items FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own project checklist items"
  ON public.project_checklist_items FOR DELETE
  USING (auth.uid() = user_id);

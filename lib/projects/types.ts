import type { ProjectArea, ProjectTaskStatus } from "./status";

export type ProjectLabel = {
  name: string;
  color: string;
};

export type Project = {
  id: string;
  user_id: string;
  area: ProjectArea;
  name: string;
  description: string | null;
  position: number;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ProjectChecklistItem = {
  id: string;
  task_id: string;
  title: string;
  completed: boolean;
  position: number;
  created_at: string;
  updated_at: string;
};

export type ProjectTask = {
  id: string;
  project_id: string;
  parent_task_id: string | null;
  title: string;
  description: string | null;
  status: ProjectTaskStatus;
  position: number;
  due_date: string | null;
  labels: ProjectLabel[];
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ProjectTaskNode = ProjectTask & {
  checklist: ProjectChecklistItem[];
  subtasks: Array<ProjectTask & { checklist: ProjectChecklistItem[] }>;
};

export type ProjectTaskFocus = {
  id: string;
  user_id: string;
  project_task_id: string;
  lane: "today";
  my_day_order: number | null;
  created_at: string;
  updated_at: string;
};

export type FocusedProjectTask = {
  focus: ProjectTaskFocus;
  project: Project;
  task: ProjectTask;
};

export type ProjectBoard = {
  projects: Project[];
  activeProject: Project | null;
  tasks: ProjectTaskNode[];
};

export type MobileProjectTaskStatus = "backlog" | "todo" | "doing" | "waiting" | "done";

export type MobileProjectLabel = { name: string; color: string };
export type MobileProject = { id: string; name: string; description: string | null; position: number };
export type MobileProjectChecklistItem = { id: string; task_id: string; title: string; completed: boolean; position: number };

export type MobileProjectSubtask = {
  id: string;
  project_id: string;
  parent_task_id: string;
  title: string;
  description: string | null;
  status: MobileProjectTaskStatus;
  position: number;
  due_date: string | null;
  labels: MobileProjectLabel[];
  checklist: MobileProjectChecklistItem[];
};

export type MobileProjectTask = {
  id: string;
  project_id: string;
  parent_task_id: null;
  title: string;
  description: string | null;
  status: MobileProjectTaskStatus;
  position: number;
  due_date: string | null;
  labels: MobileProjectLabel[];
  checklist: MobileProjectChecklistItem[];
  subtasks: MobileProjectSubtask[];
};

export type MobileProjectBoardPayload = {
  projects: MobileProject[];
  activeProject: MobileProject | null;
  tasks: MobileProjectTask[];
};

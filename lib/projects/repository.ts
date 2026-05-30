import { createAdminClient } from "@/lib/supabase/admin";
import type { Project, ProjectChecklistItem, ProjectLabel, ProjectTask, ProjectTaskNode } from "./types";
import { compareProjectTaskPositions, isProjectTaskStatus, type ProjectTaskStatus } from "./status";

const PROJECT_COLUMNS = "id,user_id,name,description,position,archived_at,created_at,updated_at";
const TASK_COLUMNS = "id,project_id,parent_task_id,title,description,status,position,due_date,labels,archived_at,created_at,updated_at";
const CHECKLIST_COLUMNS = "id,task_id,title,completed,position,created_at,updated_at";

export function sanitizeProjectLabels(value: unknown): ProjectLabel[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((label) => {
      if (!label || typeof label !== "object") return null;
      const record = label as Record<string, unknown>;
      const name = typeof record.name === "string" ? record.name.trim() : "";
      const color = typeof record.color === "string" ? record.color.trim() : "";
      if (!name || !/^#[0-9a-fA-F]{6}$/.test(color)) return null;
      return { name, color };
    })
    .filter((label): label is ProjectLabel => Boolean(label));
}

export function nextProjectPosition(projects: Array<{ position: number }>) {
  return Math.max(0, ...projects.map((project) => project.position)) + 1000;
}

export function nextTaskPosition(tasks: Array<{ position: number }>) {
  return Math.max(0, ...tasks.map((task) => task.position)) + 1000;
}

export function buildProjectTaskNodes(tasks: ProjectTask[], checklistItems: ProjectChecklistItem[]): ProjectTaskNode[] {
  const checklistByTask = new Map<string, ProjectChecklistItem[]>();
  for (const item of checklistItems) {
    const list = checklistByTask.get(item.task_id) ?? [];
    list.push(item);
    checklistByTask.set(item.task_id, list);
  }

  for (const list of checklistByTask.values()) {
    list.sort((a, b) => (a.position !== b.position ? a.position - b.position : a.created_at.localeCompare(b.created_at)));
  }

  const childrenByParent = new Map<string, ProjectTask[]>();
  const roots: ProjectTask[] = [];

  for (const task of tasks) {
    if (task.parent_task_id) {
      const children = childrenByParent.get(task.parent_task_id) ?? [];
      children.push(task);
      childrenByParent.set(task.parent_task_id, children);
    } else {
      roots.push(task);
    }
  }

  roots.sort(compareProjectTaskPositions);
  for (const children of childrenByParent.values()) children.sort(compareProjectTaskPositions);

  return roots.map((task) => ({
    ...task,
    checklist: checklistByTask.get(task.id) ?? [],
    subtasks: (childrenByParent.get(task.id) ?? []).map((subtask) => ({
      ...subtask,
      checklist: checklistByTask.get(subtask.id) ?? [],
    })),
  }));
}

export async function listProjects(userId: string): Promise<Project[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("projects")
    .select(PROJECT_COLUMNS)
    .eq("user_id", userId)
    .is("archived_at", null)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) throw new Error(`Failed to load projects: ${error.message}`);
  return (data ?? []) as Project[];
}

export async function createProject(userId: string, input: { name: string; description?: string | null }) {
  const name = input.name.trim();
  if (!name) throw new Error("Project name is required");

  const projects = await listProjects(userId);
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("projects")
    .insert({
      user_id: userId,
      name,
      description: input.description?.trim() || null,
      position: nextProjectPosition(projects),
    })
    .select(PROJECT_COLUMNS)
    .single();

  if (error || !data) throw new Error(`Failed to create project: ${error?.message ?? "missing row"}`);
  return data as Project;
}

export async function loadProjectBoard(userId: string, projectId?: string | null) {
  const projects = await listProjects(userId);
  const activeProject = projectId
    ? projects.find((project) => project.id === projectId) ?? projects[0] ?? null
    : projects[0] ?? null;

  if (!activeProject) return { projects, activeProject: null, tasks: [] };

  const supabase = createAdminClient();
  const { data: taskRows, error: taskError } = await supabase
    .from("project_tasks")
    .select(TASK_COLUMNS)
    .eq("user_id", userId)
    .eq("project_id", activeProject.id)
    .is("archived_at", null)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });

  if (taskError) throw new Error(`Failed to load project tasks: ${taskError.message}`);

  const tasks = ((taskRows ?? []) as ProjectTask[]).map((task) => ({
    ...task,
    labels: sanitizeProjectLabels(task.labels),
  }));

  const taskIds = tasks.map((task) => task.id);
  const { data: checklistRows, error: checklistError } = taskIds.length
    ? await supabase
        .from("project_checklist_items")
        .select(CHECKLIST_COLUMNS)
        .eq("user_id", userId)
        .in("task_id", taskIds)
        .order("position", { ascending: true })
        .order("created_at", { ascending: true })
    : { data: [], error: null };

  if (checklistError) throw new Error(`Failed to load project checklist items: ${checklistError.message}`);

  return {
    projects,
    activeProject,
    tasks: buildProjectTaskNodes(tasks, (checklistRows ?? []) as ProjectChecklistItem[]),
  };
}

export async function createProjectTask(
  userId: string,
  input: {
    projectId: string;
    parentTaskId?: string | null;
    title: string;
    status?: ProjectTaskStatus;
    description?: string | null;
  },
) {
  const title = input.title.trim();
  if (!title) throw new Error("Task title is required");
  const status = input.status ?? "backlog";
  if (!isProjectTaskStatus(status)) throw new Error("Invalid project task status");

  const board = await loadProjectBoard(userId, input.projectId);
  if (!board.activeProject) throw new Error("Project not found");

  const siblingPositions = input.parentTaskId
    ? board.tasks.find((task) => task.id === input.parentTaskId)?.subtasks ?? []
    : board.tasks.filter((task) => task.status === status);

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("project_tasks")
    .insert({
      user_id: userId,
      project_id: input.projectId,
      parent_task_id: input.parentTaskId ?? null,
      title,
      description: input.description?.trim() || null,
      status,
      position: nextTaskPosition(siblingPositions),
      labels: [],
    })
    .select(TASK_COLUMNS)
    .single();

  if (error || !data) throw new Error(`Failed to create project task: ${error?.message ?? "missing row"}`);
  return { ...(data as ProjectTask), labels: sanitizeProjectLabels((data as ProjectTask).labels) };
}

export type ProjectTaskPatch = Partial<{
  title: string;
  description: string | null;
  status: ProjectTaskStatus;
  position: number;
  due_date: string | null;
  labels: ProjectLabel[];
  archived_at: string | null;
}>;

export async function updateProjectTask(userId: string, taskId: string, patch: ProjectTaskPatch) {
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof patch.title === "string") payload.title = patch.title.trim();
  if ("description" in patch) payload.description = patch.description?.trim() || null;
  if (patch.status) {
    if (!isProjectTaskStatus(patch.status)) throw new Error("Invalid project task status");
    payload.status = patch.status;
  }
  if (typeof patch.position === "number") payload.position = patch.position;
  if ("due_date" in patch) payload.due_date = patch.due_date || null;
  if (patch.labels) payload.labels = sanitizeProjectLabels(patch.labels);
  if ("archived_at" in patch) payload.archived_at = patch.archived_at;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("project_tasks")
    .update(payload)
    .eq("user_id", userId)
    .eq("id", taskId)
    .select(TASK_COLUMNS)
    .single();

  if (error || !data) throw new Error(`Failed to update project task: ${error?.message ?? "missing row"}`);
  return { ...(data as ProjectTask), labels: sanitizeProjectLabels((data as ProjectTask).labels) };
}

export async function createChecklistItem(userId: string, taskId: string, title: string) {
  const trimmed = title.trim();
  if (!trimmed) throw new Error("Checklist title is required");

  const supabase = createAdminClient();
  const { data: existing, error: existingError } = await supabase
    .from("project_checklist_items")
    .select("position")
    .eq("user_id", userId)
    .eq("task_id", taskId);

  if (existingError) throw new Error(`Failed to load checklist items: ${existingError.message}`);

  const { data, error } = await supabase
    .from("project_checklist_items")
    .insert({
      user_id: userId,
      task_id: taskId,
      title: trimmed,
      position: nextTaskPosition((existing ?? []) as Array<{ position: number }>),
    })
    .select(CHECKLIST_COLUMNS)
    .single();

  if (error || !data) throw new Error(`Failed to create checklist item: ${error?.message ?? "missing row"}`);
  return data as ProjectChecklistItem;
}

export async function updateChecklistItem(
  userId: string,
  itemId: string,
  patch: Partial<Pick<ProjectChecklistItem, "title" | "completed" | "position">>,
) {
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof patch.title === "string") payload.title = patch.title.trim();
  if (typeof patch.completed === "boolean") payload.completed = patch.completed;
  if (typeof patch.position === "number") payload.position = patch.position;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("project_checklist_items")
    .update(payload)
    .eq("user_id", userId)
    .eq("id", itemId)
    .select(CHECKLIST_COLUMNS)
    .single();

  if (error || !data) throw new Error(`Failed to update checklist item: ${error?.message ?? "missing row"}`);
  return data as ProjectChecklistItem;
}

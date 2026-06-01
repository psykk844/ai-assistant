import { createAdminClient } from "@/lib/supabase/admin";
import type { FocusedProjectTask, Project, ProjectChecklistItem, ProjectLabel, ProjectTask, ProjectTaskFocus, ProjectTaskNode } from "./types";
import { compareProjectTaskPositions, isProjectArea, isProjectTaskStatus, type ProjectArea, type ProjectTaskStatus } from "./status";

const PROJECT_COLUMNS = "id,user_id,area,name,description,position,archived_at,created_at,updated_at";
const TASK_COLUMNS = "id,project_id,parent_task_id,title,description,status,position,due_date,labels,archived_at,created_at,updated_at";
const CHECKLIST_COLUMNS = "id,task_id,title,completed,position,created_at,updated_at";
const FOCUS_COLUMNS = "id,user_id,project_task_id,lane,my_day_order,created_at,updated_at";

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

export async function listProjects(
  userId: string,
  area?: ProjectArea | null,
  options: { archived?: boolean } = {},
): Promise<Project[]> {
  const supabase = createAdminClient();
  let query = supabase
    .from("projects")
    .select(PROJECT_COLUMNS)
    .eq("user_id", userId);

  query = options.archived ? query.not("archived_at", "is", null) : query.is("archived_at", null);

  if (area) query = query.eq("area", area);

  const { data, error } = await query.order("position", { ascending: true }).order("created_at", { ascending: true });

  if (error) throw new Error(`Failed to load projects: ${error.message}`);
  return (data ?? []) as Project[];
}

export async function createProject(userId: string, input: { name: string; description?: string | null; area?: ProjectArea }) {
  const name = input.name.trim();
  if (!name) throw new Error("Project name is required");
  const area = isProjectArea(input.area) ? input.area : "demand";

  const projects = await listProjects(userId, area);
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("projects")
    .insert({
      user_id: userId,
      area,
      name,
      description: input.description?.trim() || null,
      position: nextProjectPosition(projects),
    })
    .select(PROJECT_COLUMNS)
    .single();

  if (error || !data) throw new Error(`Failed to create project: ${error?.message ?? "missing row"}`);
  return data as Project;
}

export async function loadProjectBoard(
  userId: string,
  projectId?: string | null,
  area?: ProjectArea | null,
  options: { archived?: boolean } = {},
) {
  const projects = await listProjects(userId, area ?? null, options);
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

export async function updateProjectArchive(userId: string, projectId: string, archived: boolean) {
  if (!projectId.trim()) throw new Error("Project id is required");
  const archivedAt = archived ? new Date().toISOString() : null;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("projects")
    .update({ archived_at: archivedAt, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("id", projectId)
    .select(PROJECT_COLUMNS)
    .single();

  if (error || !data) throw new Error(`Failed to update project: ${error?.message ?? "missing row"}`);
  return data as Project;
}

async function requireActiveProjectTask(userId: string, taskId: string) {
  if (!taskId.trim()) throw new Error("Task id is required");

  const supabase = createAdminClient();
  const { data: task, error: taskError } = await supabase
    .from("project_tasks")
    .select(TASK_COLUMNS)
    .eq("user_id", userId)
    .eq("id", taskId)
    .is("archived_at", null)
    .single();

  if (taskError || !task) throw new Error("Project task not found");

  const projectTask = { ...(task as ProjectTask), labels: sanitizeProjectLabels((task as ProjectTask).labels) };
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select(PROJECT_COLUMNS)
    .eq("user_id", userId)
    .eq("id", projectTask.project_id)
    .is("archived_at", null)
    .single();

  if (projectError || !project) throw new Error("Project not found");
  return { task: projectTask, project: project as Project };
}

export async function addProjectTaskFocus(userId: string, taskId: string) {
  await requireActiveProjectTask(userId, taskId);
  await removeProjectTaskFocus(userId, taskId);

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("project_task_focus")
    .insert({
      user_id: userId,
      project_task_id: taskId,
      lane: "today",
      my_day_order: null,
    })
    .select(FOCUS_COLUMNS)
    .single();

  if (error || !data) throw new Error(`Failed to focus project task: ${error?.message ?? "missing row"}`);
  return data as ProjectTaskFocus;
}

export async function removeProjectTaskFocus(userId: string, taskId: string) {
  if (!taskId.trim()) throw new Error("Task id is required");
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("project_task_focus")
    .delete()
    .eq("user_id", userId)
    .eq("project_task_id", taskId);

  if (error) throw new Error(`Failed to remove project task focus: ${error.message}`);
}

export async function listFocusedProjectTasks(userId: string): Promise<FocusedProjectTask[]> {
  const supabase = createAdminClient();
  const { data: focusRows, error: focusError } = await supabase
    .from("project_task_focus")
    .select(FOCUS_COLUMNS)
    .eq("user_id", userId)
    .eq("lane", "today")
    .order("my_day_order", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });

  if (focusError) throw new Error(`Failed to load focused project tasks: ${focusError.message}`);
  const focuses = (focusRows ?? []) as ProjectTaskFocus[];
  const taskIds = focuses.map((focus) => focus.project_task_id);
  if (taskIds.length === 0) return [];

  const { data: taskRows, error: taskError } = await supabase
    .from("project_tasks")
    .select(TASK_COLUMNS)
    .eq("user_id", userId)
    .in("id", taskIds)
    .is("archived_at", null);

  if (taskError) throw new Error(`Failed to load focused project task rows: ${taskError.message}`);
  const taskById = new Map(
    ((taskRows ?? []) as ProjectTask[])
      .map((task) => ({ ...task, labels: sanitizeProjectLabels(task.labels) }))
      .filter((task) => task.status !== "done")
      .map((task) => [task.id, task]),
  );

  const projectIds = Array.from(new Set(Array.from(taskById.values()).map((task) => task.project_id)));
  if (projectIds.length === 0) return [];

  const { data: projectRows, error: projectError } = await supabase
    .from("projects")
    .select(PROJECT_COLUMNS)
    .eq("user_id", userId)
    .in("id", projectIds)
    .is("archived_at", null);

  if (projectError) throw new Error(`Failed to load focused project rows: ${projectError.message}`);
  const projectById = new Map(((projectRows ?? []) as Project[]).map((project) => [project.id, project]));

  return focuses.flatMap((focus) => {
    const task = taskById.get(focus.project_task_id);
    if (!task) return [];
    const project = projectById.get(task.project_id);
    if (!project) return [];
    return [{ focus, task, project }];
  });
}

export async function completeFocusedProjectTask(userId: string, taskId: string) {
  const task = await updateProjectTask(userId, taskId, { status: "done" });
  await removeProjectTaskFocus(userId, taskId);
  return task;
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
  if (board.activeProject?.id !== input.projectId) throw new Error("Project not found");

  const parentTask = input.parentTaskId ? board.tasks.find((task) => task.id === input.parentTaskId) : null;
  if (input.parentTaskId && (!parentTask || parentTask.parent_task_id !== null || parentTask.archived_at)) {
    throw new Error("Parent task not found");
  }

  const siblingPositions = parentTask ? parentTask.subtasks : board.tasks.filter((task) => task.status === status);

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
  if (typeof patch.title === "string") {
    const title = patch.title.trim();
    if (!title) throw new Error("Task title is required");
    payload.title = title;
  }
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
  if (typeof patch.title === "string") {
    const title = patch.title.trim();
    if (!title) throw new Error("Checklist title is required");
    payload.title = title;
  }
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

import type {
  MobileProjectArea,
  MobileProjectBoardPayload,
  MobileProject,
  MobileProjectSubtask,
  MobileProjectTask,
  MobileProjectTaskStatus,
} from "./projects-types";

type ProjectStatusTab = { key: MobileProjectTaskStatus; label: string };
type ProjectAreaTab = { key: MobileProjectArea; label: string };

export function projectAreaTabs(): ProjectAreaTab[] {
  return [
    { key: "demand", label: "Demand" },
    { key: "delivery", label: "Delivery" },
    { key: "personal", label: "Personal" },
  ];
}

export function projectStatusTabs(): ProjectStatusTab[] {
  return [
    { key: "backlog", label: "Backlog" },
    { key: "todo", label: "To Do" },
    { key: "doing", label: "Doing" },
    { key: "waiting", label: "Waiting" },
    { key: "done", label: "Done" },
  ];
}

export function getMobileDevKey() {
  return process.env.EXPO_PUBLIC_MOBILE_DEV_API_KEY?.trim() ?? "";
}

export function getBackendBaseUrl() {
  return process.env.EXPO_PUBLIC_BACKEND_BASE_URL?.trim() || "http://127.0.0.1:3002";
}

export function canUseBackendApi() {
  return typeof fetch === "function" && process.env.EXPO_PUBLIC_USE_REAL_BACKEND === "true";
}

export async function requestProjectsApi<T>(path: string, init: RequestInit = {}): Promise<T> {
  const devKey = getMobileDevKey();
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  if (devKey) headers.set("x-mobile-dev-key", devKey);

  const response = await fetch(`${getBackendBaseUrl()}${path}`, {
    ...init,
    headers,
  });

  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(message || `Projects API request failed with status ${response.status}`);
  }

  return (await response.json()) as T;
}

function createInitialMockProjectBoard(): MobileProjectBoardPayload {
  const activeProject = {
    id: "project-mobile-demo",
    area: "demand" as const,
    name: "Mobile Project",
    description: "A project board for mobile development",
    position: 1000,
    archived_at: null,
  };
  const deliveryProject = {
    id: "project-mobile-delivery",
    area: "delivery" as const,
    name: "Delivery Project",
    description: "Operations and service delivery",
    position: 1000,
    archived_at: null,
  };
  const personalProject = {
    id: "project-mobile-personal",
    area: "personal" as const,
    name: "Personal Project",
    description: "Personal goals",
    position: 1000,
    archived_at: null,
  };

  return {
    projects: [activeProject, deliveryProject, personalProject],
    activeProject,
    tasks: [
      {
        id: "task-mobile-demo",
        project_id: activeProject.id,
        parent_task_id: null,
        title: "Review mobile project board",
        description: "Validate the mobile project contracts before building screens.",
        status: "todo",
        position: 1000,
        due_date: null,
        labels: [{ name: "Mobile", color: "#2563eb" }],
        checklist: [
          {
            id: "checklist-mobile-demo",
            task_id: "task-mobile-demo",
            title: "Confirm route payload shape",
            completed: false,
            position: 1000,
          },
        ],
        subtasks: [
          {
            id: "subtask-mobile-demo",
            project_id: activeProject.id,
            parent_task_id: "task-mobile-demo",
            title: "Add API client mock mode",
            description: null,
            status: "todo",
            position: 1000,
            due_date: null,
            labels: [],
            checklist: [],
          },
        ],
      },
    ],
  };
}

let mockProjectBoard = createInitialMockProjectBoard();
let mockTaskSequence = 1;

function cloneMockBoard(board: MobileProjectBoardPayload): MobileProjectBoardPayload {
  return {
    projects: board.projects.map((project) => ({ ...project })),
    activeProject: board.activeProject ? { ...board.activeProject } : null,
    tasks: board.tasks.map((task) => ({
      ...task,
      labels: task.labels.map((label) => ({ ...label })),
      checklist: task.checklist.map((item) => ({ ...item })),
      subtasks: task.subtasks.map((subtask) => ({
        ...subtask,
        labels: subtask.labels.map((label) => ({ ...label })),
        checklist: subtask.checklist.map((item) => ({ ...item })),
      })),
    })),
  };
}

function updateMockTask(
  taskId: string,
  updater: (task: MobileProjectTask | MobileProjectSubtask) => MobileProjectTask | MobileProjectSubtask,
) {
  let updatedTask: MobileProjectTask | MobileProjectSubtask | null = null;
  mockProjectBoard = {
    ...mockProjectBoard,
    tasks: mockProjectBoard.tasks.map((task) => {
      if (task.id === taskId) {
        updatedTask = updater(task);
        return updatedTask as MobileProjectTask;
      }

      const subtasks = task.subtasks.map((subtask) => {
        if (subtask.id !== taskId) return subtask;
        updatedTask = updater(subtask);
        return updatedTask as MobileProjectSubtask;
      });
      return { ...task, subtasks };
    }),
  };
  return updatedTask;
}

export function resetMockProjectBoard() {
  mockProjectBoard = createInitialMockProjectBoard();
  mockTaskSequence = 1;
}

export async function buildMockProjectBoard(): Promise<MobileProjectBoardPayload> {
  return cloneMockBoard(createInitialMockProjectBoard());
}

export async function getMobileProjectBoard(
  projectId?: string | null,
  area: MobileProjectArea = "demand",
  archived = false,
): Promise<MobileProjectBoardPayload> {
  if (!canUseBackendApi()) {
    const projects = mockProjectBoard.projects.filter((project) =>
      projectId ? true : project.area === area && Boolean(project.archived_at) === archived,
    );
    const requestedProject = projectId
      ? mockProjectBoard.projects.find((project) => project.id === projectId) ?? projects[0] ?? null
      : projects[0] ?? null;
    return cloneMockBoard({
      ...mockProjectBoard,
      projects,
      activeProject: requestedProject,
      tasks: requestedProject
        ? mockProjectBoard.tasks.filter((task) => task.project_id === requestedProject.id)
        : [],
    });
  }

  const path = projectId
    ? archived
      ? `/api/mobile/projects?area=${encodeURIComponent(area)}&archived=1&project=${encodeURIComponent(projectId)}`
      : `/api/mobile/projects/${encodeURIComponent(projectId)}/board`
    : `/api/mobile/projects?area=${encodeURIComponent(area)}${archived ? "&archived=1" : ""}`;
  return requestProjectsApi<MobileProjectBoardPayload>(path);
}

export async function updateMobileProjectArchive(projectId: string, archived: boolean) {
  if (canUseBackendApi()) {
    return requestProjectsApi(`/api/mobile/projects`, {
      method: "PATCH",
      body: JSON.stringify({ projectId, archived }),
    });
  }

  const archivedAt = archived ? new Date().toISOString() : null;
  const existing = mockProjectBoard.projects.find((project) => project.id === projectId);
  if (!existing) throw new Error("Project not found");

  const updated: MobileProject = { ...existing, archived_at: archivedAt };
  mockProjectBoard = {
    ...mockProjectBoard,
    projects: mockProjectBoard.projects.map((project) => (project.id === projectId ? updated : project)),
    activeProject:
      mockProjectBoard.activeProject?.id === projectId
        ? { ...mockProjectBoard.activeProject, archived_at: archivedAt }
        : mockProjectBoard.activeProject,
  };

  return { ...updated };
}

export function buildProjectTaskStatusPatch(status: MobileProjectTaskStatus) {
  return { status };
}

export async function createMobileProjectTask(projectId: string, title: string, status: MobileProjectTaskStatus) {
  const cleanTitle = title.trim();
  if (canUseBackendApi()) {
    const task = await requestProjectsApi<MobileProjectTask>(`/api/mobile/projects/${encodeURIComponent(projectId)}/tasks`, {
      method: "POST",
      body: JSON.stringify({ title: cleanTitle, status }),
    });
    return { ...task, checklist: task.checklist ?? [], subtasks: task.subtasks ?? [] };
  }

  const task: MobileProjectTask = {
    id: `mock-${Date.now()}-${mockTaskSequence++}`,
    project_id: projectId,
    parent_task_id: null,
    title: cleanTitle,
    description: null,
    status,
    position: Math.max(0, ...mockProjectBoard.tasks.map((candidate) => candidate.position)) + 1000,
    due_date: null,
    labels: [],
    checklist: [],
    subtasks: [],
  };
  mockProjectBoard = { ...mockProjectBoard, tasks: [task, ...mockProjectBoard.tasks] };
  return cloneMockBoard({ ...mockProjectBoard, tasks: [task] }).tasks[0];
}

export async function updateMobileProjectTask(projectId: string, taskId: string, patch: Record<string, unknown>) {
  if (canUseBackendApi()) {
    return requestProjectsApi(
      `/api/mobile/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(taskId)}`,
      {
        method: "PATCH",
        body: JSON.stringify(patch),
      },
    );
  }

  const updated = updateMockTask(taskId, (task) => ({
    ...task,
    title: typeof patch.title === "string" ? patch.title.trim() : task.title,
    description: "description" in patch ? (typeof patch.description === "string" ? patch.description.trim() || null : null) : task.description,
    status: typeof patch.status === "string" ? (patch.status as MobileProjectTaskStatus) : task.status,
    due_date: "due_date" in patch ? (typeof patch.due_date === "string" ? patch.due_date : null) : task.due_date,
    labels: Array.isArray(patch.labels) ? task.labels : task.labels,
  }));

  return updated ? { ok: true } : { ok: false };
}

export async function updateMobileProjectChecklistItem(
  projectId: string,
  taskId: string,
  itemId: string,
  patch: Record<string, unknown>,
) {
  if (canUseBackendApi()) {
    return requestProjectsApi(
      `/api/mobile/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(taskId)}/checklist`,
      {
        method: "PATCH",
        body: JSON.stringify({ itemId, ...patch }),
      },
    );
  }

  const updated = updateMockTask(taskId, (task) => ({
    ...task,
    checklist: task.checklist.map((item) =>
      item.id === itemId
        ? {
            ...item,
            title: typeof patch.title === "string" ? patch.title.trim() : item.title,
            completed: typeof patch.completed === "boolean" ? patch.completed : item.completed,
            position: typeof patch.position === "number" ? patch.position : item.position,
          }
        : item,
    ),
  }));

  return updated ? { ok: true } : { ok: false };
}

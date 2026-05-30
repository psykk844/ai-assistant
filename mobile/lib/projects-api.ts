import type { MobileProjectBoardPayload, MobileProjectTaskStatus } from "./projects-types";

type ProjectStatusTab = { key: MobileProjectTaskStatus; label: string };

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

export async function buildMockProjectBoard(): Promise<MobileProjectBoardPayload> {
  const activeProject = {
    id: "project-mobile-demo",
    name: "Mobile Project",
    description: "A project board for mobile development",
    position: 1000,
  };

  return {
    projects: [activeProject],
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

export async function getMobileProjectBoard(projectId?: string | null): Promise<MobileProjectBoardPayload> {
  if (!canUseBackendApi()) {
    return buildMockProjectBoard();
  }

  const suffix = projectId ? `?project=${encodeURIComponent(projectId)}` : "";
  return requestProjectsApi<MobileProjectBoardPayload>(`/api/mobile/projects${suffix}`);
}

export const PROJECT_AREA_ORDER = ["demand", "delivery", "personal"] as const;
export const PROJECT_STATUS_ORDER = ["backlog", "todo", "doing", "waiting", "done"] as const;

export type ProjectArea = (typeof PROJECT_AREA_ORDER)[number];
export type ProjectTaskStatus = (typeof PROJECT_STATUS_ORDER)[number];

export function isProjectArea(value: unknown): value is ProjectArea {
  return typeof value === "string" && PROJECT_AREA_ORDER.includes(value as ProjectArea);
}

export function isProjectTaskStatus(value: unknown): value is ProjectTaskStatus {
  return typeof value === "string" && PROJECT_STATUS_ORDER.includes(value as ProjectTaskStatus);
}

export function areaLabel(area: ProjectArea) {
  const labels: Record<ProjectArea, string> = {
    demand: "Demand",
    delivery: "Delivery",
    personal: "Personal",
  };
  return labels[area];
}

export function statusLabel(status: ProjectTaskStatus) {
  const labels: Record<ProjectTaskStatus, string> = {
    backlog: "Backlog",
    todo: "To Do",
    doing: "Doing",
    waiting: "Waiting",
    done: "Done",
  };
  return labels[status];
}

export function compareProjectTaskPositions(
  a: { position: number; created_at: string },
  b: { position: number; created_at: string },
) {
  if (a.position !== b.position) return a.position - b.position;
  return a.created_at.localeCompare(b.created_at);
}

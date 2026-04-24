export type LaneKey = "today" | "next" | "upcoming" | "backlog";

/**
 * Lane bands by priority_score (higher = more urgent):
 *  - today    : >= 0.85    (shown as "Top 5" on My Day)
 *  - next     : >= 0.70    (shown as "Next 5" on My Day)
 *  - upcoming : >= 0.50    (board overflow from Next 5)
 *  - backlog  : < 0.50     (everything else)
 */
export function laneFromItem(item: { status: string; priority_score: number }): LaneKey {
  if (item.status !== "active") return "backlog";
  if (item.priority_score >= 0.85) return "today";
  if (item.priority_score >= 0.7) return "next";
  if (item.priority_score >= 0.5) return "upcoming";
  return "backlog";
}

export function laneToPriority(lane: LaneKey): number {
  if (lane === "today") return 0.85;
  if (lane === "next") return 0.7;
  if (lane === "upcoming") return 0.55;
  return 0.4;
}

export const LANE_LABELS: Record<LaneKey, string> = {
  today: "Today",
  next: "Next Up",
  upcoming: "Upcoming",
  backlog: "Backlog",
};

export const LANE_ORDER: LaneKey[] = ["today", "next", "upcoming", "backlog"];

export function isValidLane(value: unknown): value is LaneKey {
  return value === "today" || value === "next" || value === "upcoming" || value === "backlog";
}

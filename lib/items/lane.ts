export type LaneKey = "today" | "next" | "backlog";

export function laneFromItem(item: { status: string; priority_score: number }): LaneKey {
  if (item.status !== "active") return "backlog";
  if (item.priority_score >= 0.85) return "today";
  if (item.priority_score >= 0.7) return "next";
  return "backlog";
}

export function laneToPriority(lane: LaneKey): number {
  if (lane === "today") return 0.85;
  if (lane === "next") return 0.7;
  return 0.4;
}

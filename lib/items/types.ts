import type { LaneKey } from "@/lib/items/lane";

export type ItemType = "note" | "todo" | "link";
export type ItemStatus = "active" | "completed" | "archived";

export type InboxItem = {
  id: string;
  type: ItemType;
  title: string | null;
  content: string;
  status: ItemStatus;
  priority_score: number;
  confidence_score: number | null;
  needs_review: boolean;
  created_at: string;
  updated_at?: string;
  metadata?: Record<string, unknown>;
};

export type ItemWithLane = InboxItem & { lane: LaneKey };

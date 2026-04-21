import type { LaneKey } from "@/lib/items/lane";

export type ItemType = "note" | "todo" | "link";
export type ItemStatus = "active" | "completed" | "archived";

export type ItemMetadata = {
  dismissed?: boolean;
  deleted_at?: string;
  cleared_from_backlog?: boolean;
  parent_item_id?: string;
  generated_from?: string;
  [key: string]: unknown;
};

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
  metadata?: ItemMetadata | null;
};

export type ItemWithLane = InboxItem & { lane: LaneKey };

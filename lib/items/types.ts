import type { LaneKey } from "@/lib/items/lane";

export type ItemType = "note" | "todo" | "link";
export type ItemStatus = "active" | "completed" | "archived";

export type RecurrenceFrequency = "daily" | "weekly";

export type RecurrenceConfig = {
  frequency: RecurrenceFrequency;
  days?: number[]; // For weekly: 1=Mon..7=Sun
  next_due: string; // ISO date "2026-04-24"
  template_id?: string; // On generated instances, points to template
  is_template?: boolean; // true on the original recurring item
};

export type LinkSummary = {
  url: string;
  site_name: string | null;
  page_title: string | null;
  description: string | null;
  ai_summary: string | null;
};

export type ItemMetadata = {
  dismissed?: boolean;
  deleted_at?: string;
  cleared_from_backlog?: boolean;
  parent_item_id?: string;
  generated_from?: string;
  recurrence?: RecurrenceConfig;
  subtask_order?: string[]; // ordered child IDs for manual reorder
  link_summary?: LinkSummary;
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
  tags: string[];
};

export type ItemWithLane = InboxItem & { lane: LaneKey };

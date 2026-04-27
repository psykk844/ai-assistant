import type { InboxItem, ItemStatus, ItemType } from "../shared/types";
import type { LaneKey } from "../shared/lane";

export type MobileLaneKey = LaneKey;

export type MobileItemPreview = Pick<
  InboxItem,
  "id" | "title" | "content" | "created_at" | "priority_score" | "tags"
> & {
  type: ItemType;
  status: ItemStatus;
  lane: MobileLaneKey;
};

export type MobileHomeCounts = {
  todayTotal: number;
  nextTotal: number;
  upcomingTotal: number;
  backlogTotal: number;
};

export type MobileHomePayload = {
  today: MobileItemPreview[];
  next: MobileItemPreview[];
  counts: MobileHomeCounts;
};

export type MobileBacklogPage = {
  items: MobileItemPreview[];
  pageInfo: {
    nextCursor: string | null;
    hasMore: boolean;
  };
};

export type MobileBacklogQuery = {
  cursor?: string;
  limit: number;
  search?: string;
};

export type MobileItemUpdateInput = Partial<
  Pick<MobileItemPreview, "title" | "content" | "lane" | "status" | "priority_score" | "tags">
>;

import { laneFromItem } from "./lane";
import { compareMyDay, computeMyDayPlan } from "./my-day-plan";
import type { InboxItem } from "./types";
import type { MobileBacklogPage, MobileBacklogQuery, MobileHomePayload, MobileItemPreview } from "../../mobile/lib/types";

function toMobileItemPreview(item: InboxItem): MobileItemPreview {
  return {
    id: item.id,
    title: item.title,
    content: item.content,
    created_at: item.created_at,
    priority_score: item.priority_score,
    tags: item.tags,
    type: item.type,
    status: item.status,
    lane: laneFromItem(item),
  };
}

export function buildMobileHomePayload(items: InboxItem[]): MobileHomePayload {
  const counts = items.reduce(
    (acc, item) => {
      const lane = laneFromItem(item);
      if (lane === "today") acc.todayTotal += 1;
      else if (lane === "next") acc.nextTotal += 1;
      else if (lane === "upcoming") acc.upcomingTotal += 1;
      else acc.backlogTotal += 1;
      return acc;
    },
    {
      todayTotal: 0,
      nextTotal: 0,
      upcomingTotal: 0,
      backlogTotal: 0,
    },
  );

  const plan = computeMyDayPlan(items);

  return {
    today: plan.top5.map(toMobileItemPreview),
    next: plan.next5.map(toMobileItemPreview),
    counts,
  };
}

export function buildMobileBacklogPage(items: InboxItem[], query: MobileBacklogQuery): MobileBacklogPage {
  const limit = Math.max(1, query.limit);
  const backlogItems = items
    .filter((item) => laneFromItem(item) === "backlog")
    .sort(compareMyDay);

  const startIndex = query.cursor ? backlogItems.findIndex((item) => item.id === query.cursor) + 1 : 0;
  const safeStartIndex = Math.max(0, startIndex);
  const pageItems = backlogItems.slice(safeStartIndex, safeStartIndex + limit);
  const nextIndex = safeStartIndex + pageItems.length;
  const hasMore = nextIndex < backlogItems.length;

  return {
    items: pageItems.map(toMobileItemPreview),
    pageInfo: {
      nextCursor: hasMore && pageItems.length > 0 ? pageItems[pageItems.length - 1].id : null,
      hasMore,
    },
  };
}

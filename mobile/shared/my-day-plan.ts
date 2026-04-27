import type { InboxItem } from "./types";
import { laneFromItem, type LaneKey } from "./lane";

export const MY_DAY_CAP = 5;

/**
 * A computed My Day plan: ordered slots for Top 5 (today lane) and Next 5
 * (next lane). Overflow cascades downward: any 6th+ item in Top 5 pushes
 * into the top of Next 5; any 6th+ item in Next 5 pushes into upcoming.
 */
export type MyDayPlan = {
  top5: InboxItem[];   // items to show as "Top 5" (all should be in today lane)
  next5: InboxItem[];  // items to show as "Next 5" (all should be in next lane)
  /** Items that overflowed out of Next 5 into upcoming (not shown on My Day). */
  overflow: InboxItem[];
};

/** Sort comparator: metadata.my_day_order asc (null last), priority_score desc, created_at desc. */
export function compareMyDay(a: InboxItem, b: InboxItem): number {
  const ao = (a.metadata as { my_day_order?: number } | null | undefined)?.my_day_order;
  const bo = (b.metadata as { my_day_order?: number } | null | undefined)?.my_day_order;
  const aHas = typeof ao === "number";
  const bHas = typeof bo === "number";
  if (aHas && bHas) {
    if (ao !== bo) return (ao as number) - (bo as number);
  } else if (aHas !== bHas) {
    return aHas ? -1 : 1;
  }
  if (a.priority_score !== b.priority_score) return b.priority_score - a.priority_score;
  return (b.created_at ?? "").localeCompare(a.created_at ?? "");
}

/**
 * Compute the My Day plan from all active top-level items.
 * Input: items already filtered (active, not subtask, not trash).
 * The cascade is deterministic and pure — same input always produces the same plan.
 */
export function computeMyDayPlan(items: InboxItem[]): MyDayPlan {
  const today: InboxItem[] = [];
  const next: InboxItem[] = [];
  const rest: InboxItem[] = [];

  for (const item of items) {
    const lane = laneFromItem(item);
    if (lane === "today") today.push(item);
    else if (lane === "next") next.push(item);
    else rest.push(item); // upcoming + backlog
  }

  today.sort(compareMyDay);
  next.sort(compareMyDay);
  rest.sort(compareMyDay);

  // Today overflow cascades to the front of Next
  const top5 = today.slice(0, MY_DAY_CAP);
  const todayOverflow = today.slice(MY_DAY_CAP);

  const nextCombined = [...todayOverflow, ...next];
  const next5 = nextCombined.slice(0, MY_DAY_CAP);
  const nextOverflow = nextCombined.slice(MY_DAY_CAP);

  return {
    top5,
    next5,
    overflow: [...nextOverflow, ...rest],
  };
}

/**
 * Plan for a drag-and-drop reorder on My Day. Pure function — no side effects.
 *
 * @param allItems All top-level active items (may include items currently in upcoming/backlog).
 * @param draggedId The item being moved.
 * @param targetSection Which section the item is being dropped into.
 * @param targetIndex The index within that section (0 = top).
 * @returns A list of item id → { lane, my_day_order } patches to persist.
 *          Includes cascade patches for items bumped out of a full section.
 */
export type ReorderPatch = {
  id: string;
  targetLane: LaneKey;
  my_day_order: number;
};

export function planMyDayReorder(
  allItems: InboxItem[],
  draggedId: string,
  targetSection: "top5" | "next5",
  targetIndex: number,
): ReorderPatch[] {
  const dragged = allItems.find((i) => i.id === draggedId);
  if (!dragged) return [];

  // Rebuild Top 5 and Next 5 without the dragged item, then insert it.
  const plan = computeMyDayPlan(allItems);
  const top = plan.top5.filter((i) => i.id !== draggedId);
  const nxt = plan.next5.filter((i) => i.id !== draggedId);

  if (targetSection === "top5") {
    top.splice(Math.max(0, Math.min(targetIndex, top.length)), 0, dragged);
  } else {
    nxt.splice(Math.max(0, Math.min(targetIndex, nxt.length)), 0, dragged);
  }

  // Apply cap + cascade: anything past index 5 in top flows to front of next.
  const topFinal = top.slice(0, MY_DAY_CAP);
  const bumpedFromTop = top.slice(MY_DAY_CAP);
  const nxtWithBump = [...bumpedFromTop, ...nxt];
  const nxtFinal = nxtWithBump.slice(0, MY_DAY_CAP);
  const bumpedFromNext = nxtWithBump.slice(MY_DAY_CAP);

  const patches: ReorderPatch[] = [];

  topFinal.forEach((item, idx) => {
    patches.push({ id: item.id, targetLane: "today", my_day_order: idx });
  });
  nxtFinal.forEach((item, idx) => {
    patches.push({ id: item.id, targetLane: "next", my_day_order: idx });
  });
  // Items bumped out of Next 5 go to upcoming, with order cleared (they become
  // auto-sorted in the upcoming lane on the board).
  bumpedFromNext.forEach((item) => {
    patches.push({ id: item.id, targetLane: "upcoming", my_day_order: Number.NaN });
  });

  // Only return patches where lane or order actually changed, to minimize writes.
  return patches.filter((patch) => {
    const current = allItems.find((i) => i.id === patch.id);
    if (!current) return false;
    const currentLane = laneFromItem(current);
    const currentOrder = (current.metadata as { my_day_order?: number } | null | undefined)?.my_day_order;
    if (currentLane !== patch.targetLane) return true;
    if (Number.isNaN(patch.my_day_order)) {
      return typeof currentOrder === "number"; // only if we need to clear it
    }
    return currentOrder !== patch.my_day_order;
  });
}

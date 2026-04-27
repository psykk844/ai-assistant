import type { LaneKey } from "../../lib/items/lane";
import type { MobileHomePayload, MobileItemPreview } from "./types";

function decrementCount(payload: MobileHomePayload, lane: LaneKey): MobileHomePayload["counts"] {
  if (lane === "today") {
    return { ...payload.counts, todayTotal: Math.max(0, payload.counts.todayTotal - 1) };
  }
  if (lane === "next") {
    return { ...payload.counts, nextTotal: Math.max(0, payload.counts.nextTotal - 1) };
  }
  if (lane === "upcoming") {
    return { ...payload.counts, upcomingTotal: Math.max(0, payload.counts.upcomingTotal - 1) };
  }
  return { ...payload.counts, backlogTotal: Math.max(0, payload.counts.backlogTotal - 1) };
}

function incrementCount(payload: MobileHomePayload, lane: LaneKey): MobileHomePayload["counts"] {
  if (lane === "today") {
    return { ...payload.counts, todayTotal: payload.counts.todayTotal + 1 };
  }
  if (lane === "next") {
    return { ...payload.counts, nextTotal: payload.counts.nextTotal + 1 };
  }
  if (lane === "upcoming") {
    return { ...payload.counts, upcomingTotal: payload.counts.upcomingTotal + 1 };
  }
  return { ...payload.counts, backlogTotal: payload.counts.backlogTotal + 1 };
}

function extractFocusedItem(payload: MobileHomePayload, itemId: string): { item: MobileItemPreview; fromLane: "today" | "next" } | null {
  const fromToday = payload.today.find((item) => item.id === itemId);
  if (fromToday) return { item: fromToday, fromLane: "today" };

  const fromNext = payload.next.find((item) => item.id === itemId);
  if (fromNext) return { item: fromNext, fromLane: "next" };

  return null;
}

function removeFromFocused(payload: MobileHomePayload, itemId: string): Pick<MobileHomePayload, "today" | "next"> {
  return {
    today: payload.today.filter((item) => item.id !== itemId),
    next: payload.next.filter((item) => item.id !== itemId),
  };
}

export function completeFromHomePayload(payload: MobileHomePayload, itemId: string): MobileHomePayload {
  const located = extractFocusedItem(payload, itemId);
  if (!located) return payload;

  const focused = removeFromFocused(payload, itemId);
  return {
    ...payload,
    ...focused,
    counts: decrementCount(payload, located.fromLane),
  };
}

export function moveInHomePayload(payload: MobileHomePayload, itemId: string, toLane: LaneKey): MobileHomePayload {
  const located = extractFocusedItem(payload, itemId);
  if (!located) return payload;
  if (located.fromLane === toLane) return payload;

  const focused = removeFromFocused(payload, itemId);
  const movedItem: MobileItemPreview = {
    ...located.item,
    lane: toLane,
  };

  let nextPayload: MobileHomePayload = {
    ...payload,
    ...focused,
    counts: incrementCount(
      {
        ...payload,
        counts: decrementCount(payload, located.fromLane),
      },
      toLane,
    ),
  };

  if (toLane === "today") {
    nextPayload = {
      ...nextPayload,
      today: [movedItem, ...nextPayload.today].slice(0, 5),
    };
  }

  if (toLane === "next") {
    nextPayload = {
      ...nextPayload,
      next: [movedItem, ...nextPayload.next].slice(0, 5),
    };
  }

  return nextPayload;
}

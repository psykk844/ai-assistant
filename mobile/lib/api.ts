import { buildMobileBacklogPage, buildMobileHomePayload } from "../shared/mobile-contracts";
import { laneFromItem, laneToPriority, type LaneKey } from "../shared/lane";
import type { MobileBacklogPage, MobileBacklogQuery, MobileHomePayload, MobileItemPreview } from "./types";
import type { InboxItem } from "../shared/types";

function makeMockItem(id: string, priority: number, createdAt: string, order?: number): InboxItem {
  return {
    id,
    type: "todo",
    title: id,
    content: `${id} content`,
    status: "active",
    priority_score: priority,
    confidence_score: null,
    needs_review: false,
    created_at: createdAt,
    metadata: typeof order === "number" ? { my_day_order: order } : {},
    tags: [],
  };
}

const mockItems: InboxItem[] = [
  ...Array.from({ length: 6 }, (_, index) =>
    makeMockItem(`today-${index + 1}`, 0.9, `2026-04-26T0${index}:00:00Z`, index),
  ),
  ...Array.from({ length: 4 }, (_, index) =>
    makeMockItem(`next-${index + 1}`, 0.75, `2026-04-25T0${index}:00:00Z`, index),
  ),
  ...Array.from({ length: 3 }, (_, index) =>
    makeMockItem(`upcoming-${index + 1}`, 0.55, `2026-04-24T0${index}:00:00Z`),
  ),
  ...Array.from({ length: 2 }, (_, index) =>
    makeMockItem(`backlog-${index + 1}`, 0.2, `2026-04-23T0${index}:00:00Z`),
  ),
];

function toMobilePreview(item: InboxItem): MobileItemPreview {
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

function getMobileDevKey() {
  return process.env.EXPO_PUBLIC_MOBILE_DEV_API_KEY?.trim() ?? "";
}

function buildRequestHeaders(existing?: HeadersInit) {
  const headers = new Headers(existing);
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const devKey = getMobileDevKey();
  if (devKey) {
    headers.set("x-mobile-dev-key", devKey);
  }

  return headers;
}

function getBackendBaseUrl() {
  return process.env.EXPO_PUBLIC_BACKEND_BASE_URL?.trim() || "http://127.0.0.1:3002";
}

async function requestMobileApi<T>(path: string, init?: RequestInit): Promise<T> {
  const target = path.startsWith("http") ? path : `${getBackendBaseUrl()}${path}`;
  const response = await fetch(target, {
    ...init,
    headers: buildRequestHeaders(init?.headers),
  });

  if (!response.ok) {
    throw new Error(`Mobile API request failed (${response.status}) for ${path}`);
  }

  return (await response.json()) as T;
}

function canUseBackendApi() {
  return typeof fetch === "function" && process.env.EXPO_PUBLIC_USE_REAL_BACKEND === "true";
}

export function getMobileBackendModeLabel() {
  return canUseBackendApi() ? "backend" : "mock";
}

export async function getMobileHomePayload(): Promise<MobileHomePayload> {
  if (canUseBackendApi()) {
    return requestMobileApi<MobileHomePayload>("/api/mobile/home");
  }

  return buildMobileHomePayload(mockItems);
}

export async function getMobileBacklogPage(query: MobileBacklogQuery): Promise<MobileBacklogPage> {
  if (canUseBackendApi()) {
    const params = new URLSearchParams();
    params.set("limit", String(query.limit));
    if (query.cursor) params.set("cursor", query.cursor);
    if (query.search?.trim()) params.set("search", query.search.trim());
    return requestMobileApi<MobileBacklogPage>(`/api/mobile/backlog?${params.toString()}`);
  }

  const normalizedSearch = query.search?.trim().toLowerCase() ?? "";
  const sourceItems = normalizedSearch
    ? mockItems.filter((item) => {
        const haystack = `${item.title ?? ""} ${item.content}`.toLowerCase();
        return haystack.includes(normalizedSearch);
      })
    : mockItems;

  return buildMobileBacklogPage(sourceItems, query);
}

export function buildQuickAddDraft(content: string, lane: LaneKey) {
  return {
    content: content.trim(),
    lane,
    priority_score: laneToPriority(lane),
  };
}

export async function createQuickAddItem(content: string, lane: LaneKey): Promise<MobileItemPreview> {
  if (canUseBackendApi()) {
    return requestMobileApi<MobileItemPreview>("/api/mobile/items", {
      method: "POST",
      body: JSON.stringify({ content: content.trim(), lane }),
    });
  }

  const draft = buildQuickAddDraft(content, lane);
  const now = new Date().toISOString();

  const inboxItem: InboxItem = {
    id: `mock-${Math.random().toString(36).slice(2, 10)}`,
    type: "todo",
    title: draft.content,
    content: draft.content,
    status: "active",
    priority_score: draft.priority_score,
    confidence_score: null,
    needs_review: false,
    created_at: now,
    metadata: {},
    tags: [],
  };

  mockItems.unshift(inboxItem);
  return toMobilePreview(inboxItem);
}

export async function getMobileItemById(itemId: string): Promise<MobileItemPreview | null> {
  if (canUseBackendApi()) {
    try {
      return await requestMobileApi<MobileItemPreview>(`/api/mobile/items/${itemId}`);
    } catch (error) {
      if (error instanceof Error && error.message.includes("(404)")) {
        return null;
      }
      throw error;
    }
  }

  const item = mockItems.find((candidate) => candidate.id === itemId);
  return item ? toMobilePreview(item) : null;
}

export async function completeItem(itemId: string): Promise<void> {
  if (canUseBackendApi()) {
    await requestMobileApi<{ ok: boolean }>(`/api/mobile/items/${itemId}/complete`, { method: "POST" });
    return;
  }

  const item = mockItems.find((candidate) => candidate.id === itemId);
  if (item) {
    item.status = "completed";
  }
}

export async function moveItemToLane(itemId: string, lane: LaneKey): Promise<void> {
  if (canUseBackendApi()) {
    await requestMobileApi<{ ok: boolean }>(`/api/mobile/items/${itemId}/move`, {
      method: "POST",
      body: JSON.stringify({ lane }),
    });
    return;
  }

  const item = mockItems.find((candidate) => candidate.id === itemId);
  if (item) {
    item.status = "active";
    item.priority_score = laneToPriority(lane);
  }
}

export async function getMockMobileHomePayload(): Promise<MobileHomePayload> {
  return buildMobileHomePayload(mockItems);
}

export async function getMockMobileItemById(itemId: string): Promise<MobileItemPreview | null> {
  const item = mockItems.find((candidate) => candidate.id === itemId);
  return item ? toMobilePreview(item) : null;
}

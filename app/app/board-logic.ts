import type { InboxItem, ItemMetadata } from "@/lib/items/types";
import { readItemTags } from "./item-tags";

type FilterKey = "all" | "active" | "completed" | "archived" | "todo" | "note" | "link" | "trash";

export function asMetadata(metadata: InboxItem["metadata"]): ItemMetadata {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return {};
  return metadata;
}

export function isTrash(item: InboxItem) {
  const metadata = asMetadata(item.metadata);
  return item.status === "archived" && typeof metadata.deleted_at === "string";
}

export function getDragActivationDistance() {
  return 5;
}

export function getDragHandleLabel(item: Pick<InboxItem, "title" | "content">) {
  const label = item.title?.trim() || item.content.trim().slice(0, 40) || "untitled item";
  return `Drag item ${label}`;
}

export function shouldHideFromInitialBoard(item: InboxItem) {
  const metadata = asMetadata(item.metadata);
  return metadata.dismissed === true && !isTrash(item);
}

export function filterBoardItems(items: InboxItem[], activeFilter: FilterKey, activeTagFilter: string | null) {
  const base = items.filter((item) => !isTrash(item));

  let filtered: InboxItem[];
  if (activeFilter === "all") {
    filtered = base.filter((item) => item.status === "active");
  } else if (activeFilter === "active" || activeFilter === "completed" || activeFilter === "archived") {
    filtered = base.filter((item) => item.status === activeFilter);
  } else if (activeFilter === "todo" || activeFilter === "note" || activeFilter === "link") {
    // Type filters should only show active items of that type — completed/archived belong in their own filters
    filtered = base.filter((item) => item.type === activeFilter && item.status === "active");
  } else if (activeFilter === "trash") {
    filtered = [];
  } else {
    filtered = base;
  }

  if (!activeTagFilter) return filtered;
  return filtered.filter((item) => item.tags.includes(activeTagFilter));
}

export function normalizeItemTags<T extends { tags?: string[] | null }>(item: T) {
  return {
    ...item,
    tags: readItemTags(item as T & { metadata?: Record<string, unknown> }),
  };
}

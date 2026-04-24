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

/**
 * Subtasks (items with metadata.parent_item_id) should NOT appear as standalone
 * cards on the main board or in My Day lists. They are rendered inside the
 * parent item's SubtaskTreePanel in the detail view.
 *
 * Bug history: without this filter, "Add subtask" silently made subtasks appear
 * as their own board cards, which looked like the parent had "disappeared" and
 * cluttered lanes. See progress.md 2026-04-24.
 */
export function isSubtask(item: InboxItem): boolean {
  const metadata = asMetadata(item.metadata);
  return typeof metadata.parent_item_id === "string" && metadata.parent_item_id.length > 0;
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
  // Always exclude trash and subtasks from every board lane. Subtasks render
  // only inside the parent's DetailPanel → SubtaskTreePanel.
  const base = items.filter((item) => !isTrash(item) && !isSubtask(item));

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

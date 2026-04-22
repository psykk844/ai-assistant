import type { InboxItem, ItemMetadata } from "@/lib/items/types";

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

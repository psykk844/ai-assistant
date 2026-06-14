type ChecklistTitleDraftItem = {
  id: string;
  title: string;
};

export function mergeChecklistTitleDrafts(
  items: readonly ChecklistTitleDraftItem[],
  currentDrafts: Readonly<Record<string, string>>,
  dirtyItemIds: ReadonlySet<string>,
) {
  const nextDrafts: Record<string, string> = {};

  for (const item of items) {
    nextDrafts[item.id] = dirtyItemIds.has(item.id) ? currentDrafts[item.id] ?? item.title : item.title;
  }

  return nextDrafts;
}

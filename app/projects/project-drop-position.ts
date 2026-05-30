export type ProjectDropPlacement = "before" | "after";

export function positionForProjectDrop(
  items: Array<{ id: string; position: number }>,
  activeId: string,
  overId: string | null,
  placement: ProjectDropPlacement,
) {
  const withoutActive = items.filter((item) => item.id !== activeId);
  if (!overId) return (withoutActive.at(-1)?.position ?? 0) + 1000;

  const overIndex = withoutActive.findIndex((item) => item.id === overId);
  if (overIndex < 0) return (withoutActive.at(-1)?.position ?? 0) + 1000;

  if (placement === "after") {
    const before = withoutActive[overIndex]?.position ?? 0;
    const after = withoutActive[overIndex + 1]?.position;
    return after === undefined ? before + 1000 : (before + after) / 2;
  }

  const before = withoutActive[overIndex - 1]?.position ?? 0;
  const after = withoutActive[overIndex]?.position ?? before + 2000;
  return (before + after) / 2;
}

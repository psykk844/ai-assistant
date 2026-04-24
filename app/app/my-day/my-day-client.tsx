"use client";

import { useState, useEffect, useTransition, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
  useDroppable,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { InboxItem } from "@/lib/items/types";
import { buildSubtaskTree, getSubtaskProgress, type TreeNode } from "@/lib/items/subtask-tree";
import { computeMyDayPlan, MY_DAY_CAP } from "@/lib/items/my-day-plan";
import { buildFallbackBriefing } from "./briefing";
import {
  captureInboxItem,
  updateItemStatus,
  createSubtask,
  moveItemToLane,
  reorderMyDayItems,
} from "../actions";

interface MyDayProps {
  todayItems: InboxItem[];
  allActiveItems: InboxItem[];
  overdueItems: InboxItem[];
  staleItems: InboxItem[];
  completedTodayCount: number;
}

type SectionKey = "top5" | "next5";

export function MyDayClient({
  todayItems,
  allActiveItems,
  overdueItems,
  staleItems,
  completedTodayCount,
}: MyDayProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [briefingText, setBriefingText] = useState<string | null>(null);
  const [briefingOpen, setBriefingOpen] = useState(true);
  const [quickAddText, setQuickAddText] = useState("");
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  // Optimistic state: we mirror the server items so DnD feels instant.
  const [items, setItems] = useState(allActiveItems);
  useEffect(() => {
    setItems(allActiveItems);
  }, [allActiveItems]);

  const sensors = useSensors(
    // Desktop: small distance threshold so clicks don't start drags.
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    // Mobile: require a small hold before drag starts, so tapping a checkbox
    // or button doesn't get swallowed by the drag system.
    useSensor(TouchSensor, {
      activationConstraint: { delay: 180, tolerance: 6 },
    }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Build subtask tree from all active items (for sub rendering inside parent cards)
  const tree = useMemo(() => buildSubtaskTree(items), [items]);

  // Top-level only (exclude subtasks) for the My Day plan
  const topLevelItems = useMemo(
    () =>
      items.filter((i) => {
        const m = (i.metadata as Record<string, unknown> | null) ?? {};
        return !(typeof m.parent_item_id === "string" && (m.parent_item_id as string).length > 0);
      }),
    [items],
  );

  const plan = useMemo(() => computeMyDayPlan(topLevelItems), [topLevelItems]);

  // Get the full tree node for an item id (so we can render subtasks under it)
  const nodeById = useMemo(() => {
    const map = new Map<string, TreeNode>();
    const walk = (nodes: TreeNode[]) => {
      for (const n of nodes) {
        map.set(n.item.id, n);
        walk(n.children);
      }
    };
    walk(tree);
    return map;
  }, [tree]);

  const totalTasks = todayItems.length;
  const completedLocal = todayItems.filter((i) => i.status === "completed").length;
  const completedTotal = completedTodayCount + completedLocal;
  const progressPct = totalTasks + completedTodayCount > 0
    ? Math.round((completedTotal / (totalTasks + completedTodayCount)) * 100)
    : 0;

  // Generate briefing on mount (cached per day)
  useEffect(() => {
    const cacheKey = `briefing-${new Date().toISOString().slice(0, 10)}`;
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      setBriefingText(cached);
      return;
    }
    const text = buildFallbackBriefing(todayItems, overdueItems, staleItems);
    setBriefingText(text);
    localStorage.setItem(cacheKey, text);
  }, [todayItems, overdueItems, staleItems]);

  const handleComplete = useCallback((itemId: string, currentStatus: string) => {
    const nextStatus = currentStatus === "completed" ? "active" : "completed";
    // Optimistic update
    setItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, status: nextStatus as typeof i.status } : i)));
    startTransition(async () => {
      const form = new FormData();
      form.set("itemId", itemId);
      form.set("status", nextStatus);
      await updateItemStatus(form);
      router.refresh();
    });
  }, [router]);

  const handleQuickAdd = useCallback(async () => {
    if (!quickAddText.trim()) return;
    const form = new FormData();
    form.set("content", quickAddText.trim());
    startTransition(async () => {
      await captureInboxItem(form);
      setQuickAddText("");
      router.refresh();
    });
  }, [quickAddText, router]);

  const handleMoveSuggestion = useCallback((itemId: string) => {
    startTransition(async () => {
      await moveItemToLane({ itemId, toLane: "today" });
      router.refresh();
    });
  }, [router]);

  const toggleExpand = (id: string) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ============ DnD ============
  // Drop target ids: "droppable:top5" and "droppable:next5"; sortable ids = item.id.
  const TOP5_DROP = "droppable:top5";
  const NEXT5_DROP = "droppable:next5";

  function sectionOf(itemId: string): SectionKey | null {
    if (plan.top5.some((i) => i.id === itemId)) return "top5";
    if (plan.next5.some((i) => i.id === itemId)) return "next5";
    return null;
  }

  function handleDragEnd(event: DragEndEvent) {
    const activeId = String(event.active.id ?? "");
    const overId = String(event.over?.id ?? "");
    if (!activeId || !overId || activeId === overId) return;

    // Resolve target section + index
    let targetSection: SectionKey;
    let targetIndex: number;

    if (overId === TOP5_DROP) {
      targetSection = "top5";
      targetIndex = plan.top5.length;
    } else if (overId === NEXT5_DROP) {
      targetSection = "next5";
      targetIndex = plan.next5.length;
    } else {
      // Over another item: determine its section + its current index
      const overSection = sectionOf(overId);
      if (!overSection) return;
      targetSection = overSection;
      const list = overSection === "top5" ? plan.top5 : plan.next5;
      targetIndex = list.findIndex((i) => i.id === overId);
      if (targetIndex < 0) targetIndex = list.length;
    }

    // Fire server action (router.refresh will reconcile)
    startTransition(async () => {
      await reorderMyDayItems({ draggedId: activeId, targetSection, targetIndex });
      router.refresh();
    });
  }

  // ============ Subtask tree rendering inside a parent card ============
  const renderSubtaskChildren = (node: TreeNode) => {
    if (node.children.length === 0) return null;
    return (
      <div className="ml-7 mt-1 space-y-1 border-l border-[var(--border)] pl-3">
        {node.children.map((child) => {
          const hasGrand = child.children.length > 0;
          const isExpanded = expandedItems.has(child.item.id);
          return (
            <div key={child.item.id}>
              <div className="group flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-[var(--bg-muted)] transition-colors">
                {hasGrand ? (
                  <button
                    onClick={() => toggleExpand(child.item.id)}
                    className="w-4 text-xs text-[var(--text-muted)]"
                    aria-label={isExpanded ? "Collapse" : "Expand"}
                  >
                    {isExpanded ? "▼" : "▶"}
                  </button>
                ) : (
                  <span className="w-4" />
                )}
                <button
                  onClick={() => handleComplete(child.item.id, child.item.status)}
                  className={`w-4 h-4 rounded-md border-2 flex items-center justify-center text-[10px] transition-colors ${
                    child.item.status === "completed"
                      ? "bg-[var(--success)] border-[var(--success)] text-white"
                      : "border-[var(--border)] hover:border-[var(--accent)]"
                  }`}
                  aria-label={child.item.status === "completed" ? "Reopen subtask" : "Complete subtask"}
                >
                  {child.item.status === "completed" && "✓"}
                </button>
                <span
                  className={`flex-1 text-xs ${
                    child.item.status === "completed" ? "line-through text-[var(--text-muted)]" : "text-[var(--text)]"
                  }`}
                >
                  {child.item.title || child.item.content.slice(0, 60)}
                </span>
              </div>
              {isExpanded && renderSubtaskChildren(child)}
            </div>
          );
        })}
      </div>
    );
  };

  // ============ Single draggable card for Top 5 / Next 5 ============
  function DraggableCard({ item, variant }: { item: InboxItem; variant: SectionKey }) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.4 : 1,
      // Prevents the browser from intercepting touch gestures (page scroll) that
      // would otherwise cancel drags on mobile.
      touchAction: "none" as const,
    };

    const node = nodeById.get(item.id);
    const progress = node ? getSubtaskProgress(node) : { completed: 0, total: 0 };
    const recurrence = (item.metadata as Record<string, unknown>)?.recurrence as
      | { frequency?: string; is_template?: boolean; template_id?: string }
      | undefined;
    const isRecurring = recurrence?.is_template || recurrence?.template_id;
    const isExpanded = expandedItems.has(item.id);
    const hasSubtasks = (node?.children.length ?? 0) > 0;

    const accent =
      variant === "top5"
        ? "border-amber-400/30 bg-amber-400/5"
        : "border-sky-400/20 bg-sky-400/5";

    return (
      <div ref={setNodeRef} style={style} className={`rounded-lg border ${accent} transition-colors`}>
        <div className="group flex items-center gap-2 px-3 py-2">
          {/* Drag handle */}
          <button
            {...attributes}
            {...listeners}
            className="w-4 shrink-0 cursor-grab active:cursor-grabbing text-[var(--text-muted)] hover:text-[var(--text)]"
            aria-label="Drag to reorder"
            title="Drag to reorder"
          >
            ⋮⋮
          </button>

          {hasSubtasks ? (
            <button
              onClick={() => toggleExpand(item.id)}
              className="w-4 text-xs text-[var(--text-muted)]"
              aria-label={isExpanded ? "Collapse" : "Expand"}
            >
              {isExpanded ? "▼" : "▶"}
            </button>
          ) : (
            <span className="w-4" />
          )}

          <button
            onClick={() => handleComplete(item.id, item.status)}
            className={`w-5 h-5 rounded-md border-2 flex items-center justify-center text-xs transition-colors ${
              item.status === "completed"
                ? "bg-[var(--success)] border-[var(--success)] text-white"
                : "border-[var(--border)] hover:border-[var(--accent)]"
            }`}
            aria-label={item.status === "completed" ? "Reopen task" : "Complete task"}
          >
            {item.status === "completed" && "✓"}
          </button>

          <span
            className={`flex-1 text-sm ${
              item.status === "completed" ? "line-through text-[var(--text-muted)]" : "text-[var(--text)]"
            }`}
          >
            {item.title || item.content.slice(0, 60)}
          </span>

          {isRecurring && (
            <span className="text-xs text-[var(--text-muted)]">
              🔄 {recurrence?.frequency === "weekly" ? "Weekly" : "Daily"}
            </span>
          )}
          {progress.total > 0 && (
            <span className="text-xs text-[var(--text-muted)]">
              {progress.completed}/{progress.total}
            </span>
          )}

          <button
            onClick={async () => {
              const title = prompt("Subtask title:");
              if (title) {
                startTransition(async () => {
                  await createSubtask(item.id, title);
                  router.refresh();
                  setExpandedItems((prev) => new Set(prev).add(item.id));
                });
              }
            }}
            className="opacity-0 group-hover:opacity-100 text-xs text-[var(--accent)] hover:underline transition-opacity"
          >
            + sub
          </button>
        </div>
        {isExpanded && node && renderSubtaskChildren(node)}
      </div>
    );
  }

  // ============ A drop-zone section (Top 5 or Next 5) ============
  function Section({
    title,
    subtitle,
    droppableId,
    section,
    items: sectionItems,
    accentClass,
  }: {
    title: string;
    subtitle: string;
    droppableId: string;
    section: SectionKey;
    items: InboxItem[];
    accentClass: string;
  }) {
    const { setNodeRef, isOver } = useDroppable({ id: droppableId });
    const isFull = sectionItems.length >= MY_DAY_CAP;
    return (
      <section
        ref={setNodeRef}
        className={`rounded-xl border ${accentClass} p-3 transition-colors ${
          isOver ? "ring-2 ring-[var(--accent)]/60" : ""
        }`}
      >
        <header className="flex items-baseline justify-between mb-2 px-1">
          <div>
            <h2 className="text-sm font-semibold text-[var(--text)]">{title}</h2>
            <p className="text-[11px] text-[var(--text-muted)]">{subtitle}</p>
          </div>
          <span className={`text-xs font-mono ${isFull ? "text-[var(--accent)]" : "text-[var(--text-muted)]"}`}>
            {sectionItems.length}/{MY_DAY_CAP}
          </span>
        </header>
        {sectionItems.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-[var(--text-muted)]">
            Drop a task here or use quick-add.
          </p>
        ) : (
          <SortableContext items={sectionItems.map((i) => i.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-1.5">
              {sectionItems.map((item) => (
                <DraggableCard key={item.id} item={item} variant={section} />
              ))}
            </div>
          </SortableContext>
        )}
      </section>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <header className="sticky top-0 z-10 border-b border-[var(--border)] bg-[var(--bg)] px-6 py-4">
        <div className="flex items-center justify-between max-w-2xl mx-auto">
          <h1 className="text-xl font-semibold text-[var(--text)]">☀️ My Day</h1>
          <a href="/app" className="text-sm text-[var(--accent)] hover:underline">← Board</a>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-6 space-y-6">
        {briefingText && (
          <section className="rounded-xl border border-[var(--border)] bg-[var(--bg-muted)] p-4">
            <button
              onClick={() => setBriefingOpen(!briefingOpen)}
              className="flex items-center justify-between w-full text-left"
            >
              <h2 className="text-sm font-medium text-[var(--text)]">🧠 AI Briefing</h2>
              <span className="text-xs text-[var(--text-muted)]">{briefingOpen ? "▼" : "▶"}</span>
            </button>
            {briefingOpen && (
              <div className="mt-3 text-sm text-[var(--text-muted)] whitespace-pre-line">
                {briefingText}
                {staleItems.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {staleItems.slice(0, 3).map((item) => (
                      <button
                        key={item.id}
                        onClick={() => handleMoveSuggestion(item.id)}
                        className="block text-xs text-[var(--accent)] hover:underline"
                      >
                        → Move &quot;{item.title}&quot; to Today
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        <section className="rounded-xl border border-[var(--border)] bg-[var(--bg-muted)] p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-[var(--text)]">
              {completedTotal} of {totalTasks + completedTodayCount} done today
            </span>
            <span className="text-sm font-medium text-[var(--accent)]">{progressPct}%</span>
          </div>
          <div className="h-2 rounded-full bg-[var(--border)] overflow-hidden">
            <div
              className="h-full rounded-full bg-[var(--accent)] transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </section>

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <Section
            title="Top 5 — Today"
            subtitle="The five most important things to finish today"
            droppableId={TOP5_DROP}
            section="top5"
            items={plan.top5}
            accentClass="border-amber-400/30 bg-amber-400/5"
          />
          <Section
            title="Next 5 — Up soon"
            subtitle="On deck after Top 5. Drag up to promote."
            droppableId={NEXT5_DROP}
            section="next5"
            items={plan.next5}
            accentClass="border-sky-400/20 bg-sky-400/5"
          />
        </DndContext>

        {plan.overflow.length > 0 && (
          <p className="text-xs text-[var(--text-muted)] text-center">
            +{plan.overflow.length} more in Upcoming / Backlog (see{" "}
            <a href="/app" className="text-[var(--accent)] hover:underline">Board</a>)
          </p>
        )}

        <section className="sticky bottom-0 bg-[var(--bg)] border-t border-[var(--border)] px-0 py-4">
          <div className="flex gap-2">
            <input
              type="text"
              value={quickAddText}
              onChange={(e) => setQuickAddText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleQuickAdd();
                }
              }}
              placeholder="Quick add to Today..."
              className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg-muted)] px-4 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)]"
            />
            <button
              onClick={handleQuickAdd}
              disabled={isPending || !quickAddText.trim()}
              className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {isPending ? "..." : "Add"}
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}

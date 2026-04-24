"use client";

import { useState, useEffect, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { InboxItem } from "@/lib/items/types";
import { buildSubtaskTree, getSubtaskProgress, type TreeNode } from "@/lib/items/subtask-tree";
import { buildFallbackBriefing } from "./briefing";
import {
  captureInboxItem,
  updateItemStatus,
  createSubtask,
  moveItemToLane,
} from "../actions";

interface MyDayProps {
  todayItems: InboxItem[];
  allActiveItems: InboxItem[];
  overdueItems: InboxItem[];
  staleItems: InboxItem[];
  completedTodayCount: number;
}

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

  // Build subtask tree from all active items
  const tree = buildSubtaskTree(allActiveItems);
  const todayRoots = tree.filter((node) => node.item.priority_score >= 0.85);

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
    // Toggle: completed → active; anything else → completed
    const nextStatus = currentStatus === "completed" ? "active" : "completed";
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

  const renderSubtaskNode = (node: TreeNode) => {
    const hasChildren = node.children.length > 0;
    const isExpanded = expandedItems.has(node.item.id);
    const progress = getSubtaskProgress(node);
    const recurrence = (node.item.metadata as Record<string, unknown>)?.recurrence as
      | { frequency?: string; is_template?: boolean; template_id?: string }
      | undefined;
    const isRecurring = recurrence?.is_template || recurrence?.template_id;

    return (
      <div key={node.item.id} style={{ paddingLeft: `${node.depth * 20}px` }}>
        <div className="group flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-[var(--bg-muted)] transition-colors duration-140">
          {hasChildren ? (
            <button
              onClick={() => toggleExpand(node.item.id)}
              className="w-5 h-5 flex items-center justify-center text-[var(--text-muted)] text-xs"
            >
              {isExpanded ? "▼" : "▶"}
            </button>
          ) : (
            <span className="w-5" />
          )}

          <button
            onClick={() => handleComplete(node.item.id, node.item.status)}
            className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors duration-140 ${
              node.item.status === "completed"
                ? "bg-[var(--success)] border-[var(--success)] text-white"
                : "border-[var(--border)] hover:border-[var(--accent)]"
            }`}
            aria-label={node.item.status === "completed" ? "Reopen task" : "Complete task"}
          >
            {node.item.status === "completed" && "✓"}
          </button>

          <span className={`flex-1 text-sm ${node.item.status === "completed" ? "line-through text-[var(--text-muted)]" : ""}`}>
            {node.item.title || node.item.content.slice(0, 60)}
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
                  await createSubtask(node.item.id, title);
                  router.refresh();
                  setExpandedItems((prev) => new Set(prev).add(node.item.id));
                });
              }
            }}
            className="opacity-0 group-hover:opacity-100 text-xs text-[var(--accent)] hover:underline transition-opacity"
          >
            + sub
          </button>
        </div>

        {isExpanded && node.children.map(renderSubtaskNode)}
      </div>
    );
  };

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

        <section>
          <h2 className="text-sm font-medium text-[var(--text-muted)] mb-3">Today&apos;s Tasks</h2>
          {todayRoots.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)] text-center py-8">
              No tasks for today. Use quick-add below or check the Board.
            </p>
          ) : (
            <div className="space-y-1">
              {todayRoots.map(renderSubtaskNode)}
            </div>
          )}
        </section>

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

"use client";

/* PWA install prompt type (not in standard lib.dom) */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  useDroppable,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { InboxComposer } from "./inbox-composer";
import {
  captureInboxItem,
  clearCompletedBacklog,
  createSubtask,
  createSubtaskFromSuggestion,
  dismissItem,
  markItemReviewed,
  moveItemToLane,
  permanentlyDeleteItem,
  purgeExpiredTrash,
  restoreItemFromTrash,
  setRecurrence,
  signOut,
  updateItemDetails,
  updateItemStatus,
  bulkUpdateItems,
  backfillLinkSummary,
} from "./actions";
import { laneFromItem, type LaneKey } from "@/lib/items/lane";
import type { InboxItem, LinkSummary, RecurrenceConfig } from "@/lib/items/types";
import { asMetadata, filterBoardItems, getDragActivationDistance, getDragHandleLabel, isTrash } from "./board-logic";
import { RecurrencePicker } from "./recurrence-picker";
import { SubtaskTreePanel } from "./subtask-tree";

type AppBoardProps = {
  initialItems: InboxItem[];
  username: string;
};

type SearchResult = {
  source: string;
  score: number;
  item: {
    id: string;
    title: string;
    content: string;
    type: string;
    status: string;
    filepath?: string;
  };
};

type ChatEntry = {
  role: "user" | "assistant";
  content: string;
  citations?: Array<{ source: string; label: string; excerpt: string }>;
};

type VaultSyncPayload = {
  ok?: boolean;
  summary?: {
    scannedFiles?: number;
    syncedFiles?: number;
    embeddedChunks?: number;
    skippedFiles?: number;
  };
  diagnostics?: {
    vaultPath?: string;
    pathExists?: boolean;
    isReadable?: boolean;
    totalMarkdownFiles?: number;
  };
};

type FilterKey =
  | "all"
  | "active"
  | "completed"
  | "archived"
  | "todo"
  | "note"
  | "link"
  | "trash";

const LANE_ORDER: LaneKey[] = ["today", "next", "backlog"];

function typeStyles(type: InboxItem["type"]) {
  if (type === "todo") return "bg-blue-300/20 text-blue-200 border-blue-300/30";
  if (type === "link") return "bg-purple-300/20 text-purple-200 border-purple-300/30";
  return "bg-emerald-300/20 text-emerald-200 border-emerald-300/30";
}

function laneLabel(lane: LaneKey) {
  if (lane === "today") return "Today";
  if (lane === "next") return "Next Up";
  return "Backlog";
}

function laneColor(lane: LaneKey) {
  if (lane === "today") return "var(--lane-today)";
  if (lane === "next") return "var(--lane-next)";
  return "var(--lane-backlog)";
}

function getSuggestions(item: InboxItem): string[] {
  const title = item.title || item.content.slice(0, 80);
  return [
    `Break down: ${title}`,
    `Research context for: ${title}`,
    `Set deadline for: ${title}`,
  ];
}


function daysUntilPurge(item: InboxItem) {
  const metadata = asMetadata(item.metadata);
  const deletedAt = typeof metadata.deleted_at === "string" ? metadata.deleted_at : "";
  if (!deletedAt) return null;
  const expires = new Date(deletedAt).getTime() + 30 * 24 * 60 * 60 * 1000;
  const days = Math.ceil((expires - Date.now()) / (24 * 60 * 60 * 1000));
  return Math.max(days, 0);
}

export function AppBoard({ initialItems, username }: AppBoardProps) {
  const [items, setItems] = useState(initialItems);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [fullscreenLane, setFullscreenLane] = useState<LaneKey | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [syncStatus, setSyncStatus] = useState("Idle");
  const [syncDiagnostics, setSyncDiagnostics] = useState<VaultSyncPayload["diagnostics"]>({});
  const [chatInput, setChatInput] = useState("");
  const [chatLog, setChatLog] = useState<ChatEntry[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [sidebarMode, setSidebarMode] = useState<"review" | "chat" | "trash">("review");
  const [relatedResults, setRelatedResults] = useState<SearchResult[]>([]);
  const [activeFilter, setActiveFilter] = useState<FilterKey>("all");
  const [activeTagFilter, setActiveTagFilter] = useState<string | null>(null);
  const [editingTags, setEditingTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [suggestedTags, setSuggestedTags] = useState<string[]>([]);
  const [tagsCache, setTagsCache] = useState<Record<string, string[]>>({});
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkTagInput, setBulkTagInput] = useState("");
  const [showBulkRetag, setShowBulkRetag] = useState(false);
  const [deferredInstallPrompt, setDeferredInstallPrompt] = useState<Event | null>(null);
  const [isPending, startTransition] = useTransition();
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const router = useRouter();

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: getDragActivationDistance() },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  useEffect(() => {
    const cookieTheme = document.cookie
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith("theme="))
      ?.split("=")[1];

    const resolved = cookieTheme === "light" || cookieTheme === "dark" ? cookieTheme : "dark";
    setTheme(resolved);
    document.documentElement.setAttribute("data-theme", resolved);
  }, []);

  useEffect(() => {
    setItems(initialItems);
  }, [initialItems]);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredInstallPrompt(e);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        if (event.key === "Escape") {
          if (selectedItemId) setSelectedItemId(null);
          if (fullscreenLane) setFullscreenLane(null);
        }
        return;
      }

      if (event.key === "1") setFullscreenLane("today");
      if (event.key === "2") setFullscreenLane("next");
      if (event.key === "3") setFullscreenLane("backlog");
      if (event.key.toLowerCase() === "n") composerRef.current?.focus();
      if (event.key === "Escape") {
        if (selectedItemId) setSelectedItemId(null);
        else if (fullscreenLane) setFullscreenLane(null);
      }
      if (event.key === "?") setShowShortcuts((prev) => !prev);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedItemId, fullscreenLane]);

  useEffect(() => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    const timeout = window.setTimeout(async () => {
      setSearching(true);
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        const payload = (await response.json()) as { results?: SearchResult[] };
        setSearchResults(payload.results ?? []);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [query]);

  const trashItems = useMemo(() => items.filter((item) => isTrash(item)), [items]);

  const boardItems = useMemo(() => filterBoardItems(items, activeFilter, activeTagFilter), [items, activeFilter, activeTagFilter]);

  const visibleTags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of boardItems) {
      for (const tag of item.tags ?? []) {
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [boardItems]);

  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedItemId) ?? null,
    [items, selectedItemId],
  );

  const byLane = useMemo(() => {
    const laneMap: Record<LaneKey, InboxItem[]> = {
      today: [],
      next: [],
      backlog: [],
    };

    for (const item of boardItems) {
      laneMap[laneFromItem(item)].push(item);
    }

    return laneMap;
  }, [boardItems]);

  const reviewItems = useMemo(() => boardItems.filter((item) => item.needs_review), [boardItems]);

  const counts = useMemo(
    () => ({
      active: items.filter((item) => item.status === "active").length,
      completed: items.filter((item) => item.status === "completed").length,
      archived: items.filter((item) => item.status === "archived" && !isTrash(item)).length,
      todo: items.filter((item) => item.type === "todo" && !isTrash(item)).length,
      note: items.filter((item) => item.type === "note" && !isTrash(item)).length,
      link: items.filter((item) => item.type === "link" && !isTrash(item)).length,
      trash: trashItems.length,
    }),
    [items, trashItems.length],
  );

  async function handleVaultSync() {
    setSyncStatus("Syncing vault...");
    try {
      const response = await fetch("/api/vault/sync", { method: "POST" });
      const payload = (await response.json()) as VaultSyncPayload;

      if (!payload.ok) {
        setSyncStatus("Vault sync failed");
        return;
      }

      setSyncDiagnostics(payload.diagnostics ?? {});
      setSyncStatus(
        `Synced ${payload.summary?.syncedFiles ?? 0}/${payload.summary?.scannedFiles ?? 0} files · ${payload.summary?.embeddedChunks ?? 0} chunks`,
      );
    } catch {
      setSyncStatus("Vault sync failed");
    }
  }

  async function handleAskChat() {
    const message = chatInput.trim();
    if (!message) return;

    setChatInput("");
    setChatLoading(true);
    setSidebarMode("chat");
    setChatLog((prev) => [...prev, { role: "user", content: message }]);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: message }),
      });

      const payload = (await response.json()) as {
        answer?: string;
        citations?: Array<{ source: string; label: string; excerpt: string }>;
      };

      setChatLog((prev) => [
        ...prev,
        {
          role: "assistant",
          content: payload.answer || "No answer generated.",
          citations: payload.citations ?? [],
        },
      ]);
    } catch {
      setChatLog((prev) => [...prev, { role: "assistant", content: "AI chat request failed." }]);
    } finally {
      setChatLoading(false);
    }
  }

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    document.cookie = `theme=${next}; path=/; max-age=31536000`;
  }

  function handleDragEnd(event: DragEndEvent) {
    const activeId = String(event.active.id ?? "");
    const overId = String(event.over?.id ?? "");
    if (!activeId || !overId) return;

    const draggedItem = boardItems.find((item) => item.id === activeId);
    if (!draggedItem) return;

    const fromLane = laneFromItem(draggedItem);

    let toLane: LaneKey | null = null;
    if (overId === "today" || overId === "next" || overId === "backlog") {
      toLane = overId;
    } else {
      const overItem = boardItems.find((item) => item.id === overId);
      if (overItem) toLane = laneFromItem(overItem);
    }

    if (!toLane) return;

    if (toLane !== fromLane) {
      setItems((prev) =>
        prev.map((item) =>
          item.id === activeId
            ? {
                ...item,
                status: "active" as const,
                priority_score: toLane === "today" ? 0.85 : toLane === "next" ? 0.7 : 0.4,
              }
            : item,
        ),
      );

      startTransition(async () => {
        await moveItemToLane({ itemId: activeId, fromLane, toLane });
      });
    }
  }

  function normalizeTag(tag: string) {
    return tag.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
  }

  function toggleSelected(itemId: string) {
    setSelectedIds((prev) => (prev.includes(itemId) ? prev.filter((id) => id !== itemId) : [...prev, itemId]));
  }

  function selectAllVisible() {
    setSelectedIds(boardItems.map((item) => item.id));
  }

  function clearSelection() {
    setSelectedIds([]);
    setShowBulkRetag(false);
    setBulkTagInput("");
  }

  function addEditingTag(raw: string) {
    const normalized = normalizeTag(raw);
    if (!normalized) return;
    setEditingTags((prev) => (prev.includes(normalized) ? prev : [...prev, normalized]));
    setTagInput("");
  }

  async function fetchSuggestedTags(item: InboxItem) {
    const cacheKey = `${item.id}:${item.title ?? ""}:${item.content}`;
    if (tagsCache[cacheKey]) {
      setSuggestedTags(tagsCache[cacheKey].filter((tag) => !editingTags.includes(tag)));
      return;
    }

    try {
      const response = await fetch("/api/suggest-tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: item.content, title: item.title, type: item.type }),
      });
      const payload = (await response.json()) as { tags?: string[] };
      const next = (payload.tags ?? []).filter(Boolean);
      setTagsCache((prev) => ({ ...prev, [cacheKey]: next }));
      setSuggestedTags(next.filter((tag) => !editingTags.includes(tag)));
    } catch {
      setSuggestedTags([]);
    }
  }

  async function applyBulkUpdate(updates: Parameters<typeof bulkUpdateItems>[1]) {
    if (selectedIds.length === 0) return;
    startTransition(async () => {
      await bulkUpdateItems(selectedIds, updates);
      clearSelection();
      router.refresh();
    });
  }

  async function handleBulkReclassify() {
    const selectedItems = items.filter((item) => selectedIds.includes(item.id));
    startTransition(async () => {
      for (const item of selectedItems) {
        const response = await fetch("/api/classify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: item.content }),
        });
        const payload = (await response.json()) as { classification?: { type?: InboxItem["type"]; priorityScore?: number } };
        await bulkUpdateItems([item.id], {
          type: payload.classification?.type,
          priority_score: payload.classification?.priorityScore,
          markReviewed: true,
        });
      }
      clearSelection();
      router.refresh();
    });
  }

  async function handleBulkSuggestTags() {
    const selectedItems = items.filter((item) => selectedIds.includes(item.id));
    const merged = new Set<string>();
    for (const item of selectedItems) {
      try {
        const response = await fetch("/api/suggest-tags", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: item.content, title: item.title, type: item.type }),
        });
        const payload = (await response.json()) as { tags?: string[] };
        for (const tag of payload.tags ?? []) merged.add(tag);
      } catch {
      }
    }
    const suggestions = Array.from(merged).filter(Boolean);
    if (suggestions.length === 0) return;
    if (!window.confirm(`Apply suggested tags to ${selectedIds.length} item(s)?\n\n${suggestions.join(", ")}`)) return;
    await applyBulkUpdate({ tags: suggestions });
  }

  async function loadRelated(item: InboxItem) {
    try {
      const response = await fetch(`/api/search?q=${encodeURIComponent(item.content.slice(0, 240))}`);
      const payload = (await response.json()) as { results?: SearchResult[] };
      setRelatedResults((payload.results ?? []).filter((result) => result.item.id !== item.id).slice(0, 5));
    } catch {
      setRelatedResults([]);
    }
  }

  useEffect(() => {
    if (!selectedItem) {
      setRelatedResults([]);
      return;
    }
    void loadRelated(selectedItem);
  }, [selectedItemId]);

  return (
    <main className="min-h-screen bg-[var(--bg)] text-[var(--text)] p-4 md:p-6">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <div className="mx-auto grid max-w-7xl gap-4 md:grid-cols-[220px_1fr_320px]">
          <aside className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
            <p className="text-xs font-mono uppercase tracking-[0.2em] text-[var(--text-muted)]">Workspace</p>
            <h2 className="mt-2 text-lg font-semibold">Linear Console v2</h2>

            <div className="mt-4 space-y-2 text-sm">
              {/* My Day link */}
              <a
                href="/app/my-day"
                className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-muted)] px-3 py-2 text-sm font-medium text-[var(--text)] hover:border-[var(--accent)] transition-colors"
                style={{ borderLeftWidth: "3px", borderLeftColor: "var(--accent)" }}
              >
                <span>☀️</span>
                <span>My Day</span>
              </a>

              {LANE_ORDER.map((lane) => (
                <button
                  key={lane}
                  type="button"
                  onClick={() => setFullscreenLane((prev) => (prev === lane ? null : lane))}
                  className={`w-full rounded-lg border px-3 py-2 text-left transition active:scale-95 active:brightness-90 active:bg-slate-200 dark:active:bg-slate-700 duration-75 ${
                    fullscreenLane === lane
                      ? "border-[var(--accent)] bg-[color-mix(in_oklab,var(--accent)_14%,transparent)]"
                      : "border-[var(--border)] bg-[var(--bg-muted)] hover:border-[var(--accent)]"
                  }`}
                  style={{ borderLeftWidth: "3px", borderLeftColor: laneColor(lane) }}
                >
                  <span className="flex items-center gap-2">
                    <span className="inline-block h-[6px] w-[6px] rounded-full" style={{ backgroundColor: laneColor(lane) }} />
                    <span style={{ color: laneColor(lane) }}>{laneLabel(lane)}</span>
                  </span>
                  <span className="float-right font-mono">{byLane[lane].length}</span>
                </button>
              ))}
              <div className="flex items-center justify-between rounded-lg bg-[var(--bg-muted)] px-3 py-2">
                <span className="text-[var(--text-muted)]">Review</span>
                <span className="font-mono">{reviewItems.length}</span>
              </div>
            </div>
          </aside>

          <section className="space-y-4">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5">
              <div className="flex flex-wrap items-center gap-3">
                <div>
                  <p className="text-xs font-mono uppercase tracking-[0.2em] text-[var(--text-muted)]">Smart Inbox</p>
                  <h1 className="mt-2 text-2xl font-semibold">Capture anything</h1>
                </div>
                <div className="ml-auto flex items-center gap-2">
                  <a
                    href="/app/my-day"
                    className="rounded-md border border-[var(--accent)] bg-[color-mix(in_oklab,var(--accent)_14%,transparent)] px-3 py-1 text-xs font-medium text-[var(--accent)] hover:bg-[color-mix(in_oklab,var(--accent)_24%,transparent)] active:scale-95 transition-all duration-75"
                  >
                    ☀️ My Day
                  </a>
                  <button
                    type="button"
                    onClick={handleVaultSync}
                    className="rounded-md border border-[var(--border)] px-3 py-1 text-xs hover:border-[var(--accent)] active:scale-95 active:brightness-90 active:bg-slate-200 dark:active:bg-slate-700 transition-transform duration-75"
                  >
                    Sync vault
                  </button>
                  <span className="text-xs text-[var(--text-muted)]">{syncStatus}</span>
                </div>
              </div>

              {!!syncDiagnostics && (
                <div className="mt-2 rounded-md border border-[var(--border)] bg-[var(--bg-muted)] p-2 text-[11px] text-[var(--text-muted)]">
                  Path: {syncDiagnostics.vaultPath || "n/a"} · exists: {String(syncDiagnostics.pathExists)} · readable: {String(syncDiagnostics.isReadable)} · md files: {syncDiagnostics.totalMarkdownFiles ?? 0}
                </div>
              )}

              <p className="mt-2 text-sm text-[var(--text-muted)]">Classifier routes entries via Claude Opus through OARS.</p>

              <InboxComposer
                action={captureInboxItem}
                textareaRef={composerRef}
                buttonClassName="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-black transition hover:bg-[var(--accent-strong)] disabled:opacity-70"
              />
            </div>

            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-xs font-mono uppercase tracking-[0.2em] text-[var(--text-muted)]">Semantic search</p>
                {searching && <span className="text-xs text-[var(--text-muted)]">Searching…</span>}
              </div>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder='Try: "do i have any soccer notes?"'
                className="mt-2 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-muted)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
              />

              {query.trim() && (
                <ul className="mt-3 space-y-2">
                  {searchResults.length === 0 ? (
                    <li className="rounded-md border border-dashed border-[var(--border)] p-3 text-xs text-[var(--text-muted)]">
                      No semantic matches yet.
                    </li>
                  ) : (
                    searchResults.slice(0, 8).map((result) => (
                      <li key={`${result.source}-${result.item.id}`}>
                        <button
                          type="button"
                          onClick={() => {
                            const local = items.find((item) => item.id === result.item.id);
                            if (local) setSelectedItemId(local.id);
                          }}
                          className="w-full rounded-md border border-[var(--border)] bg-[var(--bg-muted)] p-3 text-left hover:border-[var(--accent)] active:scale-95 active:brightness-90 active:bg-slate-200 dark:active:bg-slate-700 transition-transform duration-75"
                        >
                          <p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">{result.source}</p>
                          <p className="mt-1 text-sm font-medium">{result.item.title || "Untitled"}</p>
                          <p className="mt-1 line-clamp-2 text-xs text-[var(--text-muted)]">{result.item.content}</p>
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              )}
            </div>

            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
              <p className="text-xs font-mono uppercase tracking-[0.2em] text-[var(--text-muted)]">Quick filters (click to apply)</p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                {([
                  ["all", `All: ${boardItems.length}`],
                  ["active", `Active: ${counts.active}`],
                  ["completed", `Completed: ${counts.completed}`],
                  ["archived", `Archived: ${counts.archived}`],
                  ["link", `Links: ${counts.link}`],
                  ["todo", `Todos: ${counts.todo}`],
                  ["note", `Notes: ${counts.note}`],
                  ["trash", `Trash: ${counts.trash}`],
                ] as Array<[FilterKey, string]>).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setActiveFilter((prev) => (prev === key ? "all" : key))}
                    className={`rounded-md border px-2 py-1 active:scale-95 active:brightness-90 active:bg-slate-200 dark:active:bg-slate-700 transition-transform duration-75 ${
                      activeFilter === key
                        ? "border-[var(--accent)] bg-[color-mix(in_oklab,var(--accent)_14%,transparent)]"
                        : "border-[var(--border)] bg-[var(--bg-muted)] hover:border-[var(--accent)]"
                    }`}
                  >
                    {label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={selectAllVisible}
                  className="rounded-md border border-[var(--border)] bg-[var(--bg-muted)] px-2 py-1 active:scale-95 active:brightness-90 active:bg-slate-200 dark:active:bg-slate-700 transition-transform duration-75 hover:border-[var(--accent)]"
                >
                  Select all visible
                </button>
              </div>

              <div className="mt-4">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-[var(--text-muted)]">Tags</span>
                  {visibleTags.length === 0 ? (
                    <span className="text-[var(--text-muted)]">No tags yet</span>
                  ) : (
                    visibleTags.map(([tag, count]) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => setActiveTagFilter((prev) => (prev === tag ? null : tag))}
                        className={`rounded-full border px-2 py-1 active:scale-95 active:brightness-90 active:bg-slate-200 dark:active:bg-slate-700 transition-transform duration-75 ${
                          activeTagFilter === tag
                            ? "border-[var(--accent)] bg-[color-mix(in_oklab,var(--accent)_14%,transparent)]"
                            : "border-[var(--border)] bg-[var(--bg-muted)] hover:border-[var(--accent)]"
                        }`}
                      >
                        #{tag} · {count}
                      </button>
                    ))
                  )}
                  {activeTagFilter && (
                    <button
                      type="button"
                      onClick={() => setActiveTagFilter(null)}
                      className="rounded-full border border-[var(--border)] bg-[var(--bg-muted)] px-2 py-1 active:scale-95 active:brightness-90 active:bg-slate-200 dark:active:bg-slate-700 transition-transform duration-75 hover:border-[var(--accent)]"
                    >
                      Clear tag
                    </button>
                  )}
                </div>
              </div>
            </div>

            {statusMessage && (
              <div className="mb-3 rounded-md border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 text-sm text-emerald-100">
                {statusMessage}
              </div>
            )}

            {activeFilter !== "trash" && (
              <div className="mb-2 flex items-center gap-2">
                <form action={clearCompletedBacklog}>
                  <button
                    type="submit"
                    className="rounded-md border border-[var(--border)] px-3 py-2 text-xs hover:border-[var(--accent)] active:scale-95 active:brightness-90 active:bg-slate-200 dark:active:bg-slate-700 transition-transform duration-75"
                  >
                    Clear completed to trash
                  </button>
                </form>
                <form action={purgeExpiredTrash}>
                  <button
                    type="submit"
                    className="rounded-md border border-[var(--border)] px-3 py-2 text-xs hover:border-rose-300/50 active:scale-95 active:brightness-90 active:bg-red-700 dark:active:bg-red-800 transition-transform duration-75"
                  >
                    Purge trash older than 30 days
                  </button>
                </form>
              </div>
            )}

            {activeFilter === "trash" ? (
              <TrashSection items={trashItems} pending={isPending} />
            ) : (
              <div className="space-y-4">
                {LANE_ORDER.filter((lane) => !fullscreenLane || lane === fullscreenLane).map((lane) => (
                  <LaneColumn
                    key={lane}
                    lane={lane}
                    items={byLane[lane]}
                    onOpenItem={setSelectedItemId}
                    onToggleStatus={(itemId, currentStatus) => {
                      const nextStatus = currentStatus === "completed" ? "active" : "completed";

                      setStatusMessage(nextStatus === "completed" ? "Item marked completed." : "Item reopened.");
                      setItems((prev) =>
                        prev.map((entry) =>
                          entry.id === itemId
                            ? {
                                ...entry,
                                status: nextStatus,
                              }
                            : entry,
                        ),
                      );

                      startTransition(async () => {
                        const formData = new FormData();
                        formData.set("itemId", itemId);
                        formData.set("status", nextStatus);

                        await updateItemStatus(formData);
                        router.refresh();
                      });
                    }}
                    pending={isPending}
                    selectedIds={selectedIds}
                    onToggleSelected={toggleSelected}
                    onTagSelect={setActiveTagFilter}
                  />
                ))}
              </div>
            )}
          </section>

          <aside className="space-y-4">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
              <p className="text-xs font-mono uppercase tracking-[0.2em] text-[var(--text-muted)]">Session</p>
              <p className="mt-2 break-all text-sm">{username}</p>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={toggleTheme}
                  className="rounded-lg border border-[var(--border)] bg-[var(--bg-muted)] px-3 py-2 text-sm transition hover:border-[var(--accent)] active:scale-95 active:brightness-90 active:bg-slate-200 dark:active:bg-slate-700 duration-75"
                >
                  {theme === "dark" ? "☀ Light" : "🌙 Dark"}
                </button>
                <form action={signOut}>
                  <button
                    type="submit"
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-muted)] px-3 py-2 text-sm transition hover:border-[var(--accent)] active:scale-95 active:brightness-90 active:bg-slate-200 dark:active:bg-slate-700 duration-75"
                  >
                    Sign out
                  </button>
                </form>
              </div>

              <PushToggle />

              <a
                href="/widget"
                target="_blank"
                rel="noreferrer"
                className="mt-3 block rounded-md border border-[var(--border)] bg-[var(--bg-muted)] px-3 py-2 text-xs text-[var(--text-muted)] hover:border-[var(--accent)]"
              >
                Open /widget (pin with PowerToys Win+Ctrl+T)
              </a>

              {deferredInstallPrompt && (
                <button
                  type="button"
                  onClick={() => {
                    (deferredInstallPrompt as BeforeInstallPromptEvent).prompt();
                    setDeferredInstallPrompt(null);
                  }}
                  className="mt-3 w-full rounded-lg border border-[var(--accent)] bg-[color-mix(in_oklab,var(--accent)_14%,transparent)] px-3 py-2 text-sm font-medium text-[var(--accent)] transition hover:bg-[color-mix(in_oklab,var(--accent)_22%,transparent)] active:scale-95 active:brightness-90 duration-75"
                >
                  Install App
                </button>
              )}
            </div>

            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
              <div className="mb-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => setSidebarMode("review")}
                  className={`rounded-md border px-2 py-1 text-xs active:scale-95 active:brightness-90 active:bg-slate-200 dark:active:bg-slate-700 transition-transform duration-75 ${sidebarMode === "review" ? "border-[var(--accent)]" : "border-[var(--border)]"}`}
                >
                  Review ({reviewItems.length})
                </button>
                <button
                  type="button"
                  onClick={() => setSidebarMode("chat")}
                  className={`rounded-md border px-2 py-1 text-xs active:scale-95 active:brightness-90 active:bg-slate-200 dark:active:bg-slate-700 transition-transform duration-75 ${sidebarMode === "chat" ? "border-[var(--accent)]" : "border-[var(--border)]"}`}
                >
                  AI chat
                </button>
                <button
                  type="button"
                  onClick={() => setSidebarMode("trash")}
                  className={`rounded-md border px-2 py-1 text-xs active:scale-95 active:brightness-90 active:bg-slate-200 dark:active:bg-slate-700 transition-transform duration-75 ${sidebarMode === "trash" ? "border-[var(--accent)]" : "border-[var(--border)]"}`}
                >
                  Trash ({trashItems.length})
                </button>
              </div>

              {sidebarMode === "review" ? (
                reviewItems.length === 0 ? (
                  <p className="text-sm text-[var(--text-muted)]">No low-confidence items pending review.</p>
                ) : (
                  <ul className="space-y-2">
                    {reviewItems.slice(0, 8).map((item) => (
                      <li key={item.id} className="rounded-md border border-amber-300/20 bg-amber-300/10 p-2">
                        <button type="button" className="w-full text-left active:scale-95 active:brightness-90 transition-transform duration-75" onClick={() => setSelectedItemId(item.id)}>
                          <p className="text-xs font-medium">{item.title || "Untitled"}</p>
                          <p className="mt-1 line-clamp-2 text-xs text-[var(--text-muted)]">{item.content}</p>
                        </button>
                        <form action={markItemReviewed} className="mt-2">
                          <input type="hidden" name="itemId" value={item.id} />
                          <button type="submit" className="rounded-md border border-[var(--border)] px-2 py-1 text-xs active:scale-95 active:brightness-90 active:bg-green-700 dark:active:bg-green-800 transition-transform duration-75">
                            Mark reviewed
                          </button>
                        </form>
                      </li>
                    ))}
                  </ul>
                )
              ) : sidebarMode === "trash" ? (
                <TrashSection items={trashItems} pending={isPending} compact />
              ) : (
                <div className="space-y-3">
                  <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                    {chatLog.map((entry, index) => (
                      <div
                        key={`${entry.role}-${index}`}
                        className={`rounded-md border p-2 text-sm ${
                          entry.role === "user"
                            ? "border-blue-300/30 bg-blue-300/10"
                            : "border-[var(--border)] bg-[var(--bg-muted)]"
                        }`}
                      >
                        <p className="whitespace-pre-wrap">{entry.content}</p>
                        {entry.role === "assistant" && entry.citations && entry.citations.length > 0 && (
                          <ul className="mt-2 space-y-1">
                            {entry.citations.map((citation, citationIndex) => (
                              <li key={`${citation.label}-${citationIndex}`} className="rounded border border-[var(--border)] p-2 text-xs">
                                <p className="font-mono uppercase text-[var(--text-muted)]">{citation.source}</p>
                                <p className="mt-1 font-medium">{citation.label}</p>
                                <p className="mt-1 line-clamp-2 text-[var(--text-muted)]">{citation.excerpt}</p>
                              </li>
                            ))}
                          </ul>
                        )}
                        {entry.role === "assistant" && (
                          <button
                            type="button"
                            onClick={() => {
                              startTransition(async () => {
                                const formData = new FormData();
                                formData.set("content", entry.content);
                                await captureInboxItem(formData);
                              });
                            }}
                            className="mt-2 rounded-md border border-[var(--border)] px-2 py-1 text-xs hover:border-[var(--accent)] active:scale-95 active:brightness-90 active:bg-slate-200 dark:active:bg-slate-700 transition-transform duration-75"
                          >
                            Convert to note
                          </button>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="space-y-2">
                    <textarea
                      value={chatInput}
                      onChange={(event) => setChatInput(event.target.value)}
                      placeholder="Ask across vault + inbox..."
                      className="h-24 w-full rounded-md border border-[var(--border)] bg-[var(--bg-muted)] px-3 py-2 text-sm"
                    />
                    <button
                      type="button"
                      onClick={handleAskChat}
                      disabled={chatLoading}
                      className="w-full rounded-md bg-[var(--accent)] px-3 py-2 text-sm font-medium text-black disabled:opacity-60 active:scale-95 active:brightness-90 active:bg-slate-200 dark:active:bg-slate-700 transition-transform duration-75"
                    >
                      {chatLoading ? "Thinking…" : "Ask AI"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </aside>
        </div>
      </DndContext>

      {selectedItem && (
        <DetailPanel
          item={selectedItem}
          lane={laneFromItem(selectedItem)}
          related={relatedResults}
          allItems={items}
          editingTags={editingTags}
          tagInput={tagInput}
          suggestedTags={suggestedTags}
          setTagInput={setTagInput}
          setEditingTags={setEditingTags}
          addEditingTag={addEditingTag}
          onClose={() => setSelectedItemId(null)}
        />
      )}

      {selectedIds.length > 0 && (
        <BulkActionBar
          count={selectedIds.length}
          bulkTagInput={bulkTagInput}
          setBulkTagInput={setBulkTagInput}
          showBulkRetag={showBulkRetag}
          setShowBulkRetag={setShowBulkRetag}
          onArchive={() => void applyBulkUpdate({ status: "completed" })}
          onTrash={() => void applyBulkUpdate({ status: "archived", metadata_patch: { dismissed: true, deleted_at: new Date().toISOString() } })}
          onMoveLane={(lane) => void applyBulkUpdate({ status: "active", priority_score: lane === "today" ? 0.85 : lane === "next" ? 0.7 : 0.4 })}
          onRetag={() => {
            const tags = bulkTagInput.split(",").map((tag) => normalizeTag(tag)).filter(Boolean);
            setShowBulkRetag(false);
            setBulkTagInput("");
            void applyBulkUpdate({ tags });
          }}
          onReclassify={() => void handleBulkReclassify()}
          onSuggestTags={() => void handleBulkSuggestTags()}
          onClose={clearSelection}
        />
      )}

      {showShortcuts && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowShortcuts(false)}>
          <div
            className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="text-sm font-semibold">Keyboard shortcuts</p>
            <ul className="mt-3 space-y-2 text-sm text-[var(--text-muted)]">
              <li>1 / 2 / 3 → Focus Today / Next Up / Backlog</li>
              <li>n → Focus composer</li>
              <li>Esc → Close detail panel or exit lane focus</li>
              <li>? → Toggle this shortcuts help</li>
            </ul>
          </div>
        </div>
      )}
    </main>
  );
}

function LaneColumn({
  lane,
  items,
  onOpenItem,
  onToggleStatus,
  pending,
  selectedIds,
  onToggleSelected,
  onTagSelect,
}: {
  lane: LaneKey;
  items: InboxItem[];
  onOpenItem: (itemId: string) => void;
  onToggleStatus: (itemId: string, currentStatus: InboxItem["status"]) => void;
  pending: boolean;
  selectedIds: string[];
  onToggleSelected: (itemId: string) => void;
  onTagSelect: (tag: string | null) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: lane });

  return (
    <div
      ref={setNodeRef}
      className={`rounded-xl border bg-[var(--bg-elevated)] p-5 transition ${isOver ? "border-[var(--accent)]" : "border-[var(--border)]"}`}
    >
      <div className="mb-3 flex items-center justify-between">
        <p className="flex items-center gap-2 text-xs font-mono uppercase tracking-[0.2em]" style={{ color: laneColor(lane) }}>
          <span className="inline-block h-[6px] w-[6px] rounded-full" style={{ backgroundColor: laneColor(lane) }} />
          {laneLabel(lane)}
        </p>
        <span className="text-xs font-mono" style={{ color: laneColor(lane), opacity: 0.6 }}>{items.length}</span>
      </div>

      {items.length === 0 ? (
        <EmptyLane lane={lane} />
      ) : (
        <SortableContext items={items.map((item) => item.id)} strategy={verticalListSortingStrategy}>
          <ul className="space-y-3">
            {items.map((item, index) => (
              <SortableCard key={item.id} item={item} onOpen={() => onOpenItem(item.id)} onToggleStatus={onToggleStatus} pending={pending} index={index} selected={selectedIds.includes(item.id)} onToggleSelected={() => onToggleSelected(item.id)} onTagSelect={onTagSelect} />
            ))}
          </ul>
        </SortableContext>
      )}
    </div>
  );
}

function SortableCard({
  item,
  onOpen,
  onToggleStatus,
  pending,
  index,
  selected,
  onToggleSelected,
  onTagSelect,
}: {
  item: InboxItem;
  onOpen: () => void;
  onToggleStatus: (itemId: string, currentStatus: InboxItem["status"]) => void;
  pending: boolean;
  index: number;
  selected: boolean;
  onToggleSelected: () => void;
  onTagSelect: (tag: string | null) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const dragHandleProps = {
    ...attributes,
    ...listeners,
  };

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    animationDelay: `${index * 36}ms`,
    touchAction: "none",
  };

  const lane = laneFromItem(item);

  /* Stop pointer events on interactive children from reaching the drag listener */
  const stopDrag = (e: React.PointerEvent) => e.stopPropagation();

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`group card-enter rounded-lg border p-3 select-none ${selected ? "border-[var(--accent)] bg-[color-mix(in_oklab,var(--accent)_10%,var(--bg-muted))]" : "border-[var(--border)] bg-[var(--bg-muted)]"}`}
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-label={getDragHandleLabel(item)}
          data-drag-handle
          className="rounded-md border border-[var(--border)] px-2 py-1 text-xs text-[var(--text-muted)] cursor-grab active:cursor-grabbing hover:border-[var(--accent)]"
          {...dragHandleProps}
        >
          Drag
        </button>
        <label className="flex items-center gap-2 rounded-md border border-[var(--border)] px-2 py-1 text-xs text-[var(--text-muted)] opacity-70 transition group-hover:opacity-100">
          <input type="checkbox" checked={selected} onChange={onToggleSelected} onPointerDown={stopDrag} />
          Select
        </label>
        <span className={`rounded-md border px-2 py-0.5 text-xs font-mono uppercase ${typeStyles(item.type)}`}>
          {item.type}
        </span>
        <span className="rounded-md border px-2 py-0.5 text-xs font-mono uppercase" style={{ color: laneColor(lane), borderColor: `color-mix(in oklab, ${laneColor(lane)} 30%, transparent)` }}>{lane}</span>
        {item.needs_review && (
          <span className="rounded-md border border-amber-300/30 bg-amber-300/15 px-2 py-0.5 text-xs font-mono uppercase text-amber-200">
            review
          </span>
        )}
        {(item.tags ?? []).slice(0, 3).map((tag) => (
          <button
            key={tag}
            type="button"
            onClick={() => onTagSelect(tag)}
            onPointerDown={stopDrag}
            className="rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-0.5 text-[11px] text-[var(--text-muted)] active:scale-95 active:brightness-90 active:bg-slate-200 dark:active:bg-slate-700 transition-transform duration-75 hover:border-[var(--accent)]"
          >
            #{tag}
          </button>
        ))}
        {(item.tags ?? []).length > 3 && (
          <span className="rounded-full border border-[var(--border)] px-2 py-0.5 text-[11px] text-[var(--text-muted)]">+{(item.tags ?? []).length - 3} more</span>
        )}
        <button type="button" onClick={onOpen} onPointerDown={stopDrag} className="ml-auto text-xs text-[var(--text-muted)] hover:text-[var(--text)] active:scale-95 active:brightness-90 active:bg-slate-200 dark:active:bg-slate-700 transition-transform duration-75">
          Open
        </button>
      </div>

      <div onClick={onOpen} className="w-full text-left cursor-pointer">
        {item.type === "link" && (item.metadata as Record<string, unknown>)?.link_summary ? (
          <LinkCardBody item={item} summary={(item.metadata as Record<string, unknown>).link_summary as LinkSummary} stopDrag={stopDrag} />
        ) : (
          <>
            <p className="text-sm font-medium">{item.title || "Untitled"}</p>
            <p className="mt-1 line-clamp-2 text-sm text-[var(--text-muted)]">{item.content}</p>
          </>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onToggleStatus(item.id, item.status)}
          onPointerDown={stopDrag}
          className="rounded-md border border-[var(--border)] px-2 py-1 text-xs transition hover:border-emerald-300/40 hover:text-emerald-200 disabled:opacity-70 active:scale-95 active:brightness-90 active:bg-green-700 dark:active:bg-green-800 transition-transform duration-75"
          disabled={pending}
        >
          {item.status === "completed" ? "Reopen" : "Complete"}
        </button>

        <form action={dismissItem} onPointerDown={stopDrag}>
          <input type="hidden" name="itemId" value={item.id} />
          <button
            type="submit"
            className="rounded-md border border-[var(--border)] px-2 py-1 text-xs transition hover:border-rose-300/40 hover:text-rose-200 disabled:opacity-70 active:scale-95 active:brightness-90 active:bg-red-700 dark:active:bg-red-800 transition-transform duration-75"
            disabled={pending}
          >
            Move to trash
          </button>
        </form>
      </div>
    </li>
  );
}

/** Rich rendering for link items with summaries */
function LinkCardBody({
  item,
  summary,
  stopDrag,
}: {
  item: InboxItem;
  summary: LinkSummary;
  stopDrag: (e: React.PointerEvent) => void;
}) {
  const displayTitle = item.title || summary.page_title || "Untitled link";
  const displayUrl = summary.url || item.content;
  let hostname: string | null = null;
  try {
    hostname = new URL(displayUrl).hostname.replace(/^www\./, "");
  } catch { /* ignore */ }

  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium leading-snug">{displayTitle}</p>
      {summary.ai_summary && (
        <p className="line-clamp-4 text-[13px] leading-relaxed text-[var(--text-muted)]">
          {summary.ai_summary}
        </p>
      )}
      <a
        href={displayUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={stopDrag}
        className="inline-flex items-center gap-1.5 rounded-md border border-purple-400/20 bg-purple-400/10 px-2 py-0.5 text-xs text-purple-300 transition hover:border-purple-400/40 hover:text-purple-200"
      >
        <svg className="h-3 w-3 shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6.5 3.5h-3a1 1 0 00-1 1v8a1 1 0 001 1h8a1 1 0 001-1v-3" />
          <path d="M9.5 2.5h4v4" />
          <path d="M13.5 2.5l-6 6" />
        </svg>
        {hostname || summary.site_name || "Open link"}
      </a>
    </div>
  );
}

function TrashSection({
  items,
  pending,
  compact = false,
}: {
  items: InboxItem[];
  pending: boolean;
  compact?: boolean;
}) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
      <p className="text-xs font-mono uppercase tracking-[0.2em] text-[var(--text-muted)]">Trash (auto-purge in 30 days)</p>

      {items.length === 0 ? (
        <p className="mt-2 text-sm text-[var(--text-muted)]">Trash is empty.</p>
      ) : (
        <ul className={`mt-2 space-y-2 ${compact ? "max-h-64 overflow-y-auto pr-1" : ""}`}>
          {items.map((item) => (
            <li key={item.id} className="rounded-md border border-[var(--border)] bg-[var(--bg-muted)] p-3">
              <p className="text-sm font-medium">{item.title || "Untitled"}</p>
              <p className="mt-1 line-clamp-2 text-xs text-[var(--text-muted)]">{item.content}</p>
              <p className="mt-1 text-[11px] text-[var(--text-muted)]">{daysUntilPurge(item)} day(s) until auto-delete</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <form action={restoreItemFromTrash}>
                  <input type="hidden" name="itemId" value={item.id} />
                  <button
                    type="submit"
                    disabled={pending}
                    className="rounded-md border border-[var(--border)] px-2 py-1 text-xs hover:border-[var(--accent)] active:scale-95 active:brightness-90 active:bg-slate-200 dark:active:bg-slate-700 transition-transform duration-75"
                  >
                    Restore
                  </button>
                </form>
                <form action={permanentlyDeleteItem}>
                  <input type="hidden" name="itemId" value={item.id} />
                  <button
                    type="submit"
                    disabled={pending}
                    className="rounded-md border border-rose-300/50 px-2 py-1 text-xs text-rose-200 hover:bg-rose-300/10 active:scale-95 active:brightness-90 active:bg-red-700 dark:active:bg-red-800 transition-transform duration-75"
                  >
                    Delete forever
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PushToggle() {
  const [enabled, setEnabled] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("push-enabled") === "true";
  });
  const [isPending, setIsPending] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  // Convert URL-safe base64 VAPID key to Uint8Array for pushManager.subscribe
  const urlBase64ToUint8Array = (base64String: string): Uint8Array => {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    const rawData = atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  };

  const toggle = async () => {
    setIsPending(true);
    setStatusMsg(null);
    try {
      if (!enabled) {
        // Check if push is supported
        if (!("Notification" in window)) {
          setStatusMsg("Notifications not supported");
          setIsPending(false);
          return;
        }
        if (!("serviceWorker" in navigator)) {
          setStatusMsg("Service workers not supported");
          setIsPending(false);
          return;
        }
        if (window.location.protocol !== "https:" && window.location.hostname !== "localhost") {
          setStatusMsg("Requires HTTPS");
          setIsPending(false);
          return;
        }

        // Step 1: Request notification permission
        setStatusMsg("Requesting permission...");
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          setStatusMsg("Permission " + permission);
          setIsPending(false);
          return;
        }

        // Step 2: Get service worker registration
        setStatusMsg("Registering...");
        const reg = await navigator.serviceWorker.ready;

        // Step 3: Get VAPID public key from API
        const vapidRes = await fetch("/api/push/vapid-key");
        const vapidData = await vapidRes.json();
        const vapidKey = vapidData.key;
        if (!vapidKey) {
          setStatusMsg("VAPID key missing");
          setIsPending(false);
          return;
        }

        // Step 4: Subscribe to push
        setStatusMsg("Subscribing...");
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
        });

        // Step 5: Send subscription to server
        const subJson = sub.toJSON();
        const res = await fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            endpoint: subJson.endpoint,
            keys: subJson.keys,
          }),
        });

        if (!res.ok) {
          setStatusMsg("Server error");
          setIsPending(false);
          return;
        }

        localStorage.setItem("push-enabled", "true");
        setEnabled(true);
        setStatusMsg("Enabled!");
        setTimeout(() => setStatusMsg(null), 2000);
      } else {
        // Disable push
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await fetch("/api/push/unsubscribe", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ endpoint: sub.endpoint }),
          });
          await sub.unsubscribe();
        }
        localStorage.setItem("push-enabled", "false");
        setEnabled(false);
        setStatusMsg("Disabled");
        setTimeout(() => setStatusMsg(null), 2000);
      }
    } catch (err) {
      console.error("[push] Toggle error:", err);
      setStatusMsg(String(err instanceof Error ? err.message : "Error"));
    }
    setIsPending(false);
  };

  return (
    <div className="mt-2 space-y-1">
      <button
        onClick={toggle}
        disabled={isPending}
        className="flex items-center gap-2 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-muted)] px-3 py-2 text-xs text-[var(--text-muted)] hover:border-[var(--accent)] transition-colors"
      >
        <span>{enabled ? "🔔" : "🔕"}</span>
        <span>{isPending ? "Working..." : enabled ? "Notifications on" : "Enable notifications"}</span>
      </button>
      {statusMsg && (
        <p className="px-3 text-[10px] text-[var(--text-muted)]">{statusMsg}</p>
      )}
    </div>
  );
}

function DetailPanel({
  item,
  lane,
  related,
  allItems,
  editingTags,
  tagInput,
  suggestedTags,
  setTagInput,
  setEditingTags,
  addEditingTag,
  onClose,
}: {
  item: InboxItem;
  lane: LaneKey;
  related: SearchResult[];
  allItems: InboxItem[];
  editingTags: string[];
  tagInput: string;
  suggestedTags: string[];
  setTagInput: (value: string) => void;
  setEditingTags: React.Dispatch<React.SetStateAction<string[]>>;
  addEditingTag: (raw: string) => void;
  onClose: () => void;
}) {
  const suggestions = getSuggestions(item);

  return (
    <div className="fixed inset-0 z-50 bg-black/45" onClick={onClose}>
      <aside
        className="absolute right-0 top-0 h-full w-full max-w-lg overflow-y-auto border-l border-[var(--border)] bg-[var(--bg-elevated)] p-5 shadow-[0_20px_80px_rgba(0,0,0,0.45)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Item details</h2>
          <button type="button" onClick={onClose} className="rounded-md border border-[var(--border)] px-2 py-1 text-xs active:scale-95 active:brightness-90 active:bg-slate-200 dark:active:bg-slate-700 transition-transform duration-75">
            Esc
          </button>
        </div>

        {item.type === "link" && (() => {
          const meta = asMetadata(item.metadata);
          const summary = (meta as Record<string, unknown>).link_summary as LinkSummary | undefined;
          const url = summary?.url || (typeof (meta as Record<string, unknown>).url === "string" ? (meta as Record<string, unknown>).url as string : null) || item.content;
          let hostname: string | null = null;
          try { hostname = new URL(url).hostname.replace(/^www\./, ""); } catch { /* ignore */ }
          const hasSummary = !!(summary && (summary.ai_summary || summary.description));
          return (
            <section className="mb-4 rounded-lg border border-purple-400/20 bg-purple-400/5 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-mono uppercase tracking-[0.18em] text-purple-300">Link preview</p>
                {summary?.site_name || hostname ? (
                  <span className="text-[11px] text-[var(--text-muted)]">{summary?.site_name || hostname}</span>
                ) : null}
              </div>
              {summary?.page_title && (
                <p className="text-sm font-medium leading-snug">{summary.page_title}</p>
              )}
              {hasSummary ? (
                <p className="text-sm leading-relaxed text-[var(--text)]">
                  {summary?.ai_summary || summary?.description}
                </p>
              ) : (
                <p className="text-xs italic text-[var(--text-muted)]">
                  No summary yet — may still be fetching, or the page blocked access.
                </p>
              )}
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md border border-purple-400/30 bg-purple-400/10 px-2 py-1 text-xs text-purple-300 transition hover:border-purple-400/50 hover:text-purple-200"
              >
                <svg className="h-3 w-3 shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6.5 3.5h-3a1 1 0 00-1 1v8a1 1 0 001 1h8a1 1 0 001-1v-3" />
                  <path d="M9.5 2.5h4v4" />
                  <path d="M13.5 2.5l-6 6" />
                </svg>
                Open {hostname || "link"}
              </a>
              <form action={backfillLinkSummary} className="pt-1">
                <input type="hidden" name="itemId" value={item.id} />
                <button
                  type="submit"
                  className="text-[11px] text-[var(--text-muted)] underline underline-offset-2 hover:text-[var(--text)]"
                >
                  {hasSummary ? "Refresh summary" : "Try fetching summary"}
                </button>
              </form>
            </section>
          );
        })()}

        <form action={updateItemDetails} className="space-y-3">
          <input type="hidden" name="itemId" value={item.id} />
          <input type="hidden" name="tags" value={JSON.stringify(editingTags)} />

          <label className="block text-sm">
            <span className="mb-1 block text-[var(--text-muted)]">Title</span>
            <input defaultValue={item.title ?? ""} name="title" className="w-full rounded-md border border-[var(--border)] bg-[var(--bg-muted)] px-3 py-2" />
          </label>

          <label className="block text-sm">
            <span className="mb-1 block text-[var(--text-muted)]">Content</span>
            <textarea defaultValue={item.content} name="content" className="h-36 w-full rounded-md border border-[var(--border)] bg-[var(--bg-muted)] px-3 py-2" />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="mb-1 block text-[var(--text-muted)]">Type</span>
              <select name="type" defaultValue={item.type} className="w-full rounded-md border border-[var(--border)] bg-[var(--bg-muted)] px-3 py-2">
                <option value="note">Note</option>
                <option value="todo">Todo</option>
                <option value="link">Link</option>
              </select>
            </label>

            <label className="block text-sm">
              <span className="mb-1 block text-[var(--text-muted)]">Lane</span>
              <select name="lane" defaultValue={lane} className="w-full rounded-md border border-[var(--border)] bg-[var(--bg-muted)] px-3 py-2">
                <option value="today">Today</option>
                <option value="next">Next Up</option>
                <option value="backlog">Backlog</option>
              </select>
            </label>
          </div>

          <label className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
            <input type="checkbox" name="markReviewed" value="true" defaultChecked={!item.needs_review} />
            Mark as reviewed
          </label>

          <section className="space-y-3 rounded-lg border border-[var(--border)] bg-[var(--bg-muted)] p-3">
            <div>
              <p className="text-xs font-mono uppercase tracking-[0.18em] text-[var(--text-muted)]">Tags</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {editingTags.length === 0 ? (
                  <span className="text-xs text-[var(--text-muted)]">No tags yet</span>
                ) : (
                  editingTags.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => setEditingTags((prev) => prev.filter((entry) => entry !== tag))}
                      className="rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-1 text-xs active:scale-95 active:brightness-90 active:bg-slate-200 dark:active:bg-slate-700 transition-transform duration-75 hover:border-rose-300/60"
                    >
                      #{tag} ×
                    </button>
                  ))
                )}
              </div>
            </div>

            <label className="block text-sm">
              <span className="mb-1 block text-[var(--text-muted)]">Add tag</span>
              <input
                value={tagInput}
                onChange={(event) => setTagInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === ",") {
                    event.preventDefault();
                    addEditingTag(tagInput);
                  }
                }}
                placeholder="work, ai, personal-admin"
                className="w-full rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2"
              />
            </label>

            <div>
              <p className="text-xs font-mono uppercase tracking-[0.18em] text-[var(--text-muted)]">AI suggestions</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {suggestedTags.length === 0 ? (
                  <span className="text-xs text-[var(--text-muted)]">No suggestions right now</span>
                ) : (
                  suggestedTags.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => addEditingTag(tag)}
                      className="rounded-full border border-dashed border-[var(--accent)] bg-transparent px-2 py-1 text-xs text-[var(--text-muted)] active:scale-95 active:brightness-90 transition-transform duration-75 hover:bg-[color-mix(in_oklab,var(--accent)_10%,transparent)]"
                    >
                      + #{tag}
                    </button>
                  ))
                )}
              </div>
            </div>
          </section>

          {/* Recurrence */}
          <RecurrencePicker
            itemId={item.id}
            currentRecurrence={(item.metadata as Record<string, unknown>)?.recurrence as RecurrenceConfig | undefined}
          />

          {/* Subtasks */}
          <SubtaskTreePanel
            itemId={item.id}
            allItems={allItems}
          />

          <button type="submit" className="rounded-md bg-[var(--accent)] px-3 py-2 text-sm font-medium text-black active:scale-95 active:brightness-90 active:bg-green-700 dark:active:bg-green-800 transition-transform duration-75">
            Save changes
          </button>
          <p className="mt-1 text-[11px] text-[var(--text-muted)]">Changes to type or lane will improve future AI classifications.</p>
        </form>

        <div className="mt-2 flex flex-wrap gap-2">
          <form action={updateItemStatus}>
            <input type="hidden" name="itemId" value={item.id} />
            <input type="hidden" name="status" value="completed" />
            <button type="submit" className="rounded-md border border-[var(--border)] px-3 py-2 text-sm active:scale-95 active:brightness-90 active:bg-green-700 dark:active:bg-green-800 transition-transform duration-75">
              Complete
            </button>
          </form>

          <form action={dismissItem}>
            <input type="hidden" name="itemId" value={item.id} />
            <button type="submit" className="rounded-md border border-rose-300/40 px-3 py-2 text-sm text-rose-200 active:scale-95 active:brightness-90 active:bg-red-700 dark:active:bg-red-800 transition-transform duration-75">
              Move to trash
            </button>
          </form>
        </div>

        <section className="mt-6">
          <p className="text-xs font-mono uppercase tracking-[0.18em] text-[var(--text-muted)]">AI-suggested actions</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {suggestions.map((suggestion) => (
              <form key={suggestion} action={createSubtaskFromSuggestion}>
                <input type="hidden" name="itemId" value={item.id} />
                <input type="hidden" name="text" value={suggestion} />
                <button type="submit" className="rounded-full border border-[var(--border)] bg-[var(--bg-muted)] px-3 py-1 text-xs hover:border-[var(--accent)] active:scale-95 active:brightness-90 active:bg-slate-200 dark:active:bg-slate-700 transition-transform duration-75">
                  {suggestion}
                </button>
              </form>
            ))}
          </div>
        </section>

        <section className="mt-6">
          <p className="text-xs font-mono uppercase tracking-[0.18em] text-[var(--text-muted)]">Related</p>
          <ul className="mt-2 space-y-2">
            {related.length === 0 ? (
              <li className="rounded-md border border-dashed border-[var(--border)] p-3 text-xs text-[var(--text-muted)]">No related items yet.</li>
            ) : (
              related.map((entry) => (
                <li key={`${entry.source}-${entry.item.id}`} className="rounded-md border border-[var(--border)] bg-[var(--bg-muted)] p-3">
                  <p className="text-xs uppercase text-[var(--text-muted)]">{entry.source}</p>
                  <p className="mt-1 text-sm font-medium">{entry.item.title || "Untitled"}</p>
                  <p className="mt-1 line-clamp-2 text-xs text-[var(--text-muted)]">{entry.item.content}</p>
                </li>
              ))
            )}
          </ul>
        </section>
      </aside>
    </div>
  );
}

function EmptyLane({ lane }: { lane: LaneKey }) {
  const title = laneLabel(lane);

  return (
    <div className="rounded-lg border border-dashed border-[var(--border)] p-4 text-center">
      <svg viewBox="0 0 180 96" className="mx-auto h-16 w-36 text-[var(--text-muted)]" fill="none" aria-hidden>
        <rect x="16" y="20" width="148" height="56" rx="10" stroke="currentColor" strokeWidth="1.5" opacity="0.45" />
        <rect x="30" y="34" width="72" height="8" rx="4" fill="currentColor" opacity="0.35" />
        <rect x="30" y="48" width="108" height="6" rx="3" fill="currentColor" opacity="0.24" />
      </svg>
      <p className="mt-2 text-sm text-[var(--text-muted)]">No items in {title}.</p>
    </div>
  );
}

function BulkActionBar({
  count,
  bulkTagInput,
  setBulkTagInput,
  showBulkRetag,
  setShowBulkRetag,
  onArchive,
  onTrash,
  onMoveLane,
  onRetag,
  onReclassify,
  onSuggestTags,
  onClose,
}: {
  count: number;
  bulkTagInput: string;
  setBulkTagInput: (value: string) => void;
  showBulkRetag: boolean;
  setShowBulkRetag: (value: boolean) => void;
  onArchive: () => void;
  onTrash: () => void;
  onMoveLane: (lane: LaneKey) => void;
  onRetag: () => void;
  onReclassify: () => void;
  onSuggestTags: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed bottom-6 left-1/2 z-50 flex w-[min(92vw,860px)] -translate-x-1/2 flex-wrap items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-3 shadow-2xl">
      <span className="mr-2 text-sm text-[var(--text-muted)]">{count} selected</span>
      <button type="button" onClick={onArchive} className="rounded-md border border-[var(--border)] px-3 py-2 text-xs active:scale-95 active:brightness-90 active:bg-slate-200 dark:active:bg-slate-700 transition-transform duration-75 hover:border-[var(--accent)]">Archive all</button>
      <button type="button" onClick={onTrash} className="rounded-md border border-rose-300/40 px-3 py-2 text-xs text-rose-200 active:scale-95 active:brightness-90 active:bg-red-700 dark:active:bg-red-800 transition-transform duration-75 hover:bg-rose-300/10">Trash all</button>
      <select onChange={(event) => onMoveLane(event.target.value as LaneKey)} defaultValue="" className="rounded-md border border-[var(--border)] bg-[var(--bg-muted)] px-3 py-2 text-xs">
        <option value="" disabled>Move to lane</option>
        <option value="today">Today</option>
        <option value="next">Next Up</option>
        <option value="backlog">Backlog</option>
      </select>
      <div className="relative">
        <button type="button" onClick={() => setShowBulkRetag(!showBulkRetag)} className="rounded-md border border-[var(--border)] px-3 py-2 text-xs active:scale-95 active:brightness-90 active:bg-slate-200 dark:active:bg-slate-700 transition-transform duration-75 hover:border-[var(--accent)]">Retag</button>
        {showBulkRetag && (
          <div className="absolute bottom-12 left-0 w-64 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-3 shadow-xl">
            <input
              value={bulkTagInput}
              onChange={(event) => setBulkTagInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  onRetag();
                }
              }}
              placeholder="comma,separated,tags"
              className="w-full rounded-md border border-[var(--border)] bg-[var(--bg-muted)] px-3 py-2 text-xs"
            />
          </div>
        )}
      </div>
      <button type="button" onClick={onReclassify} className="rounded-md border border-[var(--border)] px-3 py-2 text-xs active:scale-95 active:brightness-90 active:bg-slate-200 dark:active:bg-slate-700 transition-transform duration-75 hover:border-[var(--accent)]">Re-classify all</button>
      <button type="button" onClick={onSuggestTags} className="rounded-md border border-[var(--border)] px-3 py-2 text-xs active:scale-95 active:brightness-90 active:bg-slate-200 dark:active:bg-slate-700 transition-transform duration-75 hover:border-[var(--accent)]">Suggest tags for all</button>
      <button type="button" onClick={onClose} className="ml-auto rounded-md border border-[var(--border)] px-3 py-2 text-xs active:scale-95 active:brightness-90 active:bg-slate-200 dark:active:bg-slate-700 transition-transform duration-75 hover:border-[var(--accent)]">✕</button>
    </div>
  );
}

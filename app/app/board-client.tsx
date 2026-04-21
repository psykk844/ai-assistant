"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
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
  createSubtaskFromSuggestion,
  dismissItem,
  markItemReviewed,
  moveItemToLane,
  permanentlyDeleteItem,
  purgeExpiredTrash,
  restoreItemFromTrash,
  signOut,
  updateItemDetails,
  updateItemStatus,
} from "./actions";
import { laneFromItem, type LaneKey } from "@/lib/items/lane";
import type { InboxItem, ItemMetadata } from "@/lib/items/types";

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

function getSuggestions(item: InboxItem): string[] {
  const title = item.title || item.content.slice(0, 80);
  return [
    `Break down: ${title}`,
    `Research context for: ${title}`,
    `Set deadline for: ${title}`,
  ];
}

function asMetadata(metadata: InboxItem["metadata"]): ItemMetadata {
  if (!metadata || typeof metadata !== "object") return {};
  return metadata;
}

function isTrash(item: InboxItem) {
  const metadata = asMetadata(item.metadata);
  return item.status === "archived" && typeof metadata.deleted_at === "string";
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
  const [isPending, startTransition] = useTransition();
  const composerRef = useRef<HTMLTextAreaElement | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
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

  const boardItems = useMemo(() => {
    const base = items.filter((item) => !isTrash(item));
    if (activeFilter === "all") return base;
    if (activeFilter === "active" || activeFilter === "completed" || activeFilter === "archived") {
      return base.filter((item) => item.status === activeFilter);
    }
    if (activeFilter === "todo" || activeFilter === "note" || activeFilter === "link") {
      return base.filter((item) => item.type === activeFilter);
    }
    if (activeFilter === "trash") return [];
    return base;
  }, [items, activeFilter]);

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
              {LANE_ORDER.map((lane) => (
                <button
                  key={lane}
                  type="button"
                  onClick={() => setFullscreenLane((prev) => (prev === lane ? null : lane))}
                  className={`w-full rounded-lg border px-3 py-2 text-left transition ${
                    fullscreenLane === lane
                      ? "border-[var(--accent)] bg-[color-mix(in_oklab,var(--accent)_14%,transparent)]"
                      : "border-[var(--border)] bg-[var(--bg-muted)] hover:border-[var(--accent)]"
                  }`}
                >
                  <span className="text-[var(--text-muted)]">{laneLabel(lane)}</span>
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
                  <button
                    type="button"
                    onClick={handleVaultSync}
                    className="rounded-md border border-[var(--border)] px-3 py-1 text-xs hover:border-[var(--accent)]"
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
                          className="w-full rounded-md border border-[var(--border)] bg-[var(--bg-muted)] p-3 text-left hover:border-[var(--accent)]"
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
                    className={`rounded-md border px-2 py-1 ${
                      activeFilter === key
                        ? "border-[var(--accent)] bg-[color-mix(in_oklab,var(--accent)_14%,transparent)]"
                        : "border-[var(--border)] bg-[var(--bg-muted)] hover:border-[var(--accent)]"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {activeFilter !== "trash" && (
              <div className="mb-2 flex items-center gap-2">
                <form action={clearCompletedBacklog}>
                  <button
                    type="submit"
                    className="rounded-md border border-[var(--border)] px-3 py-2 text-xs hover:border-[var(--accent)]"
                  >
                    Clear completed to trash
                  </button>
                </form>
                <form action={purgeExpiredTrash}>
                  <button
                    type="submit"
                    className="rounded-md border border-[var(--border)] px-3 py-2 text-xs hover:border-rose-300/50"
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
                    pending={isPending}
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
                  className="rounded-lg border border-[var(--border)] bg-[var(--bg-muted)] px-3 py-2 text-sm transition hover:border-[var(--accent)]"
                >
                  {theme === "dark" ? "☀ Light" : "🌙 Dark"}
                </button>
                <form action={signOut}>
                  <button
                    type="submit"
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-muted)] px-3 py-2 text-sm transition hover:border-[var(--accent)]"
                  >
                    Sign out
                  </button>
                </form>
              </div>

              <a
                href="/widget"
                target="_blank"
                rel="noreferrer"
                className="mt-3 block rounded-md border border-[var(--border)] bg-[var(--bg-muted)] px-3 py-2 text-xs text-[var(--text-muted)] hover:border-[var(--accent)]"
              >
                Open /widget (pin with PowerToys Win+Ctrl+T)
              </a>
            </div>

            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
              <div className="mb-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => setSidebarMode("review")}
                  className={`rounded-md border px-2 py-1 text-xs ${sidebarMode === "review" ? "border-[var(--accent)]" : "border-[var(--border)]"}`}
                >
                  Review ({reviewItems.length})
                </button>
                <button
                  type="button"
                  onClick={() => setSidebarMode("chat")}
                  className={`rounded-md border px-2 py-1 text-xs ${sidebarMode === "chat" ? "border-[var(--accent)]" : "border-[var(--border)]"}`}
                >
                  AI chat
                </button>
                <button
                  type="button"
                  onClick={() => setSidebarMode("trash")}
                  className={`rounded-md border px-2 py-1 text-xs ${sidebarMode === "trash" ? "border-[var(--accent)]" : "border-[var(--border)]"}`}
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
                        <button type="button" className="w-full text-left" onClick={() => setSelectedItemId(item.id)}>
                          <p className="text-xs font-medium">{item.title || "Untitled"}</p>
                          <p className="mt-1 line-clamp-2 text-xs text-[var(--text-muted)]">{item.content}</p>
                        </button>
                        <form action={markItemReviewed} className="mt-2">
                          <input type="hidden" name="itemId" value={item.id} />
                          <button type="submit" className="rounded-md border border-[var(--border)] px-2 py-1 text-xs">
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
                            className="mt-2 rounded-md border border-[var(--border)] px-2 py-1 text-xs hover:border-[var(--accent)]"
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
                      className="w-full rounded-md bg-[var(--accent)] px-3 py-2 text-sm font-medium text-black disabled:opacity-60"
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
          onClose={() => setSelectedItemId(null)}
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
  pending,
}: {
  lane: LaneKey;
  items: InboxItem[];
  onOpenItem: (itemId: string) => void;
  pending: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: lane });

  return (
    <div
      ref={setNodeRef}
      className={`rounded-xl border bg-[var(--bg-elevated)] p-5 transition ${isOver ? "border-[var(--accent)]" : "border-[var(--border)]"}`}
    >
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-mono uppercase tracking-[0.2em] text-[var(--text-muted)]">{laneLabel(lane)}</p>
        <span className="text-xs text-[var(--text-muted)]">{items.length}</span>
      </div>

      {items.length === 0 ? (
        <EmptyLane lane={lane} />
      ) : (
        <SortableContext items={items.map((item) => item.id)} strategy={verticalListSortingStrategy}>
          <ul className="space-y-3">
            {items.map((item, index) => (
              <SortableCard key={item.id} item={item} onOpen={() => onOpenItem(item.id)} pending={pending} index={index} />
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
  pending,
  index,
}: {
  item: InboxItem;
  onOpen: () => void;
  pending: boolean;
  index: number;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    animationDelay: `${index * 36}ms`,
  };

  const lane = laneFromItem(item);

  return (
    <li
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="card-enter rounded-lg border border-[var(--border)] bg-[var(--bg-muted)] p-3"
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <button type="button" className={`rounded-md border px-2 py-0.5 text-xs font-mono uppercase ${typeStyles(item.type)}`} onClick={onOpen}>
          {item.type}
        </button>
        <span className="rounded-md border border-[var(--border)] px-2 py-0.5 text-xs font-mono uppercase text-[var(--text-muted)]">{lane}</span>
        {item.needs_review && (
          <span className="rounded-md border border-amber-300/30 bg-amber-300/15 px-2 py-0.5 text-xs font-mono uppercase text-amber-200">
            review
          </span>
        )}
        <button type="button" onClick={onOpen} className="ml-auto text-xs text-[var(--text-muted)] hover:text-[var(--text)]">
          Open
        </button>
      </div>

      <button type="button" onClick={onOpen} className="w-full text-left">
        <p className="text-sm font-medium">{item.title || "Untitled"}</p>
        <p className="mt-1 line-clamp-2 text-sm text-[var(--text-muted)]">{item.content}</p>
      </button>

      <div className="mt-3 flex flex-wrap gap-2">
        <form action={updateItemStatus}>
          <input type="hidden" name="itemId" value={item.id} />
          <input type="hidden" name="status" value={item.status === "completed" ? "active" : "completed"} />
          <button
            type="submit"
            className="rounded-md border border-[var(--border)] px-2 py-1 text-xs transition hover:border-emerald-300/40 hover:text-emerald-200 disabled:opacity-70"
            disabled={pending}
          >
            {item.status === "completed" ? "Reopen" : "Complete"}
          </button>
        </form>

        <form action={dismissItem}>
          <input type="hidden" name="itemId" value={item.id} />
          <button
            type="submit"
            className="rounded-md border border-[var(--border)] px-2 py-1 text-xs transition hover:border-rose-300/40 hover:text-rose-200 disabled:opacity-70"
            disabled={pending}
          >
            Move to trash
          </button>
        </form>
      </div>
    </li>
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
                    className="rounded-md border border-[var(--border)] px-2 py-1 text-xs hover:border-[var(--accent)]"
                  >
                    Restore
                  </button>
                </form>
                <form action={permanentlyDeleteItem}>
                  <input type="hidden" name="itemId" value={item.id} />
                  <button
                    type="submit"
                    disabled={pending}
                    className="rounded-md border border-rose-300/50 px-2 py-1 text-xs text-rose-200 hover:bg-rose-300/10"
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

function DetailPanel({
  item,
  lane,
  related,
  onClose,
}: {
  item: InboxItem;
  lane: LaneKey;
  related: SearchResult[];
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
          <button type="button" onClick={onClose} className="rounded-md border border-[var(--border)] px-2 py-1 text-xs">
            Esc
          </button>
        </div>

        <form action={updateItemDetails} className="space-y-3">
          <input type="hidden" name="itemId" value={item.id} />

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

          <div className="flex flex-wrap gap-2">
            <button type="submit" className="rounded-md bg-[var(--accent)] px-3 py-2 text-sm font-medium text-black">
              Save changes
            </button>

            <form action={updateItemStatus}>
              <input type="hidden" name="itemId" value={item.id} />
              <input type="hidden" name="status" value="completed" />
              <button type="submit" className="rounded-md border border-[var(--border)] px-3 py-2 text-sm">
                Complete
              </button>
            </form>

            <form action={dismissItem}>
              <input type="hidden" name="itemId" value={item.id} />
              <button type="submit" className="rounded-md border border-rose-300/40 px-3 py-2 text-sm text-rose-200">
                Move to trash
              </button>
            </form>
          </div>
        </form>

        <section className="mt-6">
          <p className="text-xs font-mono uppercase tracking-[0.18em] text-[var(--text-muted)]">AI-suggested actions</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {suggestions.map((suggestion) => (
              <form key={suggestion} action={createSubtaskFromSuggestion}>
                <input type="hidden" name="itemId" value={item.id} />
                <input type="hidden" name="text" value={suggestion} />
                <button type="submit" className="rounded-full border border-[var(--border)] bg-[var(--bg-muted)] px-3 py-1 text-xs hover:border-[var(--accent)]">
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

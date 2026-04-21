import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireHardcodedSession } from "@/lib/auth/session";
import { resolveSessionUserId } from "@/lib/auth/session-user";
import { captureInboxItem, markItemReviewed, signOut, updateItemStatus } from "./actions";
import { InboxComposer } from "./inbox-composer";
import { ActionButton } from "./action-button";

type InboxItem = {
  id: string;
  type: "note" | "todo" | "link";
  title: string | null;
  content: string;
  status: "active" | "completed" | "archived";
  priority_score: number;
  confidence_score: number | null;
  needs_review: boolean;
  created_at: string;
};

function typeStyles(type: InboxItem["type"]) {
  if (type === "todo") return "bg-blue-300/20 text-blue-200 border-blue-300/30";
  if (type === "link") return "bg-purple-300/20 text-purple-200 border-purple-300/30";
  return "bg-emerald-300/20 text-emerald-200 border-emerald-300/30";
}

function laneFrom(item: InboxItem): "today" | "next" | "backlog" {
  if (item.status !== "active") return "backlog";
  if (item.priority_score >= 0.8) return "today";
  if (item.priority_score >= 0.6) return "next";
  return "backlog";
}

function ItemCard({ item }: { item: InboxItem }) {
  const lane = laneFrom(item);
  return (
    <li className="rounded-lg border border-[var(--border)] bg-[var(--bg-muted)] p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className={`rounded-md border px-2 py-0.5 text-xs font-mono uppercase ${typeStyles(item.type)}`}>
          {item.type}
        </span>
        <span className="rounded-md border border-[var(--border)] px-2 py-0.5 text-xs font-mono uppercase text-[var(--text-muted)]">
          {lane}
        </span>
        {item.needs_review && (
          <span className="rounded-md border border-amber-300/30 bg-amber-300/15 px-2 py-0.5 text-xs font-mono uppercase text-amber-200">
            review
          </span>
        )}
        <span className="ml-auto text-xs text-[var(--text-muted)]">
          P{Math.round(item.priority_score * 100)} · C
          {item.confidence_score !== null ? Math.round(item.confidence_score * 100) : "--"}
        </span>
      </div>

      <p className="text-sm font-medium">{item.title || "Untitled"}</p>
      <p className="mt-1 line-clamp-2 text-sm text-[var(--text-muted)]">{item.content}</p>

      <div className="mt-3 flex flex-wrap gap-2">
        {item.status !== "completed" && (
          <form action={updateItemStatus}>
            <input type="hidden" name="itemId" value={item.id} />
            <input type="hidden" name="status" value="completed" />
            <ActionButton
              idleLabel="Complete"
              pendingLabel="Completing..."
              className="rounded-md border border-[var(--border)] px-2 py-1 text-xs transition hover:border-emerald-300/40 hover:text-emerald-200 disabled:opacity-70"
            />
          </form>
        )}

        {item.status !== "active" && (
          <form action={updateItemStatus}>
            <input type="hidden" name="itemId" value={item.id} />
            <input type="hidden" name="status" value="active" />
            <ActionButton
              idleLabel="Reopen"
              pendingLabel="Reopening..."
              className="rounded-md border border-[var(--border)] px-2 py-1 text-xs transition hover:border-blue-300/40 hover:text-blue-200 disabled:opacity-70"
            />
          </form>
        )}

        {item.status !== "archived" && (
          <form action={updateItemStatus}>
            <input type="hidden" name="itemId" value={item.id} />
            <input type="hidden" name="status" value="archived" />
            <ActionButton
              idleLabel="Archive"
              pendingLabel="Archiving..."
              className="rounded-md border border-[var(--border)] px-2 py-1 text-xs transition hover:border-zinc-300/40 disabled:opacity-70"
            />
          </form>
        )}

        {item.needs_review && (
          <form action={markItemReviewed}>
            <input type="hidden" name="itemId" value={item.id} />
            <ActionButton
              idleLabel="Mark reviewed"
              pendingLabel="Saving..."
              className="rounded-md border border-amber-300/30 bg-amber-300/10 px-2 py-1 text-xs text-amber-200 transition hover:bg-amber-300/20 disabled:opacity-70"
            />
          </form>
        )}
      </div>
    </li>
  );
}

function Lane({ title, items }: { title: string; items: InboxItem[] }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-mono uppercase tracking-[0.2em] text-[var(--text-muted)]">{title}</p>
        <span className="text-xs text-[var(--text-muted)]">{items.length}</span>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">No items in this lane.</p>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <ItemCard key={item.id} item={item} />
          ))}
        </ul>
      )}
    </div>
  );
}

export default async function AppPage() {
  await requireHardcodedSession();

  const supabase = createAdminClient();
  const sessionUserId = await resolveSessionUserId();

  const { data: items, error } = await supabase
    .from("items")
    .select("id, type, title, content, status, priority_score, confidence_score, needs_review, created_at")
    .eq("user_id", sessionUserId)
    .order("priority_score", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(40);

  if (error) throw new Error(`Failed to load inbox items: ${error.message}`);

  const allItems = (items ?? []) as InboxItem[];

  const todayItems = allItems.filter((item) => laneFrom(item) === "today");
  const nextItems = allItems.filter((item) => laneFrom(item) === "next");
  const backlogItems = allItems.filter((item) => laneFrom(item) === "backlog");
  const reviewItems = allItems.filter((item) => item.needs_review);

  return (
    <main className="min-h-screen bg-[var(--bg)] text-[var(--text)] p-4 md:p-6">
      <div className="mx-auto grid max-w-7xl gap-4 md:grid-cols-[220px_1fr_300px]">
        <aside className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
          <p className="text-xs font-mono uppercase tracking-[0.2em] text-[var(--text-muted)]">Workspace</p>
          <h2 className="mt-2 text-lg font-semibold">Linear Console</h2>
          <div className="mt-4 space-y-2 text-sm">
            <div className="flex items-center justify-between rounded-lg bg-[var(--bg-muted)] px-3 py-2">
              <span className="text-[var(--text-muted)]">Today</span>
              <span className="font-mono">{todayItems.length}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-[var(--bg-muted)] px-3 py-2">
              <span className="text-[var(--text-muted)]">Next Up</span>
              <span className="font-mono">{nextItems.length}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-[var(--bg-muted)] px-3 py-2">
              <span className="text-[var(--text-muted)]">Backlog</span>
              <span className="font-mono">{backlogItems.length}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-[var(--bg-muted)] px-3 py-2">
              <span className="text-[var(--text-muted)]">Review</span>
              <span className="font-mono">{reviewItems.length}</span>
            </div>
          </div>
        </aside>

        <section className="space-y-4">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5">
            <p className="text-xs font-mono uppercase tracking-[0.2em] text-[var(--text-muted)]">Smart Inbox</p>
            <h1 className="mt-2 text-2xl font-semibold">Capture anything</h1>
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              Classifier routes entries via Claude Opus — powered by OARS.
            </p>

            <InboxComposer
              action={captureInboxItem}
              buttonClassName="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-black transition hover:bg-[var(--accent-strong)] disabled:opacity-70"
            />
          </div>

          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
            <p className="text-xs font-mono uppercase tracking-[0.2em] text-[var(--text-muted)]">Quick filters</p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <span className="rounded-md border border-[var(--border)] bg-[var(--bg-muted)] px-2 py-1">Active: {allItems.filter((i) => i.status === "active").length}</span>
              <span className="rounded-md border border-[var(--border)] bg-[var(--bg-muted)] px-2 py-1">Completed: {allItems.filter((i) => i.status === "completed").length}</span>
              <span className="rounded-md border border-[var(--border)] bg-[var(--bg-muted)] px-2 py-1">Archived: {allItems.filter((i) => i.status === "archived").length}</span>
              <span className="rounded-md border border-[var(--border)] bg-[var(--bg-muted)] px-2 py-1">Links: {allItems.filter((i) => i.type === "link").length}</span>
              <span className="rounded-md border border-[var(--border)] bg-[var(--bg-muted)] px-2 py-1">Todos: {allItems.filter((i) => i.type === "todo").length}</span>
              <span className="rounded-md border border-[var(--border)] bg-[var(--bg-muted)] px-2 py-1">Notes: {allItems.filter((i) => i.type === "note").length}</span>
            </div>
          </div>

          <Lane title="Today" items={todayItems} />
          <Lane title="Next Up" items={nextItems} />
          <Lane title="Backlog" items={backlogItems} />
        </section>

        <aside className="space-y-4">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
            <p className="text-xs font-mono uppercase tracking-[0.2em] text-[var(--text-muted)]">Session</p>
            <p className="mt-2 break-all text-sm">{process.env.HARDCODED_USERNAME ?? "sam"}</p>
            <form action={signOut} className="mt-4">
              <button
                type="submit"
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-muted)] px-3 py-2 text-sm transition hover:border-[var(--accent)]"
              >
                Sign out
              </button>
            </form>
          </div>

          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">Review queue</p>
            {reviewItems.length === 0 ? (
              <p className="mt-2 text-sm text-[var(--text-muted)]">No low-confidence items pending review.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {reviewItems.slice(0, 8).map((item) => (
                  <li key={item.id} className="rounded-md border border-amber-300/20 bg-amber-300/10 p-2">
                    <p className="text-xs font-medium">{item.title || "Untitled"}</p>
                    <p className="mt-1 line-clamp-2 text-xs text-[var(--text-muted)]">{item.content}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </main>
  );
}

import { createAdminClient } from "@/lib/supabase/admin";
import { requireHardcodedSession } from "@/lib/auth/session";
import { resolveSessionUserId } from "@/lib/auth/session-user";
import { updateItemStatus } from "@/app/app/actions";
import { laneFromItem } from "@/lib/items/lane";

type WidgetItem = {
  id: string;
  title: string | null;
  content: string;
  status: "active" | "completed" | "archived";
  priority_score: number;
  metadata: Record<string, unknown> | null;
};

export const dynamic = "force-dynamic";

export default async function WidgetPage() {
  await requireHardcodedSession();

  const admin = createAdminClient();
  const userId = await resolveSessionUserId();

  const { data, error } = await admin
    .from("items")
    .select("id,title,content,status,priority_score,metadata")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("priority_score", { ascending: false })
    .limit(32);

  if (error) throw new Error(`Failed to load widget items: ${error.message}`);

  const filtered = ((data ?? []) as WidgetItem[]).filter(
    (item) => !((item.metadata ?? {}) as Record<string, unknown>).dismissed,
  );
  const focusItems = filtered.filter((item) => {
    const lane = laneFromItem(item);
    return lane === "today" || lane === "next";
  });

  return (
    <main className="min-h-screen bg-[var(--bg)] text-[var(--text)] p-3" data-theme="dark">
      <div className="mx-auto max-w-xl space-y-2">
        <header className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-3">
          <p className="text-xs font-mono uppercase tracking-[0.18em] text-[var(--text-muted)]">Focus widget</p>
          <p className="mt-1 text-sm text-[var(--text-muted)]">Auto-refresh every 60s · Today + Next Up</p>
        </header>

        {focusItems.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[var(--border)] p-4 text-sm text-[var(--text-muted)]">
            No items in your focus lanes.
          </div>
        ) : (
          <ul className="space-y-2">
            {focusItems.map((item) => (
              <li key={item.id} className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-3">
                <p className="text-sm font-medium">{item.title || "Untitled"}</p>
                <p className="mt-1 line-clamp-2 text-xs text-[var(--text-muted)]">{item.content}</p>
                <form action={updateItemStatus} className="mt-2">
                  <input type="hidden" name="itemId" value={item.id} />
                  <input type="hidden" name="status" value="completed" />
                  <button type="submit" className="rounded-md border border-[var(--border)] px-2 py-1 text-xs hover:border-[var(--success)]">
                    Complete
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </div>

      <script
        dangerouslySetInnerHTML={{
          __html: `setTimeout(() => location.reload(), 60000);`,
        }}
      />
    </main>
  );
}

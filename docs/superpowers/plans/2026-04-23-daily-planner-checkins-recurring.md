# Daily Planner + AI Check-ins + Recurring Tasks + Subtask Trees — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the AI Assistant Console from a passive inbox/board into a proactive ADHD-friendly daily planning system with a dedicated "My Day" page, recurring task auto-generation, AI-powered push notification check-ins, and unlimited-depth subtask trees.

**Architecture:** Four features built bottom-up: (1) data model + types first, (2) subtask tree logic + component, (3) recurring task engine + cron, (4) push notification infrastructure, (5) "My Day" page assembling everything, (6) AI check-in generation. Each task produces working, testable code with commits.

**Tech Stack:** Next.js 14 (App Router), Supabase (PostgreSQL), Vitest, web-push (new), OARS/Claude, Tailwind CSS, @dnd-kit

**Spec:** `docs/superpowers/specs/2026-04-23-daily-planner-checkins-recurring-design.md`

---

## File Map

### New files:
| File | Responsibility |
|------|---------------|
| `lib/items/subtask-tree.ts` | Build tree from flat items, helpers |
| `lib/items/recurrence.ts` | Recurrence logic: next-due calc, should-generate, create instance |
| `lib/push/web-push.ts` | web-push config + send helper |
| `app/app/subtask-tree.tsx` | Subtask tree React component (recursive, unlimited depth) |
| `app/app/recurrence-picker.tsx` | Recurrence UI toggle (Daily/Weekly + day picker) |
| `app/app/my-day/page.tsx` | Server component: fetch today's data |
| `app/app/my-day/my-day-client.tsx` | Client component: briefing card, task list, progress bar, quick-add |
| `app/app/my-day/briefing.ts` | AI briefing generation (OARS call + fallback) |
| `app/api/cron/generate-recurring/route.ts` | Cron endpoint: create recurring instances |
| `app/api/cron/send-checkins/route.ts` | Cron endpoint: AI check-in + push send |
| `app/api/push/subscribe/route.ts` | Register push subscription |
| `app/api/push/unsubscribe/route.ts` | Remove push subscription |
| `tests/subtask-tree.test.ts` | Subtask tree building tests |
| `tests/recurrence.test.ts` | Recurrence logic tests |
| `tests/briefing.test.ts` | Briefing generation tests |
| `supabase/migrations/20260423_push_subscriptions.sql` | Push subscriptions table |

### Modified files:
| File | Changes |
|------|---------|
| `lib/items/types.ts` | Add `RecurrenceConfig` type, extend `ItemMetadata` |
| `app/app/actions.ts` | Add `setRecurrence`, `createSubtask`, `reorderSubtasks`, push subscribe/unsubscribe actions |
| `app/app/board-client.tsx` | Add "My Day" sidebar link, recurrence picker in detail panel, subtask tree in detail panel, push notification toggle |
| `public/sw.js` | Add `push` and `notificationclick` event handlers |
| `package.json` | Add `web-push` dependency |

---

## Task 1: Extend Types + Add RecurrenceConfig

**Files:**
- Modify: `lib/items/types.ts`

- [ ] **Step 1: Add RecurrenceConfig type and extend ItemMetadata**

```typescript
// Add after the existing ItemMetadata type in lib/items/types.ts

export type RecurrenceFrequency = "daily" | "weekly";

export type RecurrenceConfig = {
  frequency: RecurrenceFrequency;
  days?: number[];         // For weekly: 1=Mon..7=Sun
  next_due: string;        // ISO date "2026-04-24"
  template_id?: string;    // On generated instances, points to template
  is_template?: boolean;   // true on the original recurring item
};
```

And add `recurrence` to `ItemMetadata`:

```typescript
export type ItemMetadata = {
  dismissed?: boolean;
  deleted_at?: string;
  cleared_from_backlog?: boolean;
  parent_item_id?: string;
  generated_from?: string;
  recurrence?: RecurrenceConfig;
  subtask_order?: string[];   // ordered child IDs for manual reorder
  [key: string]: unknown;
};
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add lib/items/types.ts
git commit -m "feat: add RecurrenceConfig type and extend ItemMetadata for recurrence + subtask ordering"
```

---

## Task 2: Subtask Tree Logic (Pure Functions)

**Files:**
- Create: `lib/items/subtask-tree.ts`
- Create: `tests/subtask-tree.test.ts`

- [ ] **Step 1: Write failing tests for subtask tree building**

Create `tests/subtask-tree.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { buildSubtaskTree, flattenTree, getSubtaskProgress } from "../lib/items/subtask-tree";
import type { InboxItem } from "../lib/items/types";

function makeItem(overrides: Partial<InboxItem> & { id: string }): InboxItem {
  return {
    type: "todo",
    title: overrides.id,
    content: "",
    status: "active",
    priority_score: 0.5,
    confidence_score: null,
    needs_review: false,
    created_at: new Date().toISOString(),
    tags: [],
    metadata: null,
    ...overrides,
  };
}

describe("buildSubtaskTree", () => {
  it("returns root items when no parent_item_id is set", () => {
    const items = [makeItem({ id: "a" }), makeItem({ id: "b" })];
    const tree = buildSubtaskTree(items);
    expect(tree).toHaveLength(2);
    expect(tree[0].children).toHaveLength(0);
  });

  it("nests single-level children under their parent", () => {
    const items = [
      makeItem({ id: "parent" }),
      makeItem({ id: "child1", metadata: { parent_item_id: "parent" } }),
      makeItem({ id: "child2", metadata: { parent_item_id: "parent" } }),
    ];
    const tree = buildSubtaskTree(items);
    expect(tree).toHaveLength(1);
    expect(tree[0].item.id).toBe("parent");
    expect(tree[0].children).toHaveLength(2);
    expect(tree[0].depth).toBe(0);
    expect(tree[0].children[0].depth).toBe(1);
  });

  it("builds unlimited nesting depth", () => {
    const items = [
      makeItem({ id: "root" }),
      makeItem({ id: "L1", metadata: { parent_item_id: "root" } }),
      makeItem({ id: "L2", metadata: { parent_item_id: "L1" } }),
      makeItem({ id: "L3", metadata: { parent_item_id: "L2" } }),
    ];
    const tree = buildSubtaskTree(items);
    expect(tree).toHaveLength(1);
    expect(tree[0].children[0].children[0].children[0].item.id).toBe("L3");
    expect(tree[0].children[0].children[0].children[0].depth).toBe(3);
  });

  it("handles orphaned children gracefully (parent not in list)", () => {
    const items = [
      makeItem({ id: "orphan", metadata: { parent_item_id: "missing" } }),
    ];
    const tree = buildSubtaskTree(items);
    // Orphans become roots
    expect(tree).toHaveLength(1);
    expect(tree[0].item.id).toBe("orphan");
  });

  it("prevents circular references", () => {
    const items = [
      makeItem({ id: "a", metadata: { parent_item_id: "b" } }),
      makeItem({ id: "b", metadata: { parent_item_id: "a" } }),
    ];
    const tree = buildSubtaskTree(items);
    // Should not infinite loop — both become roots
    expect(tree.length).toBeGreaterThanOrEqual(1);
  });

  it("respects subtask_order on parent metadata", () => {
    const items = [
      makeItem({ id: "parent", metadata: { subtask_order: ["child2", "child1"] } }),
      makeItem({ id: "child1", metadata: { parent_item_id: "parent" } }),
      makeItem({ id: "child2", metadata: { parent_item_id: "parent" } }),
    ];
    const tree = buildSubtaskTree(items);
    expect(tree[0].children[0].item.id).toBe("child2");
    expect(tree[0].children[1].item.id).toBe("child1");
  });
});

describe("getSubtaskProgress", () => {
  it("counts completed vs total children recursively", () => {
    const items = [
      makeItem({ id: "parent" }),
      makeItem({ id: "c1", status: "completed", metadata: { parent_item_id: "parent" } }),
      makeItem({ id: "c2", status: "active", metadata: { parent_item_id: "parent" } }),
      makeItem({ id: "c3", status: "completed", metadata: { parent_item_id: "c2" } }),
    ];
    const tree = buildSubtaskTree(items);
    const progress = getSubtaskProgress(tree[0]);
    expect(progress).toEqual({ completed: 2, total: 3 });
  });

  it("returns zero for items with no children", () => {
    const items = [makeItem({ id: "solo" })];
    const tree = buildSubtaskTree(items);
    const progress = getSubtaskProgress(tree[0]);
    expect(progress).toEqual({ completed: 0, total: 0 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/subtask-tree.test.ts --reporter=verbose`
Expected: FAIL — module not found

- [ ] **Step 3: Implement subtask-tree.ts**

Create `lib/items/subtask-tree.ts`:

```typescript
import type { InboxItem } from "./types";

export interface TreeNode {
  item: InboxItem;
  children: TreeNode[];
  depth: number;
}

export function buildSubtaskTree(items: InboxItem[]): TreeNode[] {
  const itemMap = new Map<string, InboxItem>();
  const childrenMap = new Map<string, InboxItem[]>();

  // Index items
  for (const item of items) {
    itemMap.set(item.id, item);
  }

  // Group by parent
  for (const item of items) {
    const parentId = item.metadata?.parent_item_id;
    if (parentId && itemMap.has(parentId)) {
      const siblings = childrenMap.get(parentId) ?? [];
      siblings.push(item);
      childrenMap.set(parentId, siblings);
    }
  }

  // Detect circular refs: walk ancestry chain, max depth 50
  const isCircular = (itemId: string): boolean => {
    const visited = new Set<string>();
    let current = itemId;
    while (current) {
      if (visited.has(current)) return true;
      visited.add(current);
      const parent = itemMap.get(current)?.metadata?.parent_item_id;
      if (!parent || !itemMap.has(parent)) break;
      current = parent;
    }
    return false;
  };

  // Build tree recursively
  const buildNode = (item: InboxItem, depth: number, visited: Set<string>): TreeNode => {
    visited.add(item.id);
    let children = childrenMap.get(item.id) ?? [];

    // Respect subtask_order if present on parent
    const order = (item.metadata as Record<string, unknown>)?.subtask_order as string[] | undefined;
    if (order && Array.isArray(order)) {
      const orderMap = new Map(order.map((id, idx) => [id, idx]));
      children = [...children].sort((a, b) => {
        const ai = orderMap.get(a.id) ?? Infinity;
        const bi = orderMap.get(b.id) ?? Infinity;
        return ai - bi;
      });
    }

    return {
      item,
      depth,
      children: children
        .filter((c) => !visited.has(c.id))
        .map((c) => buildNode(c, depth + 1, visited)),
    };
  };

  // Roots: items with no parent, or orphans (parent not in list), or circular refs
  const roots: InboxItem[] = [];
  for (const item of items) {
    const parentId = item.metadata?.parent_item_id;
    if (!parentId || !itemMap.has(parentId) || isCircular(item.id)) {
      // Only add as root if not already a child of a valid parent
      if (!parentId || !itemMap.has(parentId)) {
        roots.push(item);
      }
    }
  }

  // For circular items, add them as roots too
  for (const item of items) {
    if (isCircular(item.id) && !roots.includes(item)) {
      roots.push(item);
    }
  }

  const visited = new Set<string>();
  return roots.map((item) => buildNode(item, 0, visited));
}

export function getSubtaskProgress(node: TreeNode): { completed: number; total: number } {
  let completed = 0;
  let total = 0;

  for (const child of node.children) {
    total++;
    if (child.item.status === "completed") completed++;
    const sub = getSubtaskProgress(child);
    completed += sub.completed;
    total += sub.total;
  }

  return { completed, total };
}

export function flattenTree(nodes: TreeNode[]): InboxItem[] {
  const result: InboxItem[] = [];
  const walk = (node: TreeNode) => {
    result.push(node.item);
    node.children.forEach(walk);
  };
  nodes.forEach(walk);
  return result;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/subtask-tree.test.ts --reporter=verbose`
Expected: All 7 tests PASS

- [ ] **Step 5: Commit**

```bash
git add lib/items/subtask-tree.ts tests/subtask-tree.test.ts
git commit -m "feat: add subtask tree builder with unlimited nesting, ordering, and circular ref protection"
```

---

## Task 3: Recurrence Logic (Pure Functions)

**Files:**
- Create: `lib/items/recurrence.ts`
- Create: `tests/recurrence.test.ts`

- [ ] **Step 1: Write failing tests for recurrence logic**

Create `tests/recurrence.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import {
  calculateNextDue,
  shouldGenerateInstance,
  buildRecurringInstance,
} from "../lib/items/recurrence";
import type { InboxItem, RecurrenceConfig } from "../lib/items/types";

function makeItem(overrides: Partial<InboxItem> & { id: string }): InboxItem {
  return {
    type: "todo",
    title: overrides.id,
    content: "",
    status: "active",
    priority_score: 0.9,
    confidence_score: null,
    needs_review: false,
    created_at: new Date().toISOString(),
    tags: [],
    metadata: null,
    ...overrides,
  };
}

describe("calculateNextDue", () => {
  it("returns tomorrow for daily frequency", () => {
    const result = calculateNextDue("daily", undefined, "2026-04-23");
    expect(result).toBe("2026-04-24");
  });

  it("returns next matching day for weekly frequency", () => {
    // 2026-04-23 is Thursday (4). days=[1] means Monday.
    const result = calculateNextDue("weekly", [1], "2026-04-23");
    expect(result).toBe("2026-04-27"); // next Monday
  });

  it("returns next matching day cycling through multiple days", () => {
    // 2026-04-23 is Thursday (4). days=[1, 5] means Mon, Fri.
    const result = calculateNextDue("weekly", [1, 5], "2026-04-23");
    expect(result).toBe("2026-04-24"); // next Friday is tomorrow
  });

  it("wraps to next week if all days are earlier in the week", () => {
    // 2026-04-25 is Saturday (6). days=[1, 3] means Mon, Wed.
    const result = calculateNextDue("weekly", [1, 3], "2026-04-25");
    expect(result).toBe("2026-04-27"); // next Monday
  });
});

describe("shouldGenerateInstance", () => {
  it("returns true when next_due is today", () => {
    const config: RecurrenceConfig = { frequency: "daily", next_due: "2026-04-23", is_template: true };
    expect(shouldGenerateInstance(config, "2026-04-23")).toBe(true);
  });

  it("returns true when next_due is in the past", () => {
    const config: RecurrenceConfig = { frequency: "daily", next_due: "2026-04-22", is_template: true };
    expect(shouldGenerateInstance(config, "2026-04-23")).toBe(true);
  });

  it("returns false when next_due is in the future", () => {
    const config: RecurrenceConfig = { frequency: "daily", next_due: "2026-04-24", is_template: true };
    expect(shouldGenerateInstance(config, "2026-04-23")).toBe(false);
  });

  it("returns false when is_template is false", () => {
    const config: RecurrenceConfig = { frequency: "daily", next_due: "2026-04-23", is_template: false };
    expect(shouldGenerateInstance(config, "2026-04-23")).toBe(false);
  });
});

describe("buildRecurringInstance", () => {
  it("creates a new item copying template fields", () => {
    const template = makeItem({
      id: "tmpl-1",
      title: "Take meds",
      content: "Morning medication",
      type: "todo",
      tags: ["health"],
      metadata: {
        recurrence: { frequency: "daily", next_due: "2026-04-23", is_template: true },
      },
    });
    const instance = buildRecurringInstance(template, "user-1");
    expect(instance.title).toBe("Take meds");
    expect(instance.content).toBe("Morning medication");
    expect(instance.type).toBe("todo");
    expect(instance.tags).toEqual(["health"]);
    expect(instance.status).toBe("active");
    expect(instance.priority_score).toBe(0.9);
    expect(instance.metadata.recurrence.template_id).toBe("tmpl-1");
    expect(instance.metadata.recurrence.is_template).toBe(false);
    expect(instance.user_id).toBe("user-1");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/recurrence.test.ts --reporter=verbose`
Expected: FAIL — module not found

- [ ] **Step 3: Implement recurrence.ts**

Create `lib/items/recurrence.ts`:

```typescript
import type { InboxItem, RecurrenceConfig, RecurrenceFrequency } from "./types";

/**
 * Calculate the next due date after `fromDate`.
 * @param frequency "daily" or "weekly"
 * @param days For weekly: array of day numbers (1=Mon..7=Sun)
 * @param fromDate ISO date string "YYYY-MM-DD"
 * @returns ISO date string for the next due date
 */
export function calculateNextDue(
  frequency: RecurrenceFrequency,
  days: number[] | undefined,
  fromDate: string
): string {
  const from = new Date(fromDate + "T00:00:00Z");

  if (frequency === "daily") {
    const next = new Date(from);
    next.setUTCDate(next.getUTCDate() + 1);
    return next.toISOString().slice(0, 10);
  }

  // Weekly: find next matching day
  if (!days || days.length === 0) {
    // Default to same day next week
    const next = new Date(from);
    next.setUTCDate(next.getUTCDate() + 7);
    return next.toISOString().slice(0, 10);
  }

  // Convert JS day (0=Sun) to our format (1=Mon..7=Sun)
  const sortedDays = [...days].sort((a, b) => a - b);

  for (let offset = 1; offset <= 7; offset++) {
    const candidate = new Date(from);
    candidate.setUTCDate(candidate.getUTCDate() + offset);
    const jsDay = candidate.getUTCDay(); // 0=Sun, 1=Mon..6=Sat
    const ourDay = jsDay === 0 ? 7 : jsDay; // Convert: 7=Sun, 1=Mon..6=Sat
    if (sortedDays.includes(ourDay)) {
      return candidate.toISOString().slice(0, 10);
    }
  }

  // Fallback: 7 days from now (shouldn't reach here with valid days)
  const fallback = new Date(from);
  fallback.setUTCDate(fallback.getUTCDate() + 7);
  return fallback.toISOString().slice(0, 10);
}

/**
 * Check if a recurring template should generate an instance for the given date.
 */
export function shouldGenerateInstance(config: RecurrenceConfig, today: string): boolean {
  if (!config.is_template) return false;
  return config.next_due <= today;
}

/**
 * Build a new item from a recurring template.
 * Returns a plain object ready for Supabase insert (no `id` — DB generates it).
 */
export function buildRecurringInstance(
  template: InboxItem,
  userId: string
): {
  title: string | null;
  content: string;
  type: string;
  status: string;
  priority_score: number;
  confidence_score: number | null;
  needs_review: boolean;
  user_id: string;
  tags: string[];
  metadata: Record<string, unknown>;
} {
  const templateRecurrence = (template.metadata as Record<string, unknown>)?.recurrence as
    | RecurrenceConfig
    | undefined;

  return {
    title: template.title,
    content: template.content,
    type: template.type,
    status: "active",
    priority_score: 0.9, // Today lane
    confidence_score: template.confidence_score,
    needs_review: false,
    user_id: userId,
    tags: [...(template.tags ?? [])],
    metadata: {
      recurrence: {
        template_id: template.id,
        is_template: false,
        frequency: templateRecurrence?.frequency ?? "daily",
      },
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/recurrence.test.ts --reporter=verbose`
Expected: All 7 tests PASS

- [ ] **Step 5: Commit**

```bash
git add lib/items/recurrence.ts tests/recurrence.test.ts
git commit -m "feat: add recurrence logic — next-due calculation, generation check, instance builder"
```

---

## Task 4: Recurring Task Cron API Route

**Files:**
- Create: `app/api/cron/generate-recurring/route.ts`
- Modify: `app/app/actions.ts` (add `setRecurrence` action)

- [ ] **Step 1: Create the cron route**

Create `app/api/cron/generate-recurring/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  shouldGenerateInstance,
  buildRecurringInstance,
  calculateNextDue,
} from "@/lib/items/recurrence";
import type { InboxItem, RecurrenceConfig } from "@/lib/items/types";

export async function POST(req: NextRequest) {
  // Verify cron secret
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);

  // Fetch all template items with recurrence
  const { data: templates, error } = await supabase
    .from("items")
    .select("id, type, title, content, status, priority_score, confidence_score, needs_review, created_at, updated_at, metadata, tags")
    .eq("status", "active")
    .not("metadata->recurrence", "is", null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const items = (templates ?? []) as InboxItem[];
  let generated = 0;

  for (const item of items) {
    const recurrence = (item.metadata as Record<string, unknown>)?.recurrence as RecurrenceConfig | undefined;
    if (!recurrence || !shouldGenerateInstance(recurrence, today)) continue;

    // Check for existing instance today (prevent duplicates)
    const { data: existing } = await supabase
      .from("items")
      .select("id")
      .eq("status", "active")
      .filter("metadata->recurrence->>template_id", "eq", item.id)
      .gte("created_at", today + "T00:00:00Z")
      .lt("created_at", today + "T23:59:59Z")
      .limit(1);

    if (existing && existing.length > 0) continue;

    // Resolve user_id from template
    const { data: templateFull } = await supabase
      .from("items")
      .select("user_id")
      .eq("id", item.id)
      .single();

    if (!templateFull) continue;

    const instance = buildRecurringInstance(item, templateFull.user_id);

    // Insert new instance
    const { error: insertError } = await supabase.from("items").insert(instance);
    if (!insertError) generated++;

    // Update template next_due
    const nextDue = calculateNextDue(
      recurrence.frequency,
      recurrence.days,
      today
    );
    await supabase
      .from("items")
      .update({
        metadata: {
          ...(item.metadata as Record<string, unknown>),
          recurrence: { ...recurrence, next_due: nextDue },
        },
      })
      .eq("id", item.id);
  }

  return NextResponse.json({ generated, date: today });
}
```

- [ ] **Step 2: Add `setRecurrence` server action to actions.ts**

Add to `app/app/actions.ts`:

```typescript
export async function setRecurrence(itemId: string, frequency: "daily" | "weekly" | null, days?: number[]) {
  await requireHardcodedSession();
  const supabase = createAdminClient();

  // Fetch current item
  const { data: item, error: fetchErr } = await supabase
    .from("items")
    .select("metadata")
    .eq("id", itemId)
    .single();
  if (fetchErr || !item) return;

  const currentMeta = (item.metadata as Record<string, unknown>) ?? {};

  if (frequency === null) {
    // Remove recurrence
    const { recurrence, ...restMeta } = currentMeta;
    await supabase.from("items").update({ metadata: restMeta }).eq("id", itemId);
  } else {
    const today = new Date().toISOString().slice(0, 10);
    const { calculateNextDue } = await import("@/lib/items/recurrence");
    const nextDue = calculateNextDue(frequency, days, today);

    await supabase.from("items").update({
      metadata: {
        ...currentMeta,
        recurrence: {
          frequency,
          days: frequency === "weekly" ? days : undefined,
          next_due: nextDue,
          is_template: true,
        },
      },
    }).eq("id", itemId);
  }

  revalidatePath("/app");
  revalidatePath("/app/my-day");
}
```

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add app/api/cron/generate-recurring/route.ts app/app/actions.ts
git commit -m "feat: add recurring task cron endpoint and setRecurrence server action"
```

---

## Task 5: Subtask Server Actions

**Files:**
- Modify: `app/app/actions.ts`

- [ ] **Step 1: Add `createSubtask` action**

Add to `app/app/actions.ts`:

```typescript
export async function createSubtask(parentId: string, title: string) {
  await requireHardcodedSession();
  const supabase = createAdminClient();
  const userId = await resolveSessionUserId();

  // Fetch parent to inherit lane + type
  const { data: parent } = await supabase
    .from("items")
    .select("type, priority_score")
    .eq("id", parentId)
    .single();

  const { error } = await supabase.from("items").insert({
    user_id: userId,
    type: parent?.type ?? "todo",
    title,
    content: "",
    status: "active",
    priority_score: parent?.priority_score ?? 0.5,
    confidence_score: null,
    needs_review: false,
    metadata: { parent_item_id: parentId },
    tags: [],
  });

  if (error) throw new Error(`Failed to create subtask: ${error.message}`);

  revalidatePath("/app");
  revalidatePath("/app/my-day");
}

export async function reorderSubtasks(parentId: string, orderedIds: string[]) {
  await requireHardcodedSession();
  const supabase = createAdminClient();

  const { data: parent } = await supabase
    .from("items")
    .select("metadata")
    .eq("id", parentId)
    .single();

  const currentMeta = (parent?.metadata as Record<string, unknown>) ?? {};

  await supabase.from("items").update({
    metadata: { ...currentMeta, subtask_order: orderedIds },
  }).eq("id", parentId);

  revalidatePath("/app");
  revalidatePath("/app/my-day");
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add app/app/actions.ts
git commit -m "feat: add createSubtask and reorderSubtasks server actions"
```

---

## Task 6: Push Notification Infrastructure

**Files:**
- Create: `lib/push/web-push.ts`
- Create: `app/api/push/subscribe/route.ts`
- Create: `app/api/push/unsubscribe/route.ts`
- Create: `supabase/migrations/20260423_push_subscriptions.sql`
- Modify: `public/sw.js`
- Modify: `package.json` (add web-push)

- [ ] **Step 1: Install web-push**

Run: `npm install web-push`

- [ ] **Step 2: Create push_subscriptions migration**

Create `supabase/migrations/20260423_push_subscriptions.sql`:

```sql
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_push_sub_user ON push_subscriptions(user_id);
```

- [ ] **Step 3: Create web-push helper**

Create `lib/push/web-push.ts`:

```typescript
import webPush from "web-push";

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY ?? "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY ?? "";
const VAPID_SUBJECT = process.env.VAPID_SUBJECT ?? "mailto:admin@example.com";

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webPush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

export function getVapidPublicKey(): string {
  return VAPID_PUBLIC_KEY;
}

export async function sendPushNotification(
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  payload: { title: string; body: string; tag?: string; url?: string }
): Promise<boolean> {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    console.warn("[push] VAPID keys not configured, skipping push");
    return false;
  }

  try {
    await webPush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: subscription.keys,
      },
      JSON.stringify(payload)
    );
    return true;
  } catch (err: unknown) {
    const statusCode = (err as { statusCode?: number })?.statusCode;
    if (statusCode === 410 || statusCode === 404) {
      // Subscription expired — caller should remove it
      return false;
    }
    console.error("[push] Failed to send notification:", err);
    return false;
  }
}
```

- [ ] **Step 4: Create subscribe route**

Create `app/api/push/subscribe/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveSessionUserId } from "@/lib/auth/session-user";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { endpoint, keys } = body;

  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return NextResponse.json({ error: "Missing subscription data" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const userId = await resolveSessionUserId();

  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: userId,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
    },
    { onConflict: "endpoint" }
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 5: Create unsubscribe route**

Create `app/api/push/unsubscribe/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { endpoint } = body;

  if (!endpoint) {
    return NextResponse.json({ error: "Missing endpoint" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { error } = await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 6: Add push handlers to service worker**

Append to `public/sw.js` (after the existing fetch handler):

```javascript
// --- Push Notification Handlers ---

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data?.json() ?? {};
  } catch {
    data = { title: "AI Assistant", body: event.data?.text() ?? "New notification" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "AI Assistant", {
      body: data.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: data.tag || "checkin",
      data: { url: data.url || "/app/my-day" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/app/my-day";
  event.waitUntil(
    clients.matchAll({ type: "window" }).then((windowClients) => {
      // Focus existing tab if open
      for (const client of windowClients) {
        if (client.url.includes("/app") && "focus" in client) {
          return client.focus().then((c) => c.navigate(url));
        }
      }
      // Otherwise open new tab
      return clients.openWindow(url);
    })
  );
});
```

- [ ] **Step 7: Verify types compile and test existing tests still pass**

Run: `npx tsc --noEmit && npm test`
Expected: No type errors, all existing tests pass

- [ ] **Step 8: Commit**

```bash
git add lib/push/ app/api/push/ supabase/migrations/20260423_push_subscriptions.sql public/sw.js package.json package-lock.json
git commit -m "feat: add push notification infrastructure — web-push, subscribe/unsubscribe routes, SW handlers, migration"
```

---

## Task 7: AI Briefing Generation

**Files:**
- Create: `app/app/my-day/briefing.ts`
- Create: `tests/briefing.test.ts`

- [ ] **Step 1: Write failing tests for briefing generation**

Create `tests/briefing.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { buildBriefingContext, buildFallbackBriefing } from "../app/app/my-day/briefing";
import type { InboxItem } from "../lib/items/types";

function makeItem(overrides: Partial<InboxItem> & { id: string }): InboxItem {
  return {
    type: "todo",
    title: overrides.id,
    content: "",
    status: "active",
    priority_score: 0.9,
    confidence_score: null,
    needs_review: false,
    created_at: new Date().toISOString(),
    tags: [],
    metadata: null,
    ...overrides,
  };
}

describe("buildBriefingContext", () => {
  it("counts today items and identifies top focus", () => {
    const todayItems = [
      makeItem({ id: "top", title: "Ship API", priority_score: 0.95 }),
      makeItem({ id: "second", title: "Write tests", priority_score: 0.90 }),
    ];
    const ctx = buildBriefingContext(todayItems, [], []);
    expect(ctx.totalToday).toBe(2);
    expect(ctx.topFocus).toBe("Ship API");
  });

  it("counts overdue items", () => {
    const overdue = [
      makeItem({ id: "old", title: "Overdue task", created_at: "2026-04-21T00:00:00Z" }),
    ];
    const ctx = buildBriefingContext([], overdue, []);
    expect(ctx.overdueCount).toBe(1);
    expect(ctx.overdueItems).toHaveLength(1);
  });

  it("includes stale suggestions", () => {
    const stale = [
      makeItem({ id: "stale1", title: "Write docs", updated_at: "2026-04-17T00:00:00Z" }),
    ];
    const ctx = buildBriefingContext([], [], stale);
    expect(ctx.staleItems).toHaveLength(1);
    expect(ctx.staleItems[0].title).toBe("Write docs");
  });
});

describe("buildFallbackBriefing", () => {
  it("generates structured text without AI", () => {
    const todayItems = [
      makeItem({ id: "a", title: "Task A", priority_score: 0.95 }),
      makeItem({ id: "b", title: "Task B", priority_score: 0.90 }),
    ];
    const text = buildFallbackBriefing(todayItems, [], []);
    expect(text).toContain("2 tasks");
    expect(text).toContain("Task A");
  });

  it("mentions overdue items when present", () => {
    const overdue = [makeItem({ id: "late", title: "Late task" })];
    const text = buildFallbackBriefing([], overdue, []);
    expect(text).toContain("overdue");
    expect(text).toContain("Late task");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/briefing.test.ts --reporter=verbose`
Expected: FAIL — module not found

- [ ] **Step 3: Implement briefing.ts**

Create `app/app/my-day/briefing.ts`:

```typescript
import type { InboxItem } from "@/lib/items/types";

export interface BriefingContext {
  totalToday: number;
  topFocus: string | null;
  overdueCount: number;
  overdueItems: { id: string; title: string | null }[];
  staleItems: { id: string; title: string | null; daysSinceUpdate: number }[];
}

export function buildBriefingContext(
  todayItems: InboxItem[],
  overdueItems: InboxItem[],
  staleItems: InboxItem[]
): BriefingContext {
  const sorted = [...todayItems].sort((a, b) => b.priority_score - a.priority_score);
  const today = new Date();

  return {
    totalToday: todayItems.length,
    topFocus: sorted[0]?.title ?? null,
    overdueCount: overdueItems.length,
    overdueItems: overdueItems.map((i) => ({ id: i.id, title: i.title })),
    staleItems: staleItems.map((i) => {
      const updated = new Date(i.updated_at ?? i.created_at);
      const daysSinceUpdate = Math.floor((today.getTime() - updated.getTime()) / (1000 * 60 * 60 * 24));
      return { id: i.id, title: i.title, daysSinceUpdate };
    }),
  };
}

export function buildFallbackBriefing(
  todayItems: InboxItem[],
  overdueItems: InboxItem[],
  staleItems: InboxItem[]
): string {
  const ctx = buildBriefingContext(todayItems, overdueItems, staleItems);
  const lines: string[] = [];

  if (ctx.totalToday > 0) {
    lines.push(`You have **${ctx.totalToday} tasks** today.`);
    if (ctx.topFocus) {
      lines.push(`Your #1 focus: **${ctx.topFocus}**`);
    }
  } else {
    lines.push("No tasks scheduled for today. Time to plan or relax!");
  }

  if (ctx.overdueCount > 0) {
    const names = ctx.overdueItems.map((i) => i.title ?? "Untitled").join(", ");
    lines.push(`⚠️ ${ctx.overdueCount} overdue: ${names}`);
  }

  if (ctx.staleItems.length > 0) {
    for (const item of ctx.staleItems.slice(0, 3)) {
      lines.push(`💡 "${item.title}" has been waiting ${item.daysSinceUpdate} days — move to Today?`);
    }
  }

  return lines.join("\n");
}

export async function generateAIBriefing(
  todayItems: InboxItem[],
  overdueItems: InboxItem[],
  staleItems: InboxItem[]
): Promise<string> {
  const ctx = buildBriefingContext(todayItems, overdueItems, staleItems);

  try {
    const baseUrl = process.env.OARS_BASE_URL ?? "https://llm.digiwebfr.studio/v1";
    const apiKey = process.env.OARS_API_KEY ?? "";
    const model = process.env.OARS_MODEL ?? "claude-opus-4-6";

    if (!apiKey) return buildFallbackBriefing(todayItems, overdueItems, staleItems);

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        max_tokens: 200,
        messages: [
          {
            role: "system",
            content: "You are a friendly ADHD-aware productivity assistant. Generate a brief morning check-in (2-4 sentences). Be encouraging, specific about tasks, mention overdue items gently. No markdown formatting — plain text only.",
          },
          {
            role: "user",
            content: JSON.stringify(ctx),
          },
        ],
      }),
    });

    if (!response.ok) return buildFallbackBriefing(todayItems, overdueItems, staleItems);

    const data = await response.json();
    return data.choices?.[0]?.message?.content ?? buildFallbackBriefing(todayItems, overdueItems, staleItems);
  } catch {
    return buildFallbackBriefing(todayItems, overdueItems, staleItems);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/briefing.test.ts --reporter=verbose`
Expected: All 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add app/app/my-day/briefing.ts tests/briefing.test.ts
git commit -m "feat: add AI briefing generation with OARS integration and fallback"
```

---

## Task 8: "My Day" Page — Server + Client Components

**Files:**
- Create: `app/app/my-day/page.tsx`
- Create: `app/app/my-day/my-day-client.tsx`

- [ ] **Step 1: Create server component**

Create `app/app/my-day/page.tsx`:

```typescript
import { createAdminClient } from "@/lib/supabase/admin";
import { requireHardcodedSession } from "@/lib/auth/session";
import { resolveSessionUserId } from "@/lib/auth/session-user";
import type { InboxItem } from "@/lib/items/types";
import { normalizeItemTags } from "../board-logic";
import { MyDayClient } from "./my-day-client";

export default async function MyDayPage() {
  await requireHardcodedSession();

  const supabase = createAdminClient();
  const userId = await resolveSessionUserId();
  const today = new Date().toISOString().slice(0, 10);
  const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();

  // Fetch all active items (we need full set for subtask tree building)
  const { data: allItems, error } = await supabase
    .from("items")
    .select("id, type, title, content, status, priority_score, confidence_score, needs_review, created_at, updated_at, metadata")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("priority_score", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) throw new Error(`Failed to load items: ${error.message}`);

  const items = ((allItems ?? []) as InboxItem[]).map(normalizeItemTags);

  // Today lane: priority_score >= 0.85
  const todayItems = items.filter((i) => i.priority_score >= 0.85);

  // Overdue: Today items created before today
  const overdueItems = todayItems.filter((i) => i.created_at.slice(0, 10) < today);

  // Stale: Next/Backlog items not updated in 5+ days
  const staleItems = items.filter((i) => {
    if (i.priority_score >= 0.85) return false; // Skip today items
    const updated = i.updated_at ?? i.created_at;
    return updated < fiveDaysAgo;
  }).slice(0, 5);

  // Completed today (for progress tracking)
  const { data: completedToday } = await supabase
    .from("items")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "completed")
    .gte("updated_at", today + "T00:00:00Z");

  const completedCount = completedToday?.length ?? 0;

  return (
    <MyDayClient
      todayItems={todayItems}
      allActiveItems={items}
      overdueItems={overdueItems}
      staleItems={staleItems}
      completedTodayCount={completedCount}
    />
  );
}
```

- [ ] **Step 2: Create client component**

Create `app/app/my-day/my-day-client.tsx`:

```typescript
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
  setRecurrence,
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
    // Use fallback briefing (AI version would need server action or API call)
    const text = buildFallbackBriefing(todayItems, overdueItems, staleItems);
    setBriefingText(text);
    localStorage.setItem(cacheKey, text);
  }, [todayItems, overdueItems, staleItems]);

  const handleComplete = useCallback((itemId: string) => {
    startTransition(async () => {
      const form = new FormData();
      form.set("itemId", itemId);
      form.set("newStatus", "completed");
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
      await moveItemToLane(itemId, "today");
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

  // Subtask tree renderer
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
          {/* Expand toggle */}
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

          {/* Checkbox */}
          <button
            onClick={() => handleComplete(node.item.id)}
            className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors duration-140 ${
              node.item.status === "completed"
                ? "bg-[var(--success)] border-[var(--success)] text-white"
                : "border-[var(--border)] hover:border-[var(--accent)]"
            }`}
          >
            {node.item.status === "completed" && "✓"}
          </button>

          {/* Title */}
          <span className={`flex-1 text-sm ${node.item.status === "completed" ? "line-through text-[var(--text-muted)]" : ""}`}>
            {node.item.title || node.item.content.slice(0, 60)}
          </span>

          {/* Badges */}
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

          {/* Add subtask button (on hover) */}
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

        {/* Children */}
        {isExpanded && node.children.map(renderSubtaskNode)}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-[var(--border)] bg-[var(--bg)] px-6 py-4">
        <div className="flex items-center justify-between max-w-2xl mx-auto">
          <h1 className="text-xl font-semibold text-[var(--text)]">☀️ My Day</h1>
          <a href="/app" className="text-sm text-[var(--accent)] hover:underline">← Board</a>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-6 space-y-6">
        {/* AI Briefing Card */}
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
                {/* Stale item action buttons */}
                {staleItems.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {staleItems.slice(0, 3).map((item) => (
                      <button
                        key={item.id}
                        onClick={() => handleMoveSuggestion(item.id)}
                        className="block text-xs text-[var(--accent)] hover:underline"
                      >
                        → Move "{item.title}" to Today
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {/* Progress Bar */}
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

        {/* Today's Tasks */}
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

        {/* Quick Add */}
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
```

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Run dev server and visually verify**

Run: `npm run dev`
Navigate to: `http://localhost:3000/app/my-day`
Expected: Page renders with briefing card, progress bar, today's tasks (if any), and quick-add input

- [ ] **Step 5: Commit**

```bash
git add app/app/my-day/
git commit -m "feat: add My Day page with AI briefing, progress bar, subtask trees, and quick-add"
```

---

## Task 9: Recurrence Picker Component + Detail Panel Integration

**Files:**
- Create: `app/app/recurrence-picker.tsx`
- Modify: `app/app/board-client.tsx`

- [ ] **Step 1: Create recurrence picker component**

Create `app/app/recurrence-picker.tsx`:

```typescript
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setRecurrence } from "./actions";
import type { RecurrenceConfig } from "@/lib/items/types";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

interface RecurrencePickerProps {
  itemId: string;
  currentRecurrence?: RecurrenceConfig | null;
}

export function RecurrencePicker({ itemId, currentRecurrence }: RecurrencePickerProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [frequency, setFrequency] = useState<"daily" | "weekly" | null>(
    currentRecurrence?.is_template ? (currentRecurrence.frequency ?? null) : null
  );
  const [days, setDays] = useState<number[]>(currentRecurrence?.days ?? []);

  const handleChange = (newFreq: "daily" | "weekly" | null) => {
    setFrequency(newFreq);
    startTransition(async () => {
      await setRecurrence(itemId, newFreq, newFreq === "weekly" ? days : undefined);
      router.refresh();
    });
  };

  const toggleDay = (day: number) => {
    const newDays = days.includes(day) ? days.filter((d) => d !== day) : [...days, day];
    setDays(newDays);
    if (frequency === "weekly") {
      startTransition(async () => {
        await setRecurrence(itemId, "weekly", newDays);
        router.refresh();
      });
    }
  };

  return (
    <div className="space-y-2">
      <span className="block text-sm text-[var(--text-muted)]">Repeat</span>
      <div className="flex gap-2">
        {(["daily", "weekly", null] as const).map((opt) => (
          <button
            key={String(opt)}
            onClick={() => handleChange(opt)}
            disabled={isPending}
            className={`rounded-md px-3 py-1 text-xs font-medium transition-colors duration-140 ${
              frequency === opt
                ? "bg-[var(--accent)] text-white"
                : "bg-[var(--bg-muted)] text-[var(--text-muted)] hover:text-[var(--text)]"
            }`}
          >
            {opt === null ? "Off" : opt === "daily" ? "🔄 Daily" : "🔄 Weekly"}
          </button>
        ))}
      </div>
      {frequency === "weekly" && (
        <div className="flex gap-1 flex-wrap">
          {DAY_LABELS.map((label, idx) => {
            const dayNum = idx + 1;
            const isSelected = days.includes(dayNum);
            return (
              <button
                key={dayNum}
                onClick={() => toggleDay(dayNum)}
                disabled={isPending}
                className={`rounded-md px-2 py-1 text-xs font-medium transition-colors duration-140 ${
                  isSelected
                    ? "bg-[var(--accent)] text-white"
                    : "bg-[var(--bg-muted)] text-[var(--text-muted)] hover:text-[var(--text)]"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Integrate into detail panel in board-client.tsx**

In `app/app/board-client.tsx`, find the detail panel section (after the "Mark as reviewed" checkbox, before the save button). Add:

```typescript
// Import at top of file:
import { RecurrencePicker } from "./recurrence-picker";
import { SubtaskTreePanel } from "./subtask-tree";

// Inside detail panel, after the reviewed checkbox:
<RecurrencePicker
  itemId={item.id}
  currentRecurrence={(item.metadata as Record<string, unknown>)?.recurrence as RecurrenceConfig | undefined}
/>

<SubtaskTreePanel
  itemId={item.id}
  allItems={items}
/>
```

- [ ] **Step 3: Create subtask tree panel component for the detail view**

Create `app/app/subtask-tree.tsx`:

```typescript
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { InboxItem } from "@/lib/items/types";
import { buildSubtaskTree, getSubtaskProgress, type TreeNode } from "@/lib/items/subtask-tree";
import { createSubtask, updateItemStatus } from "./actions";

interface SubtaskTreePanelProps {
  itemId: string;
  allItems: InboxItem[];
}

export function SubtaskTreePanel({ itemId, allItems }: SubtaskTreePanelProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [newSubtaskTitle, setNewSubtaskTitle] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const tree = buildSubtaskTree(allItems);
  const rootNode = tree.find((n) => n.item.id === itemId);
  if (!rootNode) return null;

  const progress = getSubtaskProgress(rootNode);

  const handleAddSubtask = () => {
    if (!newSubtaskTitle.trim()) return;
    startTransition(async () => {
      await createSubtask(itemId, newSubtaskTitle.trim());
      setNewSubtaskTitle("");
      router.refresh();
    });
  };

  const handleComplete = (id: string) => {
    startTransition(async () => {
      const form = new FormData();
      form.set("itemId", id);
      form.set("newStatus", "completed");
      await updateItemStatus(form);
      router.refresh();
    });
  };

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const renderNode = (node: TreeNode): JSX.Element => {
    const hasChildren = node.children.length > 0;
    const isExpanded = expanded.has(node.item.id);

    return (
      <div key={node.item.id} style={{ paddingLeft: `${node.depth * 16}px` }}>
        <div className="flex items-center gap-2 py-1 group">
          {hasChildren ? (
            <button onClick={() => toggleExpand(node.item.id)} className="w-4 text-xs text-[var(--text-muted)]">
              {isExpanded ? "▼" : "▶"}
            </button>
          ) : (
            <span className="w-4" />
          )}
          <button
            onClick={() => handleComplete(node.item.id)}
            className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] ${
              node.item.status === "completed"
                ? "bg-[var(--success)] border-[var(--success)] text-white"
                : "border-[var(--border)] hover:border-[var(--accent)]"
            }`}
          >
            {node.item.status === "completed" && "✓"}
          </button>
          <span className={`text-xs flex-1 ${node.item.status === "completed" ? "line-through text-[var(--text-muted)]" : "text-[var(--text)]"}`}>
            {node.item.title || node.item.content.slice(0, 40)}
          </span>
        </div>
        {isExpanded && node.children.map(renderNode)}
      </div>
    );
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm text-[var(--text-muted)]">Subtasks</span>
        {progress.total > 0 && (
          <span className="text-xs text-[var(--text-muted)]">
            {progress.completed}/{progress.total} done
          </span>
        )}
      </div>
      {rootNode.children.length > 0 && (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-2">
          {rootNode.children.map(renderNode)}
        </div>
      )}
      <div className="flex gap-2">
        <input
          type="text"
          value={newSubtaskTitle}
          onChange={(e) => setNewSubtaskTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleAddSubtask();
            }
          }}
          placeholder="Add subtask..."
          className="flex-1 rounded-md border border-[var(--border)] bg-[var(--bg-muted)] px-2 py-1 text-xs"
        />
        <button
          onClick={handleAddSubtask}
          disabled={isPending || !newSubtaskTitle.trim()}
          className="rounded-md bg-[var(--accent)] px-2 py-1 text-xs text-white disabled:opacity-50"
        >
          Add
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Add "My Day" link to sidebar in board-client.tsx**

Find the sidebar section with lane buttons. Add above them:

```typescript
{/* My Day link — top of sidebar */}
<a
  href="/app/my-day"
  className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-[var(--text)] hover:bg-[var(--bg-muted)] transition-colors"
  style={{ borderLeft: "3px solid var(--accent)" }}
>
  <span>☀️</span>
  <span>My Day</span>
</a>
```

- [ ] **Step 5: Verify types compile and run dev**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add app/app/recurrence-picker.tsx app/app/subtask-tree.tsx app/app/board-client.tsx
git commit -m "feat: add recurrence picker, subtask tree panel, and My Day sidebar link to board"
```

---

## Task 10: AI Check-in Cron Route + Push Delivery

**Files:**
- Create: `app/api/cron/send-checkins/route.ts`

- [ ] **Step 1: Create the check-in cron route**

Create `app/api/cron/send-checkins/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushNotification } from "@/lib/push/web-push";
import { generateAIBriefing } from "@/app/app/my-day/briefing";
import { normalizeItemTags } from "@/app/app/board-logic";
import type { InboxItem } from "@/lib/items/types";

export async function POST(req: NextRequest) {
  // Verify cron secret
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const type = req.nextUrl.searchParams.get("type") ?? "morning";
  const supabase = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);
  const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();

  // Get all active items for the user (single-user app)
  const { data: allItems } = await supabase
    .from("items")
    .select("id, type, title, content, status, priority_score, confidence_score, needs_review, created_at, updated_at, metadata")
    .eq("status", "active")
    .order("priority_score", { ascending: false })
    .limit(100);

  const items = ((allItems ?? []) as InboxItem[]).map(normalizeItemTags);
  const todayItems = items.filter((i) => i.priority_score >= 0.85);
  const overdueItems = todayItems.filter((i) => i.created_at.slice(0, 10) < today);
  const staleItems = items
    .filter((i) => i.priority_score < 0.85 && (i.updated_at ?? i.created_at) < fiveDaysAgo)
    .slice(0, 3);

  let title: string;
  let body: string;

  if (type === "evening") {
    // Evening recap
    const { data: completedToday } = await supabase
      .from("items")
      .select("id")
      .eq("status", "completed")
      .gte("updated_at", today + "T00:00:00Z");

    const completedCount = completedToday?.length ?? 0;
    const remaining = todayItems.length;

    title = "🌙 Day's wrap-up";
    body = completedCount > 0
      ? `You completed ${completedCount} task${completedCount !== 1 ? "s" : ""} today! ${remaining > 0 ? `${remaining} remaining — they'll be here tomorrow.` : "Clean slate!"}`
      : remaining > 0
        ? `${remaining} tasks still open. No worries — tomorrow's a fresh start.`
        : "Quiet day! Rest up for tomorrow.";
  } else {
    // Morning briefing
    title = "☀️ Good morning!";
    body = await generateAIBriefing(todayItems, overdueItems, staleItems);
  }

  // Send to all subscriptions
  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth");

  let sent = 0;
  let failed = 0;

  for (const sub of subs ?? []) {
    const success = await sendPushNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      { title, body, tag: `checkin-${type}`, url: "/app/my-day" }
    );
    if (success) sent++;
    else {
      failed++;
      // Remove expired subscriptions
      await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
    }
  }

  return NextResponse.json({ type, sent, failed, title, body: body.slice(0, 100) });
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add app/api/cron/send-checkins/route.ts
git commit -m "feat: add AI check-in cron route with morning briefing and evening recap push delivery"
```

---

## Task 11: Push Notification Toggle in UI

**Files:**
- Modify: `app/app/board-client.tsx`

- [ ] **Step 1: Add notification settings to sidebar**

In the sidebar section of `board-client.tsx`, add a push notification toggle near the bottom (before the sign-out section):

```typescript
// Add to sidebar, above sign-out:
function PushToggle() {
  const [enabled, setEnabled] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("push-enabled") === "true";
  });
  const [isPending, setIsPending] = useState(false);

  const toggle = async () => {
    setIsPending(true);
    try {
      if (!enabled) {
        // Enable
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          setIsPending(false);
          return;
        }
        const reg = await navigator.serviceWorker.ready;
        const vapidKey = document.querySelector<HTMLMetaElement>('meta[name="vapid-public-key"]')?.content;
        if (!vapidKey) { setIsPending(false); return; }

        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: vapidKey,
        });
        const subJson = sub.toJSON();
        await fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            endpoint: subJson.endpoint,
            keys: subJson.keys,
          }),
        });
        localStorage.setItem("push-enabled", "true");
        setEnabled(true);
      } else {
        // Disable
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
      }
    } catch (err) {
      console.error("Push toggle error:", err);
    }
    setIsPending(false);
  };

  if (typeof window !== "undefined" && !("Notification" in window)) return null;

  return (
    <button
      onClick={toggle}
      disabled={isPending}
      className="flex items-center gap-2 w-full rounded-lg px-3 py-2 text-xs text-[var(--text-muted)] hover:bg-[var(--bg-muted)] transition-colors"
    >
      <span>{enabled ? "🔔" : "🔕"}</span>
      <span>{enabled ? "Notifications on" : "Enable notifications"}</span>
    </button>
  );
}
```

- [ ] **Step 2: Add VAPID public key meta tag to layout**

In `app/layout.tsx` or the `<head>` section, add:

```html
<meta name="vapid-public-key" content={process.env.VAPID_PUBLIC_KEY ?? ""} />
```

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add app/app/board-client.tsx app/layout.tsx
git commit -m "feat: add push notification toggle in sidebar with VAPID key meta tag"
```

---

## Task 12: Integration Testing + Full Build

**Files:**
- All test files

- [ ] **Step 1: Run all tests**

Run: `npm test`
Expected: All tests pass (existing + new)

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: Build succeeds (may timeout in sandbox — OK, will build on Coolify)

- [ ] **Step 4: Commit any fixes**

If any tests or type checks fail, fix and commit:

```bash
git add -A
git commit -m "fix: resolve integration issues from daily planner feature set"
```

---

## Task 13: Deploy + VAPID Key Setup + Cron Configuration

**Files:**
- None (infrastructure)

- [ ] **Step 1: Generate VAPID keys**

Run: `npx web-push generate-vapid-keys`
Save the output — will need to set as env vars.

- [ ] **Step 2: Set env vars in Coolify**

Set the following env vars on the Coolify app:
- `VAPID_PUBLIC_KEY=<generated>`
- `VAPID_PRIVATE_KEY=<generated>`
- `VAPID_SUBJECT=mailto:sam@example.com`
- `CRON_SECRET=<generate a random string>`

- [ ] **Step 3: Run push_subscriptions migration**

SSH into the Supabase DB container and run:
```sql
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_push_sub_user ON push_subscriptions(user_id);
```

- [ ] **Step 4: Push and deploy**

```bash
git push origin main
```
Trigger Coolify deployment.

- [ ] **Step 5: Set up cron jobs**

On Hetzner (or Coolify cron), configure:
```bash
# Generate recurring tasks at 00:05 UTC
5 0 * * * curl -s -X POST -H "Authorization: Bearer $CRON_SECRET" https://your-app.com/api/cron/generate-recurring
# Morning check-in at 09:00 UTC
0 9 * * * curl -s -X POST -H "Authorization: Bearer $CRON_SECRET" "https://your-app.com/api/cron/send-checkins?type=morning"
# Evening check-in at 18:00 UTC
0 18 * * * curl -s -X POST -H "Authorization: Bearer $CRON_SECRET" "https://your-app.com/api/cron/send-checkins?type=evening"
```

- [ ] **Step 6: Verify live deployment**

- Navigate to `/app/my-day` — should render with briefing
- Enable push notifications in sidebar
- Manually trigger: `curl -X POST -H "Authorization: Bearer $CRON_SECRET" "https://your-app.com/api/cron/send-checkins?type=morning"` — should receive push
- Set recurrence on a task, manually trigger: `curl -X POST -H "Authorization: Bearer $CRON_SECRET" "https://your-app.com/api/cron/generate-recurring"` — should create instance

- [ ] **Step 7: Final commit + tag**

```bash
git tag v2.0-daily-planner
git push origin --tags
```

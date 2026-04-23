# Phase 1: Button Feedback + Tags + Bulk Actions — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add visual press feedback to all buttons, a full tagging system with AI suggestions, and a multi-select bulk action bar to the AI assistant inbox app.

**Architecture:** Three independent features built in sequence. Button feedback is pure CSS and touches only `board-client.tsx`. Tags adds a DB column + new API route + UI in cards/DetailPanel/filter bar. Bulk actions builds on tags (for retag) and adds selection state + floating action bar in `board-client.tsx`. No new infrastructure required — all features extend Supabase, existing server actions, and the OARS/Claude integration.

**Tech Stack:** Next.js 14 server actions, React 18 (useState/useMemo), Tailwind CSS 4, Supabase (postgres text[] column), OARS/Claude (suggest-tags), Vitest

---

## File Map

| File | Change |
|------|--------|
| `app/app/board-client.tsx` | Add active: CSS classes to all buttons; tag pills on cards; tag input + AI ghost pills in DetailPanel; tag filter bar; checkboxes on cards; BulkActionBar component; selectedIds state |
| `app/app/actions.ts` | Add `tags` to `updateItemDetails` payload + SELECT; add `bulkUpdateItems` server action with type/tag/metadata support |
| `app/app/page.tsx` | Include `tags` in the initial Supabase SELECT for AppBoard |
| `lib/items/types.ts` | Add `tags: string[]` to `InboxItem` |
| `app/api/suggest-tags/route.ts` | New route: POST, returns 1–3 AI tag suggestions |
| `tests/board-logic.test.ts` | Add regression tests for tag filtering logic |
| Supabase migration (SQL) | `ALTER TABLE items ADD COLUMN tags text[] NOT NULL DEFAULT '{}'` |

---

## Task 1: Button Visual Feedback

**Files:**
- Modify: `ai-assistant/app/app/board-client.tsx`

### Background
The file has many buttons spread across SortableCard, DetailPanel, TrashSection, and the right sidebar Review queue. We need to add `active:scale-95 active:brightness-90 transition-transform duration-75` to all of them, plus colour-appropriate active states.

- [ ] **Step 1: Find all button classNames in board-client.tsx**

Run:
```bash
grep -n 'type="submit"\|type="button"' /workspace/ai-assistant/app/app/board-client.tsx | head -60
```
Expected: list of line numbers with button declarations.

- [ ] **Step 2: Add active states to SortableCard action buttons**

In `board-client.tsx`, find the `SortableCard` component. There are two action buttons: Complete and Move to trash. Update their `className` strings:

**Complete button** — add `active:scale-95 active:brightness-90 active:bg-green-700 dark:active:bg-green-800 transition-transform duration-75`:
```tsx
// Before (Complete button):
className="rounded-md border border-[var(--border)] bg-[var(--bg-muted)] px-2 py-1 text-xs hover:border-green-300/50"
// After:
className="rounded-md border border-[var(--border)] bg-[var(--bg-muted)] px-2 py-1 text-xs hover:border-green-300/50 active:scale-95 active:brightness-90 active:bg-green-700 dark:active:bg-green-800 transition-transform duration-75"
```

**Move to trash button** — add `active:scale-95 active:brightness-90 active:bg-red-700 dark:active:bg-red-800 transition-transform duration-75`:
```tsx
// Before (Move to trash):
className="rounded-md border border-[var(--border)] px-2 py-1 text-xs hover:border-rose-300/50"
// After:
className="rounded-md border border-[var(--border)] px-2 py-1 text-xs hover:border-rose-300/50 active:scale-95 active:brightness-90 active:bg-red-700 dark:active:bg-red-800 transition-transform duration-75"
```

- [ ] **Step 3: Add active states to DetailPanel buttons**

In the `DetailPanel` component (or inline in `AppBoard` where it renders), update:

**Save changes button** — add `active:scale-95 active:brightness-90 active:bg-green-700 dark:active:bg-green-800 transition-transform duration-75`:
```tsx
// After existing className, append:
active:scale-95 active:brightness-90 active:bg-green-700 dark:active:bg-green-800 transition-transform duration-75
```

**Complete button in DetailPanel** — add `active:scale-95 active:brightness-90 active:bg-green-700 dark:active:bg-green-800 transition-transform duration-75`.

**Move to trash button in DetailPanel** — add `active:scale-95 active:brightness-90 active:bg-red-700 dark:active:bg-red-800 transition-transform duration-75`.

- [ ] **Step 4: Add active states to Review sidebar "Mark reviewed" button**

Find `Mark reviewed` button in the right sidebar review queue. Add:
```tsx
active:scale-95 active:brightness-90 active:bg-green-700 dark:active:bg-green-800 transition-transform duration-75
```

- [ ] **Step 5: Add active states to secondary/utility buttons**

For all remaining buttons (Sync vault, Clear completed to trash, Purge trash, lane sidebar buttons, theme toggle, Sign out, sidebar tab buttons Review/AI chat/Trash):
```tsx
// Append to their className:
active:scale-95 active:brightness-90 active:bg-slate-200 dark:active:bg-slate-700 transition-transform duration-75
```

- [ ] **Step 6: TypeScript check**

Run:
```bash
npx tsc --noEmit
```
Working directory: `/workspace/ai-assistant`
Expected: 0 errors.

- [ ] **Step 7: Run tests**

Run:
```bash
npm test
```
Working directory: `/workspace/ai-assistant`
Expected: all 4 tests pass.

- [ ] **Step 8: Commit**

```bash
git add ai-assistant/app/app/board-client.tsx
git commit -m "feat: add active press feedback to all buttons"
```

---

## Task 2: DB Migration — Add Tags Column

**Canonical schema source:** the live app currently reads and writes the `items` table (see `app/app/actions.ts` and `app/app/page.tsx`), so this plan uses `items.tags` as the authoritative target. The spec’s `inbox_items` wording is normalized here to match the real codebase.

**Files:**
- Supabase SQL migration (run via Supabase dashboard or CLI)

- [ ] **Step 1: Run the migration SQL**

In Supabase dashboard → SQL editor (or via `supabase db push` if CLI is configured), run:
```sql
ALTER TABLE items ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS idx_items_tags ON items USING gin(tags);
```

- [ ] **Step 2: Verify column exists**

Run in Supabase SQL editor:
```sql
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'items' AND column_name = 'tags';
```
Expected: one row showing `tags | ARRAY | '{}'`.

- [ ] **Step 3: Commit migration file**

Save the SQL as a migration file and commit:
```bash
mkdir -p /workspace/ai-assistant/supabase/migrations
cat > /workspace/ai-assistant/supabase/migrations/20260422_add_tags.sql << 'SQL'
ALTER TABLE items ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS idx_items_tags ON items USING gin(tags);
SQL
git add ai-assistant/supabase/migrations/20260422_add_tags.sql
git commit -m "feat: add tags column migration to items table"
```

---

## Task 3: TypeScript Type Update

**Files:**
- Modify: `ai-assistant/lib/items/types.ts`

- [ ] **Step 1: Write the failing test**

In `ai-assistant/tests/board-logic.test.ts`, add at the top of the `describe` block:
```typescript
it("InboxItem has a tags field that defaults to empty array", () => {
  const item: import("../lib/items/types").InboxItem = {
    id: "1",
    type: "note",
    title: null,
    content: "test",
    status: "active",
    priority_score: 0.5,
    confidence_score: null,
    needs_review: false,
    created_at: new Date().toISOString(),
    tags: [],
  };
  expect(item.tags).toEqual([]);
});
```

- [ ] **Step 2: Run test to verify it fails (type error)**

```bash
npm test
```
Working directory: `/workspace/ai-assistant`
Expected: TypeScript compile error — `tags` does not exist on type `InboxItem`.

- [ ] **Step 3: Add `tags` to InboxItem**

In `ai-assistant/lib/items/types.ts`, update `InboxItem`:
```typescript
export type InboxItem = {
  id: string;
  type: ItemType;
  title: string | null;
  content: string;
  status: ItemStatus;
  priority_score: number;
  confidence_score: number | null;
  needs_review: boolean;
  created_at: string;
  updated_at?: string;
  metadata?: ItemMetadata | null;
  tags: string[];
};
```

- [ ] **Step 4: Run tests to verify pass**

```bash
npm test
```
Working directory: `/workspace/ai-assistant`
Expected: all tests pass including the new type test.

- [ ] **Step 5: TypeScript check**

```bash
npx tsc --noEmit
```
Working directory: `/workspace/ai-assistant`
Expected: 0 errors. (Note: `board-client.tsx` may need `tags: []` fallback in places that map DB rows — see Task 4 Step 1.)

- [ ] **Step 6: Commit**

```bash
git add lib/items/types.ts tests/board-logic.test.ts
git commit -m "feat: add tags field to InboxItem type"
```

---

## Task 4: Update Server Actions for Tags

**Files:**
- Modify: `ai-assistant/app/app/actions.ts`

### Context
`updateItemDetails` (lines 271–361) builds a `payload` object and updates the `items` table. We need to:
1. Accept `tags` from FormData
2. Include `tags` in the UPDATE payload
3. Include `tags` in the SELECT return

`loadItems` (in `app/app/page.tsx`) fetches items — we need to include `tags` in that SELECT too.

- [ ] **Step 1: Update `updateItemDetails` to handle tags**

In `actions.ts`, update the `updateItemDetails` function:

After line 279 (`const markReviewed = ...`), add:
```typescript
const tagsRaw = String(formData.get("tags") ?? "[]");
let tags: string[] = [];
try { tags = JSON.parse(tagsRaw) as string[]; } catch { tags = []; }
tags = tags.map((t) => t.toLowerCase().trim()).filter(Boolean);
```

Then in the `payload` object (around line 294), add `tags`:
```typescript
const payload: Record<string, unknown> = {
  title: title || null,
  content,
  type,
  priority_score: laneToPriority(lane),
  status: "active",
  metadata: withoutTrashFlags(asMetadata(existing?.metadata)),
  tags,
};
```

Update the SELECT on line 310 to include `tags`:
```typescript
.select("id,user_id,title,content,type,status,priority_score,confidence_score,needs_review,created_at,updated_at,metadata,tags")
```

Update the `updated` type assertion (around line 323) to include `tags`:
```typescript
const updated = data as {
  id: string;
  user_id: string;
  title: string | null;
  content: string;
  type: "todo" | "note" | "link";
  status: "active" | "completed" | "archived";
  priority_score: number;
  confidence_score: number | null;
  needs_review: boolean;
  created_at: string;
  updated_at?: string;
  metadata?: Record<string, unknown>;
  tags: string[];
};
```

- [ ] **Step 2: Update `page.tsx` loadItems SELECT to include tags**

In `ai-assistant/app/app/page.tsx`, find the Supabase `.select(...)` call that loads items. Add `tags` to the field list:
```typescript
// Find the select that looks like:
.select("id,title,content,type,status,priority_score,confidence_score,needs_review,created_at,updated_at,metadata")
// Change to:
.select("id,title,content,type,status,priority_score,confidence_score,needs_review,created_at,updated_at,metadata,tags")
```

Also ensure the returned items are cast to `InboxItem[]` — since `tags` now defaults to `'{}'` in the DB, existing rows will return `[]` automatically.

- [ ] **Step 3: TypeScript check**

```bash
npx tsc --noEmit
```
Working directory: `/workspace/ai-assistant`
Expected: 0 errors.

- [ ] **Step 4: Run tests**

```bash
npm test
```
Working directory: `/workspace/ai-assistant`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add app/app/actions.ts app/app/page.tsx
git commit -m "feat: include tags in updateItemDetails and loadItems"
```

---

## Task 5: Add /api/suggest-tags Route

**Files:**
- Create: `ai-assistant/app/api/suggest-tags/route.ts`

### Context
The existing `/api/classify/route.ts` imports `classifySmartInput` from `@/lib/smart/classify-with-ai`. The suggest-tags route uses the existing OARS/Claude integration via `chatWithContext` or a direct model call. Looking at the classify pattern, the simplest approach is a direct fetch to the OARS chat endpoint with a tightly scoped prompt.

- [ ] **Step 1: Write the failing test**

In `ai-assistant/tests/board-logic.test.ts`, add:
```typescript
it("suggest-tags API route file exists", async () => {
  const fs = await import("fs");
  expect(
    fs.existsSync(
      new URL("../app/api/suggest-tags/route.ts", import.meta.url).pathname,
    ),
  ).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test
```
Working directory: `/workspace/ai-assistant`
Expected: FAIL — file does not exist.

- [ ] **Step 3: Create the route**

Create `ai-assistant/app/api/suggest-tags/route.ts`:
```typescript
import { NextResponse } from "next/server";
import { chatWithContext } from "@/lib/ai/oars";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      content?: string;
      title?: string;
      type?: string;
    };

    const content = String(body.content ?? "").trim();
    if (!content) {
      return NextResponse.json({ tags: [] });
    }

    const titleHint = body.title ? ` Title: "${body.title}".` : "";
    const typeHint = body.type ? ` Type: ${body.type}.` : "";
    const prompt = `You are a tagging assistant.${typeHint}${titleHint} Given this item content, suggest 1 to 3 short, lowercase, hyphenated tag labels that would help categorize and filter it. Return ONLY a valid JSON array of strings, nothing else. Examples: ["productivity","meeting-notes"], ["project-x","urgent"], ["reading-list"]. Content: ${content.slice(0, 500)}`;

    const answer = await chatWithContext(prompt, []);

    // Parse the first JSON array found in the response
    const match = answer.match(/\[[\s\S]*?\]/);
    if (!match) return NextResponse.json({ tags: [] });

    const parsed = JSON.parse(match[0]) as unknown;
    if (!Array.isArray(parsed)) return NextResponse.json({ tags: [] });

    const tags = parsed
      .filter((t): t is string => typeof t === "string")
      .map((t) => t.toLowerCase().trim().replace(/\s+/g, "-"))
      .filter(Boolean)
      .slice(0, 3);

    return NextResponse.json({ tags });
  } catch {
    return NextResponse.json({ tags: [] });
  }
}
```

- [ ] **Step 4: Check that `chatWithContext` is exported from oars**

Run:
```bash
grep -n "export.*chatWithContext\|export async function chatWithContext" /workspace/ai-assistant/lib/ai/oars.ts
```
Expected: a line showing the export. If `chatWithContext` is named differently, update the import in the route to match.

- [ ] **Step 5: Run tests**

```bash
npm test
```
Working directory: `/workspace/ai-assistant`
Expected: all tests pass including the file-exists test.

- [ ] **Step 6: TypeScript check**

```bash
npx tsc --noEmit
```
Working directory: `/workspace/ai-assistant`
Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
git add app/api/suggest-tags/route.ts tests/board-logic.test.ts
git commit -m "feat: add /api/suggest-tags route for AI tag suggestions"
```

---

## Task 6: Tag UI — Pills on Cards + Filter Bar

**Files:**
- Modify: `ai-assistant/app/app/board-client.tsx`

### Context
`SortableCard` receives an `InboxItem` as a prop. We render tag pills below the type/lane badges. The `activeTagFilter` state lives in `AppBoard` and is passed down as a prop. The filter bar section already exists (lines ~480–510 in board-client.tsx); we add a tag sub-section below it.

- [ ] **Step 1: Add `activeTagFilter` state to AppBoard**

In `AppBoard`, after the existing `activeFilter` state line, add:
```typescript
const [activeTagFilter, setActiveTagFilter] = useState<string | null>(null);
```

- [ ] **Step 2: Thread `activeTagFilter` through board filtering**

In the `boardItems` useMemo (the one that filters by `activeFilter`), add tag filtering at the end:
```typescript
const boardItems = useMemo(() => {
  let base = items.filter((item) => !isTrash(item));
  if (activeFilter === "all") { /* no status filter */ }
  else if (activeFilter === "active" || activeFilter === "completed" || activeFilter === "archived") {
    base = base.filter((item) => item.status === activeFilter);
  } else if (activeFilter === "todo" || activeFilter === "note" || activeFilter === "link") {
    base = base.filter((item) => item.type === activeFilter);
  } else if (activeFilter === "trash") {
    return [];
  }
  // Tag filter
  if (activeTagFilter) {
    base = base.filter((item) => (item.tags ?? []).includes(activeTagFilter));
  }
  return base;
}, [items, activeFilter, activeTagFilter]);
```

- [ ] **Step 3: Add tag pills to SortableCard**

In `SortableCard`, after the existing type/lane badge area and before the action buttons, add:
```tsx
{/* Tag pills */}
{(item.tags ?? []).length > 0 && (
  <div className="mt-1 flex flex-wrap gap-1">
    {(item.tags ?? []).slice(0, 3).map((tag) => (
      <button
        key={tag}
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onTagClick?.(tag);
        }}
        className="rounded border border-[var(--border)] bg-[var(--bg-muted)] px-1.5 py-0.5 text-[10px] text-[var(--text-muted)] hover:border-[var(--accent)] active:scale-95 transition-transform duration-75"
      >
        #{tag}
      </button>
    ))}
    {(item.tags ?? []).length > 3 && (
      <span className="text-[10px] text-[var(--text-muted)]">+{(item.tags ?? []).length - 3} more</span>
    )}
  </div>
)}
```

Add `onTagClick?: (tag: string) => void` to `SortableCard`'s props type.

Pass `onTagClick={setActiveTagFilter}` from `LaneColumn` → `SortableCard`. Add `onTagClick` prop to `LaneColumn` and wire it through.

- [ ] **Step 4: Add tag filter bar below the quick filters section**

In the quick filters `<div>` section, add below the existing filter pills:
```tsx
{/* Tag filter bar */}
{(() => {
  const visibleItemsWithoutTagFilter = items.filter((item) => {
    if (isTrash(item)) return false;
    if (activeFilter === "all") return true;
    if (activeFilter === "active" || activeFilter === "completed" || activeFilter === "archived") return item.status === activeFilter;
    if (activeFilter === "todo" || activeFilter === "note" || activeFilter === "link") return item.type === activeFilter;
    return false;
  });
  const allTags = Array.from(
    new Set(visibleItemsWithoutTagFilter.flatMap((item) => item.tags ?? []))
  ).sort();
  if (allTags.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-[var(--border)] pt-2">
      <span className="text-[10px] uppercase tracking-widest text-[var(--text-muted)]">Tags</span>
      {allTags.map((tag) => (
        <button
          key={tag}
          type="button"
          onClick={() => setActiveTagFilter((prev) => (prev === tag ? null : tag))}
          className={`rounded-md border px-2 py-1 text-xs active:scale-95 transition-transform duration-75 ${
            activeTagFilter === tag
              ? "border-[var(--accent)] bg-[color-mix(in_oklab,var(--accent)_14%,transparent)]"
              : "border-[var(--border)] bg-[var(--bg-muted)] hover:border-[var(--accent)]"
          }`}
        >
          #{tag}
        </button>
      ))}
      {activeTagFilter && (
        <button
          type="button"
          onClick={() => setActiveTagFilter(null)}
          className="rounded-md border border-rose-300/40 px-2 py-1 text-xs text-rose-300 hover:border-rose-300 active:scale-95 transition-transform duration-75"
        >
          Clear tag
        </button>
      )}
    </div>
  );
})()}
```

- [ ] **Step 5: TypeScript check**

```bash
npx tsc --noEmit
```
Working directory: `/workspace/ai-assistant`
Expected: 0 errors.

- [ ] **Step 6: Run tests**

```bash
npm test
```
Working directory: `/workspace/ai-assistant`
Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add app/app/board-client.tsx
git commit -m "feat: add tag pills on cards and tag filter bar"
```

---

## Task 7: Tag UI — DetailPanel Tag Input + AI Ghost Pills

**Files:**
- Modify: `ai-assistant/app/app/board-client.tsx`

### Context
The DetailPanel is rendered inline in `AppBoard` as a conditional block when `selectedItem !== null`. It contains a `<form action={updateItemDetails}>` with hidden fields. We add a tag input section + hidden `tags` field to this form, and a separate React-driven ghost pills area for AI suggestions.

- [ ] **Step 1: Add tag editing state to AppBoard**

In `AppBoard`, add:
```typescript
const [editingTags, setEditingTags] = useState<string[]>([]);
const [tagInput, setTagInput] = useState("");
const [suggestedTags, setSuggestedTags] = useState<string[]>([]);
const [tagsCache, setTagsCache] = useState<Record<string, { content: string; tags: string[] }>>({});
```

- [ ] **Step 2: Sync `editingTags` when DetailPanel opens**

In the `useEffect` that runs when `selectedItemId` changes (the one that calls `loadRelated`), also sync tags:
```typescript
useEffect(() => {
  if (!selectedItem) {
    setRelatedResults([]);
    setEditingTags([]);
    setSuggestedTags([]);
    return;
  }
  void loadRelated(selectedItem);
  setEditingTags(selectedItem.tags ?? []);
  setTagInput("");

  const cached = tagsCache[selectedItem.id];
  if (cached && cached.content === selectedItem.content) {
    setSuggestedTags(cached.tags.filter((t) => !(selectedItem.tags ?? []).includes(t)));
    return;
  }

  setSuggestedTags([]);
  void (async () => {
    try {
      const res = await fetch("/api/suggest-tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: selectedItem.content,
          title: selectedItem.title ?? undefined,
          type: selectedItem.type,
        }),
      });
      const data = (await res.json()) as { tags?: string[] };
      const fetched = (data.tags ?? []).filter(Boolean);
      setTagsCache((prev) => ({
        ...prev,
        [selectedItem.id]: { content: selectedItem.content, tags: fetched },
      }));
      setSuggestedTags(fetched.filter((t) => !(selectedItem.tags ?? []).includes(t)));
    } catch {
      setSuggestedTags([]);
    }
  })();
}, [selectedItem, tagsCache]);
```

- [ ] **Step 3: Add tag input + pills section inside the DetailPanel form**

In the DetailPanel form (after the type/lane selects, before the Save changes button), add:
```tsx
{/* Tags section */}
<div>
  <label className="text-xs text-[var(--text-muted)]">Tags</label>
  <div className="mt-1 flex flex-wrap gap-1 rounded-md border border-[var(--border)] bg-[var(--bg-muted)] p-2 min-h-[36px]">
    {editingTags.map((tag) => (
      <span key={tag} className="flex items-center gap-1 rounded border border-[var(--border)] bg-[var(--bg)] px-1.5 py-0.5 text-[11px]">
        #{tag}
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => setEditingTags((prev) => prev.filter((t) => t !== tag))}
          className="ml-0.5 text-[var(--text-muted)] hover:text-rose-300 active:scale-95 transition-transform duration-75"
          aria-label={`Remove tag ${tag}`}
        >
          ×
        </button>
      </span>
    ))}
    <input
      type="text"
      value={tagInput}
      onChange={(e) => setTagInput(e.target.value)}
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === ",") && tagInput.trim()) {
          e.preventDefault();
          const newTag = tagInput.trim().toLowerCase().replace(/\s+/g, "-").replace(/,/g, "");
          if (newTag && !editingTags.includes(newTag)) {
            setEditingTags((prev) => [...prev, newTag]);
          }
          setTagInput("");
        }
      }}
      placeholder={editingTags.length === 0 ? "Add tag, press Enter…" : ""}
      className="min-w-[120px] flex-1 bg-transparent text-[11px] outline-none placeholder:text-[var(--text-muted)]"
    />
  </div>
  {/* AI ghost suggestions */}
  {suggestedTags.filter((t) => !editingTags.includes(t)).length > 0 && (
    <div className="mt-1 flex flex-wrap gap-1">
      <span className="text-[10px] text-[var(--text-muted)]">AI suggests:</span>
      {suggestedTags
        .filter((t) => !editingTags.includes(t))
        .map((tag) => (
          <button
            key={tag}
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => {
              setEditingTags((prev) => [...prev, tag]);
              setSuggestedTags((prev) => prev.filter((t) => t !== tag));
            }}
            className="rounded border border-dashed border-[var(--accent)]/50 px-1.5 py-0.5 text-[10px] text-[var(--accent)] hover:border-[var(--accent)] active:scale-95 transition-transform duration-75"
          >
            + {tag}
          </button>
        ))}
    </div>
  )}
  {/* Hidden field for form submission */}
  <input type="hidden" name="tags" value={JSON.stringify(editingTags)} />
</div>
```

- [ ] **Step 4: TypeScript check**

```bash
npx tsc --noEmit
```
Working directory: `/workspace/ai-assistant`
Expected: 0 errors.

- [ ] **Step 5: Run tests**

```bash
npm test
```
Working directory: `/workspace/ai-assistant`
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add app/app/board-client.tsx
git commit -m "feat: add tag input and AI ghost pill suggestions to DetailPanel"
```

---

## Task 8: Bulk Actions — Selection + Floating Action Bar

**Files:**
- Modify: `ai-assistant/app/app/board-client.tsx`
- Modify: `ai-assistant/app/app/actions.ts`

### Context
We add `selectedIds: Set<string>` state to `AppBoard`. Each `SortableCard` gets a checkbox. A new `BulkActionBar` component floats at the bottom of the viewport. Bulk operations call existing server actions in parallel via `Promise.all`, plus a new `bulkUpdateItems` helper for batch status/lane changes.

- [ ] **Step 1: Add `bulkUpdateItems` server action**

In `actions.ts`, add at the bottom (before `signOut`):
```typescript
export async function bulkUpdateItems(
  itemIds: string[],
  changes: {
    status?: "active" | "completed" | "archived";
    type?: "note" | "todo" | "link";
    priority_score?: number;
    tags?: string[];
    metadata_patch?: Record<string, unknown>;
  }
) {
  await requireHardcodedSession();
  if (!itemIds.length) return;

  const supabase = createAdminClient();
  const userId = await resolveSessionUserId();

  // For each item, apply changes individually so metadata merges correctly
  await Promise.all(
    itemIds.map(async (id) => {
      const payload: Record<string, unknown> = {};
      if (changes.status !== undefined) payload.status = changes.status;
      if (changes.type !== undefined) payload.type = changes.type;
      if (changes.priority_score !== undefined) payload.priority_score = changes.priority_score;
      if (changes.tags !== undefined) {
        // Merge tags: fetch existing then union
        const { data: existing } = await supabase
          .from("items")
          .select("tags, metadata")
          .eq("id", id)
          .eq("user_id", userId)
          .single();
        const existingTags: string[] = (existing?.tags as string[]) ?? [];
        payload.tags = Array.from(new Set([...existingTags, ...(changes.tags ?? [])]));
        if (changes.metadata_patch) {
          payload.metadata = { ...asMetadata(existing?.metadata), ...changes.metadata_patch };
        }
      } else if (changes.metadata_patch) {
        const { data: existing } = await supabase
          .from("items")
          .select("metadata")
          .eq("id", id)
          .eq("user_id", userId)
          .single();
        payload.metadata = { ...asMetadata(existing?.metadata), ...changes.metadata_patch };
      }
      if (Object.keys(payload).length === 0) return;
      await supabase.from("items").update(payload).eq("id", id).eq("user_id", userId);
    })
  );

  revalidatePath("/app");
  revalidatePath("/widget");
}
```

- [ ] **Step 2: Add `selectedIds` state to AppBoard**

In `AppBoard`, after the `activeTagFilter` state line, add:
```typescript
const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
const [bulkTagInput, setBulkTagInput] = useState("");
const [showBulkTagPopover, setShowBulkTagPopover] = useState(false);
const [showBulkLanePicker, setShowBulkLanePicker] = useState(false);
const [showBulkAIMenu, setShowBulkAIMenu] = useState(false);

function toggleSelect(id: string) {
  setSelectedIds((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
}
function clearSelection() {
  setSelectedIds(new Set());
  setShowBulkTagPopover(false);
  setShowBulkLanePicker(false);
  setShowBulkAIMenu(false);
}
```

- [ ] **Step 3: Add checkbox to SortableCard**

Pass `selectedIds` and `onToggleSelect` down through `LaneColumn` → `SortableCard`.

In `SortableCard`'s props type, add:
```typescript
isSelected?: boolean;
onToggleSelect?: (id: string) => void;
```

In `SortableCard`, in the top-left of the card `<li>`, add:
```tsx
{/* Selection checkbox */}
{onToggleSelect && (
  <div
    className="absolute left-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity duration-100"
    onPointerDown={(e) => e.stopPropagation()}
  >
    <input
      type="checkbox"
      checked={isSelected ?? false}
      onChange={() => onToggleSelect(item.id)}
      className="h-3.5 w-3.5 cursor-pointer accent-[var(--accent)]"
      aria-label={`Select ${item.title ?? item.content.slice(0, 30)}`}
    />
  </div>
)}
```

Add `group` to the `<li>` className so the `group-hover` works.

Also add a lane-level checkbox in `LaneColumn` header **plus** a global "Select all visible" control near the quick filters. The global control is the spec-required one; the lane checkbox is optional convenience.
```tsx
{/* Global select-all-visible control in AppBoard, near quick filters */}
<button
  type="button"
  onClick={() => {
    const visibleIds = boardItems.map((item) => item.id);
    const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
    setSelectedIds(allVisibleSelected ? new Set() : new Set(visibleIds));
  }}
  className="rounded-md border border-[var(--border)] bg-[var(--bg-muted)] px-2 py-1 text-xs hover:border-[var(--accent)] active:scale-95 transition-transform duration-75"
>
  {boardItems.length > 0 && boardItems.every((item) => selectedIds.has(item.id)) ? "Deselect visible" : "Select all visible"}
</button>

{/* Optional lane-level checkbox in LaneColumn header */}
{onToggleSelect && (
  <input
    type="checkbox"
    checked={items.length > 0 && items.every((item) => selectedIds?.has(item.id))}
    onChange={() => {
      const allSelected = items.every((item) => selectedIds?.has(item.id));
      items.forEach((item) => {
        if (allSelected) {
          // deselect all in this lane
          if (selectedIds?.has(item.id)) onToggleSelect(item.id);
        } else {
          // select all in this lane
          if (!selectedIds?.has(item.id)) onToggleSelect(item.id);
        }
      });
    }}
    className="h-3.5 w-3.5 cursor-pointer accent-[var(--accent)]"
    aria-label={`Select all in ${lane}`}
  />
)}
```

- [ ] **Step 4: Create BulkActionBar component**

Add the following component to `board-client.tsx` (outside AppBoard, near other component definitions):
```tsx
function BulkActionBar({
  count,
  onArchive,
  onTrash,
  onClearSelection,
  bulkTagInput,
  setBulkTagInput,
  showBulkTagPopover,
  setShowBulkTagPopover,
  showBulkLanePicker,
  setShowBulkLanePicker,
  onMoveLane,
  showBulkAIMenu,
  setShowBulkAIMenu,
  onBulkAI,
}: {
  count: number;
  onArchive: () => void;
  onTrash: () => void;
  onClearSelection: () => void;
  bulkTagInput: string;
  setBulkTagInput: (v: string) => void;
  showBulkTagPopover: boolean;
  setShowBulkTagPopover: (v: boolean) => void;
  showBulkLanePicker: boolean;
  setShowBulkLanePicker: (v: boolean) => void;
  onMoveLane: (lane: LaneKey) => void;
  showBulkAIMenu: boolean;
  setShowBulkAIMenu: (v: boolean) => void;
  onBulkAI: (action: "reclassify" | "suggest-tags") => void;
}) {
  if (count === 0) return null;
  return (
    <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 animate-in slide-in-from-bottom-4 duration-200">
      <div className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-3 shadow-2xl">
        <span className="mr-2 rounded-md bg-[var(--accent)] px-2 py-0.5 text-xs font-bold text-black">
          {count} selected
        </span>

        <button
          type="button"
          onClick={onArchive}
          className="rounded-md border border-[var(--border)] bg-[var(--bg-muted)] px-3 py-1.5 text-xs hover:border-green-300/50 active:scale-95 active:bg-green-700 dark:active:bg-green-800 transition-transform duration-75"
        >
          Archive all
        </button>

        <button
          type="button"
          onClick={onTrash}
          className="rounded-md border border-[var(--border)] bg-[var(--bg-muted)] px-3 py-1.5 text-xs hover:border-rose-300/50 active:scale-95 active:bg-red-700 dark:active:bg-red-800 transition-transform duration-75"
        >
          Trash all
        </button>

        {/* Retag popover */}
        <div className="relative">
          <button
            type="button"
            onClick={() => { setShowBulkTagPopover(!showBulkTagPopover); setShowBulkLanePicker(false); setShowBulkAIMenu(false); }}
            className="rounded-md border border-[var(--border)] bg-[var(--bg-muted)] px-3 py-1.5 text-xs hover:border-[var(--accent)] active:scale-95 transition-transform duration-75"
          >
            Retag
          </button>
          {showBulkTagPopover && (
            <div className="absolute bottom-10 left-0 z-10 flex gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-3 shadow-xl">
              <input
                type="text"
                value={bulkTagInput}
                onChange={(e) => setBulkTagInput(e.target.value)}
                placeholder="tag name, Enter to apply"
                className="rounded border border-[var(--border)] bg-[var(--bg-muted)] px-2 py-1 text-xs w-44 outline-none focus:border-[var(--accent)]"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && bulkTagInput.trim()) {
                    e.preventDefault();
                    // Parent handles the actual action via onBulkAI flow
                    // Emit as a custom event so AppBoard can handle it
                    const evt = new CustomEvent("bulk-retag", { detail: bulkTagInput.trim().toLowerCase() });
                    window.dispatchEvent(evt);
                    setBulkTagInput("");
                    setShowBulkTagPopover(false);
                  }
                }}
                autoFocus
              />
            </div>
          )}
        </div>

        {/* Move to lane */}
        <div className="relative">
          <button
            type="button"
            onClick={() => { setShowBulkLanePicker(!showBulkLanePicker); setShowBulkTagPopover(false); setShowBulkAIMenu(false); }}
            className="rounded-md border border-[var(--border)] bg-[var(--bg-muted)] px-3 py-1.5 text-xs hover:border-[var(--accent)] active:scale-95 transition-transform duration-75"
          >
            Move to lane
          </button>
          {showBulkLanePicker && (
            <div className="absolute bottom-10 left-0 z-10 flex flex-col gap-1 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-2 shadow-xl">
              {(["today", "next", "backlog"] as LaneKey[]).map((lane) => (
                <button
                  key={lane}
                  type="button"
                  onClick={() => { onMoveLane(lane); setShowBulkLanePicker(false); }}
                  className="rounded px-3 py-1.5 text-xs text-left hover:bg-[var(--bg-muted)] active:scale-95 transition-transform duration-75"
                >
                  {laneLabel(lane)}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Bulk AI */}
        <div className="relative">
          <button
            type="button"
            onClick={() => { setShowBulkAIMenu(!showBulkAIMenu); setShowBulkTagPopover(false); setShowBulkLanePicker(false); }}
            className="rounded-md border border-[var(--border)] bg-[var(--bg-muted)] px-3 py-1.5 text-xs hover:border-[var(--accent)] active:scale-95 transition-transform duration-75"
          >
            Bulk AI ▾
          </button>
          {showBulkAIMenu && (
            <div className="absolute bottom-10 left-0 z-10 flex flex-col gap-1 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-2 shadow-xl">
              <button
                type="button"
                onClick={() => { onBulkAI("reclassify"); setShowBulkAIMenu(false); }}
                className="rounded px-3 py-1.5 text-xs text-left hover:bg-[var(--bg-muted)] active:scale-95 transition-transform duration-75"
              >
                Re-classify all
              </button>
              <button
                type="button"
                onClick={() => { onBulkAI("suggest-tags"); setShowBulkAIMenu(false); }}
                className="rounded px-3 py-1.5 text-xs text-left hover:bg-[var(--bg-muted)] active:scale-95 transition-transform duration-75"
              >
                Suggest tags for all
              </button>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={onClearSelection}
          className="ml-2 rounded-md border border-[var(--border)] bg-[var(--bg-muted)] px-2 py-1.5 text-xs hover:border-rose-300/50 active:scale-95 transition-transform duration-75"
          aria-label="Deselect all"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Wire BulkActionBar handlers in AppBoard**

In `AppBoard`, add bulk operation handlers and render `BulkActionBar`. Add handlers after the `clearSelection` function:

```typescript
async function handleBulkArchive() {
  const ids = Array.from(selectedIds);
  clearSelection();
  await bulkUpdateItems(ids, { status: "completed" });
  router.refresh();
}

async function handleBulkTrash() {
  const ids = Array.from(selectedIds);
  const now = new Date().toISOString();
  clearSelection();
  await bulkUpdateItems(ids, { metadata_patch: { deleted_at: now, dismissed: true } });
  router.refresh();
}

async function handleBulkMoveLane(lane: LaneKey) {
  const ids = Array.from(selectedIds);
  const score = lane === "today" ? 0.85 : lane === "next" ? 0.7 : 0.4;
  setItems((prev) => prev.map((item) =>
    ids.includes(item.id) ? { ...item, priority_score: score, status: "active" as const } : item
  ));
  clearSelection();
  await bulkUpdateItems(ids, { status: "active", priority_score: score });
  router.refresh();
}

async function handleBulkAI(action: "reclassify" | "suggest-tags") {
  const ids = Array.from(selectedIds);
  const targetItems = items.filter((item) => ids.includes(item.id));
  if (action === "reclassify") {
    clearSelection();
    await Promise.all(
      targetItems.map(async (item) => {
        const res = await fetch("/api/classify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: item.content }),
        });
        const data = (await res.json()) as { classification?: { type?: string; priority_score?: number } };
        if (data.classification) {
          const type = data.classification.type as "note" | "todo" | "link" | undefined;
          const score = data.classification.priority_score;
          if (type || score !== undefined) {
            await bulkUpdateItems([item.id], {
              ...(type ? { type } : {}),
              ...(score !== undefined ? { priority_score: score } : {}),
            });
          }
        }
      })
    );
    router.refresh();
  } else {
    const results = await Promise.all(
      targetItems.map(async (item) => {
        const res = await fetch("/api/suggest-tags", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: item.content, title: item.title ?? undefined, type: item.type }),
        });
        const data = (await res.json()) as { tags?: string[] };
        return { id: item.id, title: item.title ?? item.content.slice(0, 32), tags: data.tags ?? [] };
      })
    );
    const nonEmpty = results.filter((r) => r.tags.length > 0);
    if (nonEmpty.length === 0) {
      clearSelection();
      return;
    }
    const confirmed = window.confirm(
      `Apply suggested tags to ${nonEmpty.length} items?

` +
      nonEmpty.map((r) => `• ${r.title}: ${r.tags.join(", ")}`).join("
")
    );
    if (!confirmed) return;
    clearSelection();
    await Promise.all(nonEmpty.map((r) => bulkUpdateItems([r.id], { tags: r.tags })));
    router.refresh();
  }
}
```

Listen for the `bulk-retag` custom event (fired by BulkActionBar):
```typescript
useEffect(() => {
  const handler = (e: Event) => {
    const tag = (e as CustomEvent<string>).detail;
    if (!tag) return;
    void bulkUpdateItems(Array.from(selectedIds), { tags: [tag] }).then(() => {
      clearSelection();
    });
  };
  window.addEventListener("bulk-retag", handler);
  return () => window.removeEventListener("bulk-retag", handler);
}, [selectedIds]);
```

Render `BulkActionBar` at the bottom of the AppBoard `<main>` return, after the `<DndContext>` closing tag:
```tsx
<BulkActionBar
  count={selectedIds.size}
  onArchive={() => void handleBulkArchive()}
  onTrash={() => void handleBulkTrash()}
  onClearSelection={clearSelection}
  bulkTagInput={bulkTagInput}
  setBulkTagInput={setBulkTagInput}
  showBulkTagPopover={showBulkTagPopover}
  setShowBulkTagPopover={setShowBulkTagPopover}
  showBulkLanePicker={showBulkLanePicker}
  setShowBulkLanePicker={setShowBulkLanePicker}
  onMoveLane={(lane) => void handleBulkMoveLane(lane)}
  showBulkAIMenu={showBulkAIMenu}
  setShowBulkAIMenu={setShowBulkAIMenu}
  onBulkAI={(action) => void handleBulkAI(action)}
/>
```

- [ ] **Step 6: Add `bulkUpdateItems` import to board-client.tsx**

At the top of `board-client.tsx`, add `bulkUpdateItems` to the imports from `./actions`:
```typescript
import {
  // ... existing imports ...
  bulkUpdateItems,
} from "./actions";
```

- [ ] **Step 7: TypeScript check**

```bash
npx tsc --noEmit
```
Working directory: `/workspace/ai-assistant`
Expected: 0 errors.

- [ ] **Step 8: Run tests**

```bash
npm test
```
Working directory: `/workspace/ai-assistant`
Expected: all tests pass.

- [ ] **Step 9: Commit**

```bash
git add app/app/board-client.tsx app/app/actions.ts
git commit -m "feat: add bulk selection and floating action bar"
```

---

## Task 9: Final Integration Check

### Required supporting edit
At the top of `AppBoard`, import Next navigation refresh support and create a router instance so bulk actions can refresh from server truth:
```typescript
import { useRouter } from "next/navigation";

const router = useRouter();
```

- [ ] **Step 1: Full TypeScript check**

```bash
npx tsc --noEmit
```
Working directory: `/workspace/ai-assistant`
Expected: 0 errors.

- [ ] **Step 2: Full test run**

```bash
npm test
```
Working directory: `/workspace/ai-assistant`
Expected: all tests pass (≥6 tests: 4 existing + tags type test + suggest-tags route existence test).

- [ ] **Step 3: Build check**

```bash
npm run build
```
Working directory: `/workspace/ai-assistant`
Expected: build completes without errors (timeout ok in sandbox, just verify no hard errors).

---

## Success Criteria Checklist

- [ ] Every button shows a visible press effect when clicked (scale + color)
- [ ] Items can be tagged from the DetailPanel with free-text input
- [ ] AI suggests 1–3 tags when opening an item's detail panel
- [ ] Tag pills appear on cards; clicking a tag pill filters the board
- [ ] Selecting multiple cards shows the floating BulkActionBar
- [ ] Bulk archive, trash, retag, move lane, and AI actions all work
- [ ] `npm test` passes with ≥6 tests
- [ ] `npx tsc --noEmit` returns 0 errors
- [ ] App builds cleanly and is ready for deployment in a follow-up execution session

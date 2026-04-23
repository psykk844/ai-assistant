# Phase 1 Design Spec: Button Feedback + Tags + Bulk Actions
Date: 2026-04-22

## Overview
Three foundational improvements to the AI assistant inbox app. These are prerequisites for all later phases (scheduling, automations, search). No new infrastructure required — builds on existing Supabase, OARS/Claude, and Next.js server actions.

---

## 1. Button Visual Feedback

### Goal
Every button in the app gives immediate tactile/visual confirmation when pressed, so users never wonder if their click registered.

### Approach
Pure CSS via Tailwind utility classes. No JS state changes needed. Applied globally via a shared button utility class.

### Spec
- All buttons receive: `active:scale-95 active:brightness-90 transition-transform duration-75`
- **Destructive buttons** (Move to trash, Delete, Bulk trash): additionally `active:bg-red-700 dark:active:bg-red-800`
- **Primary/success buttons** (Complete, Save changes, Mark reviewed): additionally `active:bg-green-700 dark:active:bg-green-800`
- **Secondary/neutral buttons** (lane moves, type changes, ghost actions): additionally `active:bg-slate-200 dark:active:bg-slate-700`
- **Scope**: SortableCard action buttons, DetailPanel buttons (Save changes, Complete, Move to trash), Review sidebar "Mark reviewed" button, bulk action bar buttons (added in Section 3)
- **No regressions**: existing hover states (`hover:bg-*`) are preserved; `active:` is additive

### Files affected
- `ai-assistant/app/app/board-client.tsx` — all button className strings

---

## 2. Tags / Labels / Richer Metadata Filtering

### Goal
Users can tag any item with free-text labels. Tags appear on cards and in the detail panel. Clicking a tag filters the board. AI suggests relevant tags based on item content.

### Data Model
```sql
-- Migration: add tags column to inbox_items
ALTER TABLE inbox_items ADD COLUMN tags text[] NOT NULL DEFAULT '{}';
CREATE INDEX idx_inbox_items_tags ON inbox_items USING gin(tags);
```
- Tags are lowercase, trimmed strings stored as a Postgres array
- Existing items default to empty array — no migration data needed
- `ItemMetadata` type extended: no change needed (tags live as first-class column, not in metadata JSONB)

### TypeScript type update
```typescript
// lib/items/types.ts
InboxItem {
  ...existing fields...
  tags: string[]   // added
}
```

### UI — Cards
- Tag pills displayed below the type badge on each `SortableCard`
- Each pill: small, rounded, muted background. Clicking the pill sets `activeTagFilter` state, filtering the board to only items with that tag
- Max 3 pills shown on card; "+ N more" overflow label if more exist

### UI — DetailPanel
- New "Tags" section below the content/type fields
- Tag input: type a tag name + Enter (or comma) to add; click × on existing pill to remove
- On panel open: fetch suggested tags via `POST /api/suggest-tags` with item content
- Suggested tags appear as ghost pills with a `+` prefix below the input ("+ productivity", "+ project-x")
- Clicking a ghost pill accepts it and adds to item's tags
- Tags are saved when the detail panel "Save changes" button is clicked (part of the existing `updateItemDetails` server action payload)

### UI — Filter bar
- New tag filter section below the existing quick-filter pills
- Shows all unique tags across current visible items as pill buttons
- Clicking a tag pill toggles `activeTagFilter`; active tag pill is highlighted
- "Clear" button resets `activeTagFilter`

### API — `/api/suggest-tags`
```
POST /api/suggest-tags
Body: { content: string, title?: string, type?: string }
Response: { tags: string[] }  // 1–3 suggested tags
```
- Uses existing OARS/Claude integration
- Prompt: "Given this item, suggest 1-3 short, lowercase tag labels. Return only a JSON array of strings."
- Result is cached per item id in local React state (re-fetched only when content changes in the panel)
- Graceful fallback: if API fails, show no ghost pills (non-blocking)

### Server action update
- `updateItemDetails` receives `tags: string[]` and includes it in the Supabase UPDATE
- `loadItems` SELECT includes `tags` column

### Files affected
- `ai-assistant/app/app/board-client.tsx` — tag pills on cards, tag input in DetailPanel, tag filter bar
- `ai-assistant/app/app/actions.ts` — updateItemDetails + loadItems updated for tags
- `ai-assistant/lib/items/types.ts` — InboxItem type
- `ai-assistant/app/api/suggest-tags/route.ts` — new API route
- Supabase migration SQL (run once)

---

## 3. Bulk Actions (Multi-select, Batch Operations)

### Goal
Users can select multiple items at once and perform operations on all of them simultaneously.

### UI — Selection
- Each `SortableCard` gets a checkbox in the top-left corner, visible on hover (or always on mobile)
- Checkbox uses `<input type="checkbox">` with `stopPropagation` so it doesn't trigger card drag
- `selectedIds: Set<string>` state lives in `AppBoard`
- "Select all visible" checkbox in the column header area

### UI — Bulk Action Bar
- Floating bar slides up from the bottom of the viewport when `selectedIds.size > 0`
- Slides back down when selection is cleared
- Contains:
  - Count badge: "3 selected"
  - **Archive all** — sets `status: completed` for all selected
  - **Trash all** — sets `metadata.deleted_at` + `metadata.dismissed: true` for all selected
  - **Retag** — opens inline popover: tag input, applies tags to all selected (merges, does not replace)
  - **Move to lane** — Today / Next / Backlog — adjusts `priority_score` to match lane threshold
  - **Bulk AI** — dropdown with: "Re-classify all", "Suggest tags for all"
  - **Deselect all** (× button)

### Implementation
- All bulk operations use `Promise.all(selectedIds.map(id => updateItem(id, changes)))` via existing server actions
- Bulk AI (re-classify): calls `/api/classify` in parallel for each item, then batch-updates results
- Bulk AI (suggest tags): calls `/api/suggest-tags` in parallel, merges suggestions into existing tags, opens a confirm dialog before saving
- After any bulk operation: `selectedIds` is cleared, board reloads

### State management
```typescript
const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
const toggleSelect = (id: string) => setSelectedIds(prev => ...)
const clearSelection = () => setSelectedIds(new Set())
```

### Files affected
- `ai-assistant/app/app/board-client.tsx` — checkbox on cards, BulkActionBar component, selectedIds state

---

## Architecture Notes
- All three features are independent and can be implemented in sequence without breaking each other
- Tags must be built before Bulk Retag (bulk actions depends on tags existing)
- Button feedback is fully independent and should be done first (lowest risk, highest visual value)
- No new infrastructure required (no new Supabase tables beyond the tags column migration)

## Success Criteria
1. Every button shows a visible press effect on click
2. Items can be tagged; tags appear on cards and filter the board
3. AI suggests 1–3 tags when opening any item's detail panel
4. Selecting multiple items shows the bulk action bar; all 5 bulk operations work correctly
5. `npm test` passes; `npx tsc --noEmit` passes

## Out of Scope (Phase 2+)
- Due dates / reminders / recurring items
- Automations / routing rules
- Advanced search / saved views
- Inbox-zero workflows
- Relationship mapping

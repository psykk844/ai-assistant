# Mobile Item Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add reliable mobile item editing for text, lane, status, priority, and tags.

**Architecture:** Extend the existing mobile item detail API with `PATCH /api/mobile/items/[id]`, returning the same item preview shape used by detail. Add edit mode to `mobile/app/item/[id].tsx` and a client helper in `mobile/lib/api.ts`.

**Tech Stack:** Next.js 14 API route, Expo Router web, React Native Web, Vitest, Playwright smoke.

---

### Task 1: Backend PATCH Contract

**Files:**
- Modify: `app/api/mobile/items/[id]/route.ts`
- Test: `tests/mobile-item-detail-route.test.ts`

- [ ] Add a failing test that PATCH updates title/content/lane/status/priority/tags without selecting or writing `items.tags`.
- [ ] Implement PATCH validation and Supabase update.
- [ ] Return the normalized mobile item response.

**Verification:**
- `npx vitest run tests/mobile-item-detail-route.test.ts` passes.

### Task 2: Mobile Client Helper

**Files:**
- Modify: `mobile/lib/api.ts`
- Modify: `mobile/lib/types.ts`

- [ ] Add a `MobileItemUpdateInput` type.
- [ ] Add `updateMobileItem(itemId, input)` that calls PATCH in backend mode and updates mock items in mock mode.

**Verification:**
- `npm run typecheck` in `mobile` passes.

### Task 3: Detail Edit UI

**Files:**
- Modify: `mobile/app/item/[id].tsx`

- [ ] Add read/edit mode state.
- [ ] Render fields for title, content, lane, status, priority, tags.
- [ ] Save via `updateMobileItem`, show validation/error state, update local item.
- [ ] Cancel restores read mode without changing item state.

**Verification:**
- `npm run typecheck` in `mobile` passes.
- Expo web export succeeds.

### Task 4: Deployment and Smoke

**Files:**
- Modify: `.opencode-smoke/mobile-full-smoke.spec.js`
- Update: `README_FIRST.md`, `HANDOFF.md`, `progress.md`

- [ ] Extend deployed smoke to edit an item and verify saved text appears.
- [ ] Run local full tests/build/typecheck/export.
- [ ] Commit/push source changes and deploy backend + mobile Coolify apps.
- [ ] Run deployed smoke and independent QA.

**Verification:**
- API PATCH returns 200 and updated item.
- Browser smoke opens item detail, edits, saves, and sees the new value.

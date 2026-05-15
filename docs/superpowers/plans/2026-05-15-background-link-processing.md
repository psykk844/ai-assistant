# Background Link Processing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Process standalone URL-only items shortly after they are added, without making the add-item request wait for Apify/OARS.

**Architecture:** Add a small helper that inspects newly inserted item rows, detects standalone URL-only content, and schedules `processLinkBatch({ limit })` via fire-and-forget `setTimeout`. Call it from web inbox server actions and mobile quick-add route after successful inserts. Keep the existing protected job route and future cron as fallback.

**Tech Stack:** Next.js server actions/routes, existing Supabase admin client, existing `processLinkBatch`, Vitest.

---

### Task 1: Trigger Helper

**Files:**
- Create: `lib/link-processing/background.ts`
- Test: `tests/link-processing-background.test.ts`

- [ ] Write failing tests for: standalone URL rows schedule one delayed batch; embedded text-plus-link rows do not schedule; multiple standalone rows schedule one batch with a bounded limit.
- [ ] Implement `scheduleLinkProcessingForInsertedItems(items)` using `extractStandaloneUrl` and `setTimeout(() => processLinkBatch({ limit }), 0)`.
- [ ] Catch/log background errors so add-item requests are not affected.

### Task 2: Wire Creation Paths

**Files:**
- Modify: `app/app/actions.ts`
- Modify: `app/api/mobile/items/route.ts`
- Tests: existing action/route tests where practical.

- [ ] Call `scheduleLinkProcessingForInsertedItems(inserted)` after web inbox insert succeeds.
- [ ] Call `scheduleLinkProcessingForInsertedItems([data])` after mobile quick-add insert succeeds.
- [ ] Do not await background processing before returning the created item response.

### Task 3: OARS Retry Safety

**Files:**
- Modify: `lib/link-processing/summarize.ts`
- Modify: `lib/link-processing/process-batch.ts`
- Tests: `tests/link-processing-summarize.test.ts`, `tests/link-processing-batch.test.ts`

- [ ] Keep the already-written retryable OARS outage behavior: transient HTTP statuses and summary timeouts are retryable.
- [ ] Ensure retryable summary errors keep the item instead of writing failure notes/deleting.

### Task 4: Verification and Deploy

- [ ] Run `npm test`, `npx tsc --noEmit --incremental false`, `npm run lint`, `npm run build`.
- [ ] Commit and push to GitHub `main`.
- [ ] Deploy backend in Coolify and verify running image.
- [ ] Add a test standalone URL item via production mobile/web API, wait briefly, and verify it is archived/deleted automatically without manually calling the job route.

## Self-Review

- Scope is focused: background trigger only, not bulk upload UI yet.
- Existing batch processor remains the single processing implementation.
- Retryable OARS outages are included because automatic processing must not delete links while Quartarly is down.

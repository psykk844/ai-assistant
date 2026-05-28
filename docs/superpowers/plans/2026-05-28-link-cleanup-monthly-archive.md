# Link Cleanup Monthly Archive Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop active link mirror clutter, keep mixed text-plus-link app items in the app, and process standalone URL-only items into monthly Obsidian archive folders.

**Architecture:** Keep automated processing in `lib/link-processing/process-batch.ts` unchanged because it already uses exact standalone URL detection. Change only the active Obsidian mirror boundary in `lib/obsidian/mirror.ts` so link items do not create mirror files. Add focused tests for link-skip and todo/note mirror preservation, then deploy and run the production link job until standalone URL-only items are exhausted.

**Tech Stack:** Next.js server actions, Supabase admin client, Node fs/path APIs, Vitest, TypeScript, Coolify deployment.

---

## File Structure

- Modify: `lib/obsidian/mirror.ts` - return `null` before filesystem work for `item.type === "link"`.
- Create: `tests/obsidian-mirror.test.ts` - direct filesystem tests for mirror behavior.
- Keep unchanged: `lib/link-processing/process-batch.ts` and `lib/link-processing/obsidian.ts` - standalone URL-only processing and monthly archive paths already match the spec.
- Update: `progress.md`, `HANDOFF.md`, and `README_FIRST.md` after live verification.

## Task 1: Test Link Mirror Suppression

**Files:**
- Create: `tests/obsidian-mirror.test.ts`
- Modify: `lib/obsidian/mirror.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/obsidian-mirror.test.ts` with tests that set `OBSIDIAN_VAULT_PATH` to a temp directory, verify `type: "link"` returns `null` and writes no file, and verify `type: "todo"` still writes a file.

- [ ] **Step 2: Run focused test and verify failure**

Run: `npm test -- --run tests/obsidian-mirror.test.ts`

Expected before implementation: link test fails because a root `Links/...md` file is written.

- [ ] **Step 3: Implement minimal mirror skip**

In `lib/obsidian/mirror.ts`, add this at the start of `mirrorItemToObsidian` before resolving the vault root:

```ts
  if (item.type === "link") return null;
```

- [ ] **Step 4: Run focused test and verify pass**

Run: `npm test -- --run tests/obsidian-mirror.test.ts`

Expected after implementation: all tests pass.

## Task 2: Full Local Verification

**Files:**
- Existing project files only.

- [ ] **Step 1: Run full unit suite**

Run: `npm test`

Expected: all tests pass.

- [ ] **Step 2: Run lint**

Run: `npm run lint`

Expected: no lint errors.

- [ ] **Step 3: Run production build**

Run: `npm run build`

Expected: build completes successfully.

- [ ] **Step 4: Run TypeScript check**

Run: `npx tsc --noEmit --incremental false`

Expected: no TypeScript errors.

## Task 3: Commit, Push, Deploy

**Files:**
- Commit `docs/superpowers/specs/2026-05-28-link-cleanup-monthly-archive-design.md`
- Commit `docs/superpowers/plans/2026-05-28-link-cleanup-monthly-archive.md`
- Commit `tests/obsidian-mirror.test.ts`
- Commit `lib/obsidian/mirror.ts`

- [ ] **Step 1: Inspect git state**

Run: `git status --short`, `git diff`, and `git log --oneline -5`.

- [ ] **Step 2: Commit relevant files**

Run: `git add <relevant files>` and `git commit -m "fix: stop mirroring active links"`.

- [ ] **Step 3: Push branch**

Run: `git push`.

- [ ] **Step 4: Deploy via Coolify**

Trigger deployment for the backend/web app and wait until the new commit is running.

## Task 4: Production Link Cleanup

**Files:**
- No code changes expected.

- [ ] **Step 1: Count active standalone URL-only items**

Use the production Supabase service role from the environment without printing secrets. Query active items where content is a URL-only string.

- [ ] **Step 2: Run protected link job repeatedly**

Call `POST /api/jobs/process-links` with the configured secret until each run reports no more processed standalone links or the active URL-only count reaches zero.

- [ ] **Step 3: Verify mixed text-plus-link items remain**

Query active items containing URLs where content is not URL-only. Expected: these are still present.

- [ ] **Step 4: Verify monthly archive output**

Check the production Obsidian vault for new `Links/YYYY-MM/*.md` summary or failure notes corresponding to processed standalone URL-only links.

## Task 5: Independent QA And Checkpoint

**Files:**
- Update: `README_FIRST.md`
- Update: `progress.md`
- Update: `HANDOFF.md`

- [ ] **Step 1: Run independent QA pass**

Use a separate QA subagent if available or manually re-check the core invariants: link mirrors skipped, todos mirror, standalone URL-only processing removes app items, mixed links remain.

- [ ] **Step 2: Update project checkpoint files**

Record what changed, verification commands, deployment status, and production cleanup results.

- [ ] **Step 3: Final report**

Report the commit, deployment status, test results, production cleanup counts, and any remaining risks.

## Self-Review

- Spec coverage: The plan covers no active link mirrors, monthly processed archive notes, standalone-only deletion, mixed-link preservation, production cleanup, and verification.
- Placeholder scan: No placeholders or deferred implementation steps remain.
- Type consistency: The implementation uses existing `MirrorableItem.type` values and existing `mirrorItemToObsidian` return type.

# Standalone URL Archiving Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Archive and delete standalone URL-only items while leaving text items that merely reference links in the app.

**Architecture:** Reuse the existing write-note, record-registry, then delete flow. Expand candidate fetching to include active URL-only todos, require the whole content to be a single URL before processing, extend social URL allowlist for Reddit short/share links and Facebook group permalinks, and add a generic web-page extraction path for non-social URLs such as GitHub.

**Tech Stack:** Next.js, Supabase JS, Vitest, OARS chat completions, Node fetch, Obsidian filesystem writer.

---

### Task 1: Standalone URL Selection and Social URL Shapes

**Files:**
- Modify: `lib/link-processing/url.ts`
- Modify: `tests/link-processing-url.test.ts`
- Modify: `tests/link-processing-batch.test.ts`

- [ ] Write failing tests that: standalone URL content is extracted, embedded text-plus-link content is skipped, Reddit `/r/<sub>/s/<code>` is supported, and Facebook `/groups/<group>/permalink/<id>` is supported.
- [ ] Implement `extractStandaloneUrl(content)` and use it from batch processing instead of `extractFirstUrl`.
- [ ] Extend Reddit and Facebook URL allowlists minimally for the observed URL shapes.
- [ ] Run `npm test -- --run tests/link-processing-url.test.ts tests/link-processing-batch.test.ts` and verify pass.

### Task 2: Generic Web Link Extraction

**Files:**
- Create: `lib/link-processing/web.ts`
- Modify: `lib/link-processing/types.ts`
- Modify: `lib/link-processing/process-batch.ts`
- Modify: `lib/link-processing/obsidian.ts`
- Modify: `tests/link-processing-batch.test.ts`
- Create: `tests/link-processing-web.test.ts`

- [ ] Write failing tests for generic URL extraction and batch processing of `https://github.com/Shubhamsaboo/awesome-llm-apps`.
- [ ] Add `LinkSource = "reddit" | "x" | "facebook" | "web"` while keeping Apify actor lookup social-only.
- [ ] Add `extractGenericWebLink` that fetches the page, parses `<title>` and meta description/body text, and returns an extracted link payload with `platform: "web"`.
- [ ] In `process-batch`, use Apify for social sources and generic fetch for `web`.
- [ ] Store generic success notes with `source: "web"` and `apify_actor: "generic-fetch"` or equivalent non-secret source marker.
- [ ] Run targeted tests and verify pass.

### Task 3: Database Constraint and Production Processing

**Files:**
- Add migration: `supabase/migrations/20260515_processed_links_web_platform.sql`
- Modify: `tests/processed-links-migration.test.ts`

- [ ] Add migration to replace the `processed_links.platform` check constraint so it accepts `web`.
- [ ] Run migration tests.
- [ ] Run full verification: `npm test`, `npx tsc --noEmit --incremental false`, `npm run lint`, `npm run build`.
- [ ] Commit and push to `main`.
- [ ] Deploy backend in Coolify.
- [ ] Apply production migration and reload PostgREST schema cache.
- [ ] Run the production job with `CRON_SECRET`.
- [ ] Verify the 5 known URLs are either summarized or have failure notes, their URL-only items are deleted, and Obsidian note files exist.

## Self-Review

- Covers the user's approved recommendation: standalone URL-only cleanup, social extensions, generic GitHub/web support, and text-plus-link preservation.
- Keeps the existing safe deletion rule: no item deletion until after Obsidian write and processed registry insert.
- Migration is required because generic links need `platform = web` in `processed_links`.

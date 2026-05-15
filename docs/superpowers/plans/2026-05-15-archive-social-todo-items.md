# Archive Social Todo Items Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure Reddit/X/Facebook links classified as `todo` social posts are archived by the batch job instead of remaining in Review/Backlog.

**Architecture:** Keep the existing safe write-before-delete processing path. Change only the item fetch criteria so the batch includes active `type=link` items and active items whose metadata marks them as `contentType: social_media_post`; URL validation still decides whether an item is actually processed or skipped.

**Tech Stack:** Next.js route, Supabase JS query builder, Vitest, existing `lib/link-processing` modules.

---

### Task 1: Add Regression Test

**Files:**
- Modify: `tests/link-processing-batch.test.ts`

- [ ] **Step 1: Add a test showing a social Facebook todo is processed**

Insert this test near the other success-path batch tests:

```ts
it("archives active social media todo items", async () => {
  state.items = [linkItem({
    content: "https://www.facebook.com/share/p/1CgcKHNWeD/",
    title: "Facebook shared post",
    type: "todo",
    metadata: {
      contentType: "social_media_post",
      extractedUrl: "https://www.facebook.com/share/p/1CgcKHNWeD/",
      url: "https://www.facebook.com/share/p/1CgcKHNWeD/",
    },
  })];
  mocks.extractSocialLinkWithApify.mockResolvedValue({
    ...extractedLink(),
    platform: "facebook",
    originalUrl: "https://www.facebook.com/share/p/1CgcKHNWeD/",
    normalizedUrl: "https://facebook.com/share/p/1CgcKHNWeD",
  });
  mocks.summarizeExtractedLink.mockResolvedValue(brief());
  mocks.actorNameForPlatform.mockReturnValue("apify/facebook-scraper");
  mocks.writeSuccessLinkNote.mockResolvedValue({ obsidianPath: "Links/2026-05/facebook-shared-post.md", status: "summarized" });

  const { processLinkBatch } = await import("../lib/link-processing/process-batch");
  const summary = await processLinkBatch({ now: new Date("2026-05-14T12:00:00.000Z") });

  expect(summary).toEqual({ scanned: 1, processed: 1, summarized: 1, failed: 0, duplicates: 0, skipped: 0, errors: [] });
  expect(state.orFilter).toBe("type.eq.link,metadata->>contentType.eq.social_media_post");
  expect(mocks.extractSocialLinkWithApify).toHaveBeenCalledWith({
    platform: "facebook",
    originalUrl: "https://www.facebook.com/share/p/1CgcKHNWeD/",
    normalizedUrl: "https://facebook.com/share/p/1CgcKHNWeD",
  });
  expect(state.deletes).toEqual(["item-1"]);
});
```

- [ ] **Step 2: Extend the Supabase mock to record `.or(...)`**

Add `orFilter` to `state`, reset it in `beforeEach`, add an `or(filter: string)` method to the query mock that stores the filter and returns `this`.

- [ ] **Step 3: Run the targeted test and confirm it fails before implementation**

Run: `npm test -- --run tests/link-processing-batch.test.ts`

Expected: FAIL because `.or` is not called and the current production query only filters `type = link`.

### Task 2: Include Social Todo Items in Batch Query

**Files:**
- Modify: `lib/link-processing/process-batch.ts`

- [ ] **Step 1: Replace the type-only filter with a constrained OR filter**

Change the item fetch chain from:

```ts
.eq("type", "link")
.eq("status", "active")
```

to:

```ts
.eq("status", "active")
.or("type.eq.link,metadata->>contentType.eq.social_media_post")
```

- [ ] **Step 2: Run targeted tests**

Run: `npm test -- --run tests/link-processing-batch.test.ts tests/link-processing-url.test.ts`

Expected: PASS.

- [ ] **Step 3: Run broad verification**

Run: `npm test -- --run tests/link-processing-batch.test.ts tests/process-links-route.test.ts tests/link-processing-url.test.ts`

Expected: PASS.

### Task 3: Deploy and Live Verify

**Files:**
- No code files beyond Task 1 and Task 2.

- [ ] **Step 1: Commit and push only if requested by user**

If committing is requested, use a message like `fix: archive social media todo links`.

- [ ] **Step 2: Deploy to Coolify**

Trigger backend deployment after code is on GitHub `main`.

- [ ] **Step 3: Run production job with `CRON_SECRET`**

Run the authorized `POST /api/jobs/process-links` without printing the secret.

Expected: the Facebook item is processed or produces a terminal failure note; in both cases an Obsidian note is written before deletion.

- [ ] **Step 4: Verify effects**

Query production `processed_links` and `items` for item `74364db4-bdaf-4ad9-be6f-83e9ff6fbced` or normalized URL `https://facebook.com/share/p/1CgcKHNWeD`.

Expected: `processed_links` has one row for the URL, the original item no longer exists, and the referenced Obsidian path exists.

## Self-Review

- Spec coverage: covers the observed production item type mismatch and keeps existing safety behavior.
- Placeholder scan: no TODO/TBD placeholders.
- Type consistency: uses existing `LinkItem`, metadata JSON, Supabase query builder, and existing summary counters.

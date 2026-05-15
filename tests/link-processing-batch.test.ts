import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LinkBrief, LinkItem } from "../lib/link-processing/types";

const state = vi.hoisted(() => ({
  items: [] as LinkItem[],
  processed: new Map<string, Record<string, unknown>>(),
  selectedColumns: "",
  orFilter: "",
  orderBy: null as { column: string; ascending?: boolean } | null,
  limit: 0,
  inserts: [] as Record<string, unknown>[],
  deletes: [] as string[],
  insertError: null as { message: string } | null,
  calls: [] as string[],
}));

const mocks = vi.hoisted(() => ({
  extractSocialLinkWithApify: vi.fn(),
  extractGenericWebLink: vi.fn(),
  actorNameForPlatform: vi.fn(),
  summarizeExtractedLink: vi.fn(),
  writeSuccessLinkNote: vi.fn(),
  writeFailureLinkNote: vi.fn(),
  removeWrittenLinkNote: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => createTableQuery(table),
  }),
}));

vi.mock("../lib/link-processing/apify", () => ({
  actorNameForPlatform: mocks.actorNameForPlatform,
  extractSocialLinkWithApify: mocks.extractSocialLinkWithApify,
  isRetryableExtractionError: (error: unknown) => error instanceof Error && (error as { retryable?: unknown }).retryable === true,
}));

vi.mock("../lib/link-processing/summarize", () => ({
  summarizeExtractedLink: mocks.summarizeExtractedLink,
}));

vi.mock("../lib/link-processing/obsidian", () => ({
  removeWrittenLinkNote: mocks.removeWrittenLinkNote,
  writeFailureLinkNote: mocks.writeFailureLinkNote,
  writeSuccessLinkNote: mocks.writeSuccessLinkNote,
}));

vi.mock("../lib/link-processing/web", () => ({
  extractGenericWebLink: mocks.extractGenericWebLink,
}));

describe("processLinkBatch", () => {
  beforeEach(() => {
    process.env.APIFY_TOKEN = "test-token";
    process.env.APIFY_REDDIT_ACTOR = "apify/reddit-scraper";
    process.env.APIFY_X_ACTOR = "apify/x-scraper";
    process.env.APIFY_FACEBOOK_ACTOR = "apify/facebook-scraper";
    process.env.OARS_API_KEY = "test-oars-key";
    state.items = [];
    state.processed = new Map();
    state.selectedColumns = "";
    state.orFilter = "";
    state.orderBy = null;
    state.limit = 0;
    state.inserts = [];
    state.deletes = [];
    state.insertError = null;
    state.calls = [];
    vi.clearAllMocks();
    mocks.actorNameForPlatform.mockReturnValue("apify/reddit-scraper");
    mocks.removeWrittenLinkNote.mockImplementation(async (obsidianPath: string) => {
      state.calls.push(`cleanup:${obsidianPath}`);
    });
  });

  it("writes, records, and deletes a newly summarized link in safe order", async () => {
    state.items = [linkItem({ content: "https://www.reddit.com/r/AI/comments/abc123/thread/?utm_source=share" })];
    mocks.extractSocialLinkWithApify.mockImplementation(async () => {
      state.calls.push("extract");
      return extractedLink();
    });
    mocks.summarizeExtractedLink.mockImplementation(async () => {
      state.calls.push("summarize");
      return brief();
    });
    mocks.writeSuccessLinkNote.mockImplementation(async () => {
      state.calls.push("write-success");
      return { obsidianPath: "Links/2026-05/useful-thread.md", status: "summarized" };
    });

    const { processLinkBatch } = await import("../lib/link-processing/process-batch");
    const summary = await processLinkBatch({ limit: 5, now: new Date("2026-05-14T12:00:00.000Z") });

    expect(summary).toEqual({ scanned: 1, processed: 1, summarized: 1, failed: 0, duplicates: 0, skipped: 0, errors: [] });
    expect(state.selectedColumns).toBe("id,user_id,title,content,type,status,metadata,created_at,updated_at");
    expect(state.orderBy).toEqual({ column: "created_at", ascending: true });
    expect(state.limit).toBe(5);
    expect(mocks.extractSocialLinkWithApify).toHaveBeenCalledWith({
      platform: "reddit",
      originalUrl: "https://www.reddit.com/r/AI/comments/abc123/thread/?utm_source=share",
      normalizedUrl: "https://reddit.com/r/AI/comments/abc123/thread",
    });
    expect(mocks.writeSuccessLinkNote).toHaveBeenCalledWith(expect.objectContaining({
      itemId: "item-1",
      savedAt: "2026-05-14T12:00:00.000Z",
      apifyActor: "apify/reddit-scraper",
    }));
    expect(state.inserts).toEqual([expect.objectContaining({
      user_id: "user-1",
      normalized_url: "https://reddit.com/r/AI/comments/abc123/thread",
      original_url: "https://www.reddit.com/r/AI/comments/abc123/thread/?utm_source=share",
      platform: "reddit",
      status: "summarized",
      obsidian_path: "Links/2026-05/useful-thread.md",
      original_item_id: "item-1",
    })]);
    expect(state.deletes).toEqual(["item-1"]);
    expect(state.calls).toEqual(["extract", "summarize", "write-success", "insert", "delete:item-1"]);
  });

  it("deletes duplicate todo items without creating a new note or registry row", async () => {
    state.items = [linkItem({ content: "https://twitter.com/example/status/123?utm_source=feed" })];
    state.processed.set("user-1|https://x.com/example/status/123", { id: "processed-1", status: "summarized" });

    const { processLinkBatch } = await import("../lib/link-processing/process-batch");
    const summary = await processLinkBatch({ now: new Date("2026-05-14T12:00:00.000Z") });

    expect(summary).toEqual({ scanned: 1, processed: 1, summarized: 0, failed: 0, duplicates: 1, skipped: 0, errors: [] });
    expect(mocks.extractSocialLinkWithApify).not.toHaveBeenCalled();
    expect(mocks.summarizeExtractedLink).not.toHaveBeenCalled();
    expect(mocks.writeSuccessLinkNote).not.toHaveBeenCalled();
    expect(mocks.writeFailureLinkNote).not.toHaveBeenCalled();
    expect(state.inserts).toEqual([]);
    expect(state.deletes).toEqual(["item-1"]);
  });

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
    expect(state.orFilter).toBe("type.eq.link,metadata->>contentType.eq.social_media_post,content.ilike.http%");
    expect(mocks.extractSocialLinkWithApify).toHaveBeenCalledWith({
      platform: "facebook",
      originalUrl: "https://www.facebook.com/share/p/1CgcKHNWeD/",
      normalizedUrl: "https://facebook.com/share/p/1CgcKHNWeD",
    });
    expect(state.deletes).toEqual(["item-1"]);
  });

  it("leaves text items with embedded links in the app", async () => {
    state.items = [linkItem({ content: "Read this later https://github.com/Shubhamsaboo/awesome-llm-apps", type: "todo" })];

    const { processLinkBatch } = await import("../lib/link-processing/process-batch");
    const summary = await processLinkBatch({ now: new Date("2026-05-14T12:00:00.000Z") });

    expect(summary).toEqual({ scanned: 1, processed: 0, summarized: 0, failed: 0, duplicates: 0, skipped: 1, errors: [] });
    expect(mocks.extractSocialLinkWithApify).not.toHaveBeenCalled();
    expect(mocks.extractGenericWebLink).not.toHaveBeenCalled();
    expect(state.deletes).toEqual([]);
  });

  it("archives standalone generic web links", async () => {
    state.items = [linkItem({ content: "https://github.com/Shubhamsaboo/awesome-llm-apps", title: "Awesome LLM Apps" })];
    mocks.extractGenericWebLink.mockResolvedValue({
      platform: "web",
      originalUrl: "https://github.com/Shubhamsaboo/awesome-llm-apps",
      normalizedUrl: "https://github.com/Shubhamsaboo/awesome-llm-apps",
      title: "Awesome LLM Apps",
      author: null,
      publishedAt: null,
      text: "A curated list of LLM apps.",
      comments: [],
      metrics: {},
      raw: { source: "web" },
    });
    mocks.summarizeExtractedLink.mockResolvedValue(brief());
    mocks.writeSuccessLinkNote.mockResolvedValue({ obsidianPath: "Links/2026-05/awesome-llm-apps.md", status: "summarized" });

    const { processLinkBatch } = await import("../lib/link-processing/process-batch");
    const summary = await processLinkBatch({ now: new Date("2026-05-14T12:00:00.000Z") });

    expect(summary).toEqual({ scanned: 1, processed: 1, summarized: 1, failed: 0, duplicates: 0, skipped: 0, errors: [] });
    expect(mocks.extractGenericWebLink).toHaveBeenCalledWith({
      originalUrl: "https://github.com/Shubhamsaboo/awesome-llm-apps",
      normalizedUrl: "https://github.com/Shubhamsaboo/awesome-llm-apps",
    });
    expect(state.inserts).toEqual([expect.objectContaining({ platform: "web", original_item_id: "item-1" })]);
    expect(state.deletes).toEqual(["item-1"]);
  });

  it("keeps the todo item when the success Obsidian write fails", async () => {
    state.items = [linkItem({ content: "https://reddit.com/r/AI/comments/abc123/thread" })];
    mocks.extractSocialLinkWithApify.mockResolvedValue(extractedLink());
    mocks.summarizeExtractedLink.mockResolvedValue(brief());
    mocks.writeSuccessLinkNote.mockRejectedValue(new Error("disk full"));

    const { processLinkBatch } = await import("../lib/link-processing/process-batch");
    const summary = await processLinkBatch({ now: new Date("2026-05-14T12:00:00.000Z") });

    expect(summary).toEqual({
      scanned: 1,
      processed: 0,
      summarized: 0,
      failed: 0,
      duplicates: 0,
      skipped: 0,
      errors: [{ itemId: "item-1", reason: "disk full" }],
    });
    expect(state.inserts).toEqual([]);
    expect(state.deletes).toEqual([]);
  });

  it("removes the just-written success note and keeps the todo item when registry insert fails", async () => {
    state.items = [linkItem({ content: "https://reddit.com/r/AI/comments/abc123/thread" })];
    state.insertError = { message: "duplicate key value violates unique constraint" };
    mocks.extractSocialLinkWithApify.mockImplementation(async () => {
      state.calls.push("extract");
      return extractedLink();
    });
    mocks.summarizeExtractedLink.mockImplementation(async () => {
      state.calls.push("summarize");
      return brief();
    });
    mocks.writeSuccessLinkNote.mockImplementation(async () => {
      state.calls.push("write-success");
      return { obsidianPath: "Links/2026-05/useful-thread.md", status: "summarized" };
    });

    const { processLinkBatch } = await import("../lib/link-processing/process-batch");
    const summary = await processLinkBatch({ now: new Date("2026-05-14T12:00:00.000Z") });

    expect(summary).toEqual({
      scanned: 1,
      processed: 0,
      summarized: 0,
      failed: 0,
      duplicates: 0,
      skipped: 0,
      errors: [{ itemId: "item-1", reason: "duplicate key value violates unique constraint" }],
    });
    expect(mocks.removeWrittenLinkNote).toHaveBeenCalledWith("Links/2026-05/useful-thread.md");
    expect(state.deletes).toEqual([]);
    expect(state.calls).toEqual([
      "extract",
      "summarize",
      "write-success",
      "insert",
      "cleanup:Links/2026-05/useful-thread.md",
    ]);
  });

  it("writes a failure note, records failed status, and deletes after Apify failure", async () => {
    state.items = [linkItem({ content: "https://facebook.com/story.php?id=42" })];
    mocks.extractSocialLinkWithApify.mockRejectedValue(new Error("Apify actor returned no dataset items"));
    mocks.writeFailureLinkNote.mockResolvedValue({ obsidianPath: "Links/2026-05/failed.md", status: "failed" });

    const { processLinkBatch } = await import("../lib/link-processing/process-batch");
    const summary = await processLinkBatch({ now: new Date("2026-05-14T12:00:00.000Z") });

    expect(summary).toEqual({ scanned: 1, processed: 1, summarized: 0, failed: 1, duplicates: 0, skipped: 0, errors: [] });
    expect(mocks.writeFailureLinkNote).toHaveBeenCalledWith(expect.objectContaining({
      itemId: "item-1",
      platform: "facebook",
      originalUrl: "https://facebook.com/story.php?id=42",
      normalizedUrl: "https://facebook.com/story.php?id=42",
      failureReason: "Apify actor returned no dataset items",
    }));
    expect(state.inserts).toEqual([expect.objectContaining({
      status: "failed",
      failure_reason: "Apify actor returned no dataset items",
      obsidian_path: "Links/2026-05/failed.md",
    })]);
    expect(state.deletes).toEqual(["item-1"]);
  });

  it("keeps the todo item when Apify returns a retryable non-terminal run status", async () => {
    state.items = [linkItem({ content: "https://reddit.com/r/AI/comments/abc123/thread" })];
    mocks.extractSocialLinkWithApify.mockRejectedValue(
      Object.assign(new Error("Apify actor did not finish successfully: RUNNING"), { retryable: true }),
    );

    const { processLinkBatch } = await import("../lib/link-processing/process-batch");
    const summary = await processLinkBatch({ now: new Date("2026-05-14T12:00:00.000Z") });

    expect(summary).toEqual({
      scanned: 1,
      processed: 0,
      summarized: 0,
      failed: 0,
      duplicates: 0,
      skipped: 0,
      errors: [{ itemId: "item-1", reason: "Apify actor did not finish successfully: RUNNING" }],
    });
    expect(mocks.writeFailureLinkNote).not.toHaveBeenCalled();
    expect(state.inserts).toEqual([]);
    expect(state.deletes).toEqual([]);
  });

  it("keeps the todo item when Apify returns a retryable transitional run status", async () => {
    state.items = [linkItem({ content: "https://reddit.com/r/AI/comments/abc123/thread" })];
    mocks.extractSocialLinkWithApify.mockRejectedValue(
      Object.assign(new Error("Apify actor did not finish successfully: ABORTING"), { retryable: true }),
    );

    const { processLinkBatch } = await import("../lib/link-processing/process-batch");
    const summary = await processLinkBatch({ now: new Date("2026-05-14T12:00:00.000Z") });

    expect(summary).toEqual({
      scanned: 1,
      processed: 0,
      summarized: 0,
      failed: 0,
      duplicates: 0,
      skipped: 0,
      errors: [{ itemId: "item-1", reason: "Apify actor did not finish successfully: ABORTING" }],
    });
    expect(mocks.writeFailureLinkNote).not.toHaveBeenCalled();
    expect(state.inserts).toEqual([]);
    expect(state.deletes).toEqual([]);
  });

  it("preflights required config before loading items and leaves active links untouched", async () => {
    delete process.env.APIFY_X_ACTOR;
    state.items = [linkItem({ content: "https://twitter.com/example/status/123" })];

    const { processLinkBatch } = await import("../lib/link-processing/process-batch");
    const summary = await processLinkBatch({ now: new Date("2026-05-14T12:00:00.000Z") });

    expect(summary).toEqual({
      scanned: 0,
      processed: 0,
      summarized: 0,
      failed: 0,
      duplicates: 0,
      skipped: 0,
      errors: [{ itemId: "batch", reason: "Missing APIFY_X_ACTOR" }],
    });
    expect(state.selectedColumns).toBe("");
    expect(mocks.extractSocialLinkWithApify).not.toHaveBeenCalled();
    expect(mocks.writeFailureLinkNote).not.toHaveBeenCalled();
    expect(state.inserts).toEqual([]);
    expect(state.deletes).toEqual([]);
  });

  it("skips ambiguous social URLs without extracting, recording, or deleting", async () => {
    state.items = [linkItem({ content: "Maybe later https://x.com/example/settings" })];

    const { processLinkBatch } = await import("../lib/link-processing/process-batch");
    const summary = await processLinkBatch({ now: new Date("2026-05-14T12:00:00.000Z") });

    expect(summary).toEqual({ scanned: 1, processed: 0, summarized: 0, failed: 0, duplicates: 0, skipped: 1, errors: [] });
    expect(mocks.extractSocialLinkWithApify).not.toHaveBeenCalled();
    expect(mocks.writeFailureLinkNote).not.toHaveBeenCalled();
    expect(state.inserts).toEqual([]);
    expect(state.deletes).toEqual([]);
  });
});

function createTableQuery(table: string) {
  const filters: Record<string, unknown> = {};
  let mode = "";
  return {
    select(columns: string) {
      mode = "select";
      if (table === "items") state.selectedColumns = columns;
      return this;
    },
    eq(column: string, value: unknown) {
      filters[column] = value;
      if (mode === "delete") return deleteResult(value);
      return this;
    },
    or(filter: string) {
      state.orFilter = filter;
      return this;
    },
    order(column: string, options: { ascending?: boolean }) {
      state.orderBy = { column, ascending: options.ascending };
      return this;
    },
    limit(limit: number) {
      state.limit = limit;
      return Promise.resolve({ data: state.items.slice(0, limit), error: null });
    },
    maybeSingle() {
      return Promise.resolve({ data: state.processed.get(`${filters.user_id}|${filters.normalized_url}`) ?? null, error: null });
    },
    insert(payload: Record<string, unknown>) {
      state.calls.push("insert");
      state.inserts.push(payload);
      return Promise.resolve({ data: state.insertError ? null : payload, error: state.insertError });
    },
    delete() {
      mode = "delete";
      return this;
    },
  };
}

function deleteResult(value: unknown) {
  const id = String(value);
  state.calls.push(`delete:${id}`);
  state.deletes.push(id);
  return Promise.resolve({ data: null, error: null });
}

function linkItem(overrides: Partial<LinkItem> = {}): LinkItem {
  return {
    id: "item-1",
    user_id: "user-1",
    title: "Saved link",
    content: "Read later",
    type: "link",
    status: "active",
    metadata: {},
    created_at: "2026-05-14T10:00:00.000Z",
    updated_at: "2026-05-14T10:00:00.000Z",
    ...overrides,
  };
}

function extractedLink() {
  return {
    platform: "reddit" as const,
    originalUrl: "https://www.reddit.com/r/AI/comments/abc123/thread/?utm_source=share",
    normalizedUrl: "https://reddit.com/r/AI/comments/abc123/thread",
    title: "Useful Thread",
    author: "u/example",
    publishedAt: "2026-05-14T10:00:00.000Z",
    text: "Thread text",
    comments: [],
    metrics: {},
    raw: {},
  };
}

function brief(): LinkBrief {
  return { title: "Useful Thread", whySaved: "Useful", fullContext: "Context", keyPoints: [], notableDetails: [], tags: [] };
}

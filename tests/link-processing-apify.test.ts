import { afterEach, describe, expect, it, vi } from "vitest";
import { actorNameForPlatform, extractSocialLinkWithApify } from "../lib/link-processing/apify";

const priorToken = process.env.APIFY_TOKEN;
const priorLegacyToken = process.env.APIFY;
const priorRedditActor = process.env.APIFY_REDDIT_ACTOR;
const priorXActor = process.env.APIFY_X_ACTOR;
const priorFacebookActor = process.env.APIFY_FACEBOOK_ACTOR;

afterEach(() => {
  restoreEnv("APIFY_TOKEN", priorToken);
  restoreEnv("APIFY", priorLegacyToken);
  restoreEnv("APIFY_REDDIT_ACTOR", priorRedditActor);
  restoreEnv("APIFY_X_ACTOR", priorXActor);
  restoreEnv("APIFY_FACEBOOK_ACTOR", priorFacebookActor);
  vi.unstubAllGlobals();
});

describe("Apify social link extraction", () => {
  it("uses the configured reddit actor, fetches its dataset, and normalizes the first item", async () => {
    process.env.APIFY_TOKEN = "test-token";
    process.env.APIFY_REDDIT_ACTOR = "custom/reddit-actor";
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const requestUrl = String(url);

      if (requestUrl.includes("/acts/custom~reddit-actor/runs")) {
        return jsonResponse({ data: { status: "SUCCEEDED", defaultDatasetId: "dataset-123" } });
      }

      if (requestUrl.includes("/datasets/dataset-123/items?clean=true")) {
        return jsonResponse([
          {
            title: "Useful Reddit Thread",
            body: "Original post body",
            author: "u/example",
            createdAt: "2026-05-14T10:00:00.000Z",
            comments: ["First comment", { text: "Second comment" }, { comment: "Third comment" }],
            score: 42,
            likes: 11,
            replies: 3,
            shares: 2,
          },
        ]);
      }

      throw new Error(`Unexpected fetch ${requestUrl} ${init?.method ?? "GET"}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    expect(actorNameForPlatform("reddit")).toBe("custom/reddit-actor");

    const result = await extractSocialLinkWithApify({
      platform: "reddit",
      originalUrl: "https://www.reddit.com/r/AI/comments/abc123/thread/?utm_source=share",
      normalizedUrl: "https://reddit.com/r/AI/comments/abc123/thread",
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0][0])).toContain("/acts/custom~reddit-actor/runs");
    expect(String(fetchMock.mock.calls[0][0])).toContain("waitForFinish=120");
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      startUrls: [{ url: "https://reddit.com/r/AI/comments/abc123/thread" }],
    });
    expect(result).toEqual({
      platform: "reddit",
      originalUrl: "https://www.reddit.com/r/AI/comments/abc123/thread/?utm_source=share",
      normalizedUrl: "https://reddit.com/r/AI/comments/abc123/thread",
      title: "Useful Reddit Thread",
      author: "u/example",
      publishedAt: "2026-05-14T10:00:00.000Z",
      text: "Original post body",
      comments: ["First comment", "Second comment", "Third comment"],
      metrics: { score: 42, likes: 11, replies: 3, shares: 2 },
      raw: {
        title: "Useful Reddit Thread",
        body: "Original post body",
        author: "u/example",
        createdAt: "2026-05-14T10:00:00.000Z",
        comments: ["First comment", { text: "Second comment" }, { comment: "Third comment" }],
        score: 42,
        likes: 11,
        replies: 3,
        shares: 2,
      },
    });
  });

  it("requires APIFY_TOKEN or APIFY", async () => {
    delete process.env.APIFY_TOKEN;
    delete process.env.APIFY;

    await expect(
      extractSocialLinkWithApify({
        platform: "x",
        originalUrl: "https://twitter.com/example/status/123",
        normalizedUrl: "https://x.com/example/status/123",
      }),
    ).rejects.toThrow("Missing APIFY_TOKEN or APIFY");
  });

  it("uses APIFY as a fallback token name", async () => {
    delete process.env.APIFY_TOKEN;
    process.env.APIFY = "legacy-token";
    process.env.APIFY_X_ACTOR = "custom/x-actor";
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const requestUrl = String(url);

      if (requestUrl.includes("/acts/custom~x-actor/runs")) {
        expect(init?.headers).toMatchObject({ Authorization: "Bearer legacy-token" });
        return jsonResponse({ data: { status: "SUCCEEDED", defaultDatasetId: "dataset-legacy" } });
      }

      if (requestUrl.includes("/datasets/dataset-legacy/items?clean=true")) {
        expect(init?.headers).toMatchObject({ Authorization: "Bearer legacy-token" });
        return jsonResponse([{ text: "Tweet body" }]);
      }

      throw new Error(`Unexpected fetch ${requestUrl}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      extractSocialLinkWithApify({
        platform: "x",
        originalUrl: "https://x.com/example/status/123",
        normalizedUrl: "https://x.com/example/status/123",
      }),
    ).resolves.toMatchObject({ text: "Tweet body" });
  });

  it("requires a configured actor for the platform", async () => {
    process.env.APIFY_TOKEN = "test-token";
    delete process.env.APIFY_X_ACTOR;

    await expect(
      extractSocialLinkWithApify({
        platform: "x",
        originalUrl: "https://twitter.com/example/status/123",
        normalizedUrl: "https://x.com/example/status/123",
      }),
    ).rejects.toThrow("Missing APIFY_X_ACTOR");
  });

  it("throws when the actor dataset is empty", async () => {
    process.env.APIFY_TOKEN = "test-token";
    process.env.APIFY_FACEBOOK_ACTOR = "custom/facebook-actor";
    const fetchMock = vi.fn(async (url: string | URL) => {
      const requestUrl = String(url);

      if (requestUrl.includes("/acts/")) {
        return jsonResponse({ data: { status: "SUCCEEDED", defaultDatasetId: "empty-dataset" } });
      }

      if (requestUrl.includes("/datasets/empty-dataset/items?clean=true")) {
        return jsonResponse([]);
      }

      throw new Error(`Unexpected fetch ${requestUrl}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      extractSocialLinkWithApify({
        platform: "facebook",
        originalUrl: "https://facebook.com/story.php?id=42",
        normalizedUrl: "https://facebook.com/story.php?id=42",
      }),
    ).rejects.toThrow("Apify actor returned no dataset items");
  });

  it("throws when the actor run does not succeed", async () => {
    process.env.APIFY_TOKEN = "test-token";
    process.env.APIFY_REDDIT_ACTOR = "custom/reddit-actor";
    const fetchMock = vi.fn(async (url: string | URL) => {
      const requestUrl = String(url);

      if (requestUrl.includes("/acts/custom~reddit-actor/runs")) {
        return jsonResponse({ data: { status: "FAILED", defaultDatasetId: "failed-dataset" } });
      }

      throw new Error(`Unexpected fetch ${requestUrl}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      extractSocialLinkWithApify({
        platform: "reddit",
        originalUrl: "https://www.reddit.com/r/AI/comments/abc123/thread/",
        normalizedUrl: "https://reddit.com/r/AI/comments/abc123/thread",
      }),
    ).rejects.toThrow("Apify actor did not finish successfully: FAILED");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("marks non-terminal actor runs as retryable", async () => {
    process.env.APIFY_TOKEN = "test-token";
    process.env.APIFY_REDDIT_ACTOR = "custom/reddit-actor";
    const fetchMock = vi.fn(async (url: string | URL) => {
      const requestUrl = String(url);

      if (requestUrl.includes("/acts/custom~reddit-actor/runs")) {
        return jsonResponse({ data: { status: "RUNNING", defaultDatasetId: "running-dataset" } });
      }

      throw new Error(`Unexpected fetch ${requestUrl}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      extractSocialLinkWithApify({
        platform: "reddit",
        originalUrl: "https://www.reddit.com/r/AI/comments/abc123/thread/",
        normalizedUrl: "https://reddit.com/r/AI/comments/abc123/thread",
      }),
    ).rejects.toMatchObject({ message: "Apify actor did not finish successfully: RUNNING", retryable: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each(["TIMING-OUT", "ABORTING"])("marks transitional actor status %s as retryable", async (status) => {
    process.env.APIFY_TOKEN = "test-token";
    process.env.APIFY_REDDIT_ACTOR = "custom/reddit-actor";
    const fetchMock = vi.fn(async (url: string | URL) => {
      const requestUrl = String(url);

      if (requestUrl.includes("/acts/custom~reddit-actor/runs")) {
        return jsonResponse({ data: { status, defaultDatasetId: "transitional-dataset" } });
      }

      throw new Error(`Unexpected fetch ${requestUrl}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      extractSocialLinkWithApify({
        platform: "reddit",
        originalUrl: "https://www.reddit.com/r/AI/comments/abc123/thread/",
        normalizedUrl: "https://reddit.com/r/AI/comments/abc123/thread",
      }),
    ).rejects.toMatchObject({ message: `Apify actor did not finish successfully: ${status}`, retryable: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

function jsonResponse(body: unknown, init: { ok?: boolean; status?: number; statusText?: string } = {}) {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    statusText: init.statusText ?? "OK",
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

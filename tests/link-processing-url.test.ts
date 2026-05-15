import { describe, expect, it } from "vitest";
import {
  detectSupportedPlatform,
  extractFirstUrl,
  extractStandaloneUrl,
  isSupportedPublicSocialUrl,
  isSocialUrl,
  normalizeSocialUrl,
  slugifyForFilename,
} from "../lib/link-processing/url";

describe("link processing URL utilities", () => {
  it("extracts the first URL from content", () => {
    const content = "Read this first: https://reddit.com/r/ai/comments/abc123/thread), then https://x.com/user/status/1";

    expect(extractFirstUrl(content)).toBe("https://reddit.com/r/ai/comments/abc123/thread");
  });

  it("extracts only standalone URL content for automatic archiving", () => {
    expect(extractStandaloneUrl(" https://github.com/Shubhamsaboo/awesome-llm-apps \n")).toBe(
      "https://github.com/Shubhamsaboo/awesome-llm-apps",
    );
    expect(extractStandaloneUrl("Read this https://github.com/Shubhamsaboo/awesome-llm-apps later")).toBeNull();
    expect(extractStandaloneUrl("https://github.com/one https://github.com/two")).toBeNull();
  });

  it("detects supported platforms and rejects unsupported hosts", () => {
    expect(detectSupportedPlatform("https://reddit.com/r/test/comments/abc123/thread")).toBe("reddit");
    expect(detectSupportedPlatform("https://old.reddit.com/r/test/comments/abc123/thread")).toBe("reddit");
    expect(detectSupportedPlatform("https://x.com/user/status/1")).toBe("x");
    expect(detectSupportedPlatform("https://mobile.twitter.com/user/status/1")).toBe("x");
    expect(detectSupportedPlatform("https://facebook.com/story.php?id=1")).toBe("facebook");
    expect(detectSupportedPlatform("https://m.facebook.com/story.php?id=1")).toBe("facebook");
    expect(detectSupportedPlatform("https://example.com/story")).toBeNull();
  });

  it("accepts only public social post-like URLs", () => {
    expect(isSupportedPublicSocialUrl("https://reddit.com/comments/abc123/thread", "reddit")).toBe(true);
    expect(isSupportedPublicSocialUrl("https://reddit.com/r/ai/comments/abc123/thread", "reddit")).toBe(true);
    expect(isSupportedPublicSocialUrl("https://x.com/user/status/123", "x")).toBe(true);
    expect(isSupportedPublicSocialUrl("https://twitter.com/user/status/123", "x")).toBe(true);
    expect(isSupportedPublicSocialUrl("https://facebook.com/user/posts/123", "facebook")).toBe(true);
    expect(isSupportedPublicSocialUrl("https://facebook.com/story.php?id=42", "facebook")).toBe(true);
    expect(isSupportedPublicSocialUrl("https://facebook.com/permalink.php?story_fbid=1&id=2", "facebook")).toBe(true);
    expect(isSupportedPublicSocialUrl("https://facebook.com/reel/123", "facebook")).toBe(true);
    expect(isSupportedPublicSocialUrl("https://facebook.com/watch/?v=123", "facebook")).toBe(true);
    expect(isSupportedPublicSocialUrl("https://facebook.com/photo.php?fbid=123", "facebook")).toBe(true);
    expect(isSupportedPublicSocialUrl("https://facebook.com/share/p/abc", "facebook")).toBe(true);
    expect(isSupportedPublicSocialUrl("https://facebook.com/groups/nothingheldback/permalink/2086731376060543/", "facebook")).toBe(true);
    expect(isSupportedPublicSocialUrl("https://www.reddit.com/r/vibecoding/s/gwGd3Z8OOy", "reddit")).toBe(true);

    expect(isSupportedPublicSocialUrl("https://reddit.com/r/ai", "reddit")).toBe(false);
    expect(isSupportedPublicSocialUrl("https://reddit.com/user/me/comments/abc123", "reddit")).toBe(false);
    expect(isSupportedPublicSocialUrl("https://x.com/user/settings", "x")).toBe(false);
    expect(isSupportedPublicSocialUrl("https://x.com/user/status/not-numeric", "x")).toBe(false);
    expect(isSupportedPublicSocialUrl("https://x.com/settings/status/123", "x")).toBe(false);
    expect(isSupportedPublicSocialUrl("https://twitter.com/help/status/123", "x")).toBe(false);
    expect(isSupportedPublicSocialUrl("https://x.com/login/status/123", "x")).toBe(false);
    expect(isSupportedPublicSocialUrl("https://facebook.com/help", "facebook")).toBe(false);
    expect(isSupportedPublicSocialUrl("https://facebook.com/help/posts/123", "facebook")).toBe(false);
    expect(isSupportedPublicSocialUrl("https://facebook.com/login", "facebook")).toBe(false);
    expect(isSupportedPublicSocialUrl("https://facebook.com/login/share/abc", "facebook")).toBe(false);
  });

  it("normalizes tracking-heavy reddit, twitter, and facebook URLs", () => {
    expect(
      normalizeSocialUrl("HTTP://WWW.REDDIT.COM/r/AI/comments/abc123/thread/?utm_source=share&utm_medium=web2x&s=09&context=3#frag"),
    ).toBe("https://reddit.com/r/AI/comments/abc123/thread?context=3");

    expect(
      normalizeSocialUrl("https://mobile.twitter.com/User/status/12345/?utm_campaign=social&gclid=abc&lang=en#ref"),
    ).toBe("https://x.com/User/status/12345?lang=en");

    expect(
      normalizeSocialUrl("https://www.facebook.com/story.php/?fbclid=abc&id=42&mc_cid=campaign&ref=share"),
    ).toBe("https://facebook.com/story.php?id=42&ref=share");
  });

  it("sorts retained query parameters while normalizing", () => {
    expect(normalizeSocialUrl("https://facebook.com/story.php?ref=share&id=42&utm_source=feed")).toBe(
      "https://facebook.com/story.php?id=42&ref=share",
    );
  });

  it("does not normalize ambiguous social URLs", () => {
    expect(normalizeSocialUrl("https://reddit.com/r/ai")).toBeNull();
    expect(normalizeSocialUrl("https://x.com/example/settings")).toBeNull();
    expect(normalizeSocialUrl("https://facebook.com/help")).toBeNull();
  });

  it("detects social hosts even when the URL shape is unsupported", () => {
    expect(isSocialUrl("https://x.com/example/settings")).toBe(true);
    expect(isSocialUrl("https://reddit.com/r/ai")).toBe(true);
    expect(isSocialUrl("https://github.com/Shubhamsaboo/awesome-llm-apps")).toBe(false);
  });

  it("slugifies titles for Obsidian filenames", () => {
    expect(slugifyForFilename("A Useful Reddit Thread: AI + Planning!", "item-12345678")).toBe(
      "a-useful-reddit-thread-ai-planning__item-123.md",
    );
  });
});

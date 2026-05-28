import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("service worker cache policy", () => {
  it("does not precache the live web app shell", async () => {
    const source = await readFile(resolve(process.cwd(), "public/sw.js"), "utf8");

    expect(source).not.toMatch(/PRECACHE_URLS\s*=\s*\[[^\]]*["']\/app["']/);
  });

  it("routes app navigations and RSC refreshes through network-first handling", async () => {
    const source = await readFile(resolve(process.cwd(), "public/sw.js"), "utf8");

    expect(source).toContain('url.searchParams.has("_rsc")');
    expect(source).toContain('event.request.mode === "navigate"');
    expect(source).toContain('url.pathname.startsWith("/app")');
    expect(source).not.toContain("return cached || fetched");
  });
});

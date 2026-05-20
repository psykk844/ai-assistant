import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("web auth session", () => {
  it("keeps the web login cookie for 30 days with same-site protection", async () => {
    const source = await readFile(resolve(process.cwd(), "app/login/page.tsx"), "utf8");

    expect(source).toContain("max-age=2592000");
    expect(source.toLowerCase()).toContain("samesite=lax");
  });
});

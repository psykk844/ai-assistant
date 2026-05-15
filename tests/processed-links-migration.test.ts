import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  path.join(process.cwd(), "supabase/migrations/20260514_processed_links.sql"),
  "utf8",
);
const webPlatformMigration = readFileSync(
  path.join(process.cwd(), "supabase/migrations/20260515_processed_links_web_platform.sql"),
  "utf8",
);

describe("processed links migration", () => {
  it("limits registry status to rows that have real note outcomes", () => {
    expect(migration).toContain("status TEXT NOT NULL CHECK (status IN ('summarized', 'failed'))");
    expect(migration).not.toContain("'duplicate'");
  });

  it("allows generic web links in the processed link registry", () => {
    expect(webPlatformMigration).toContain("DROP CONSTRAINT IF EXISTS processed_links_platform_check");
    expect(webPlatformMigration).toContain("CHECK (platform IN ('reddit', 'x', 'facebook', 'web'))");
  });
});

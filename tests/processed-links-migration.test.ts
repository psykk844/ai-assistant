import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  path.join(process.cwd(), "supabase/migrations/20260514_processed_links.sql"),
  "utf8",
);

describe("processed links migration", () => {
  it("limits registry status to rows that have real note outcomes", () => {
    expect(migration).toContain("status TEXT NOT NULL CHECK (status IN ('summarized', 'failed'))");
    expect(migration).not.toContain("'duplicate'");
  });
});

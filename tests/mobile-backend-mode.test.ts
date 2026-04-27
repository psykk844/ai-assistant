import { describe, expect, it } from "vitest";
import { getMobileBackendModeLabel } from "../mobile/lib/api";

describe("getMobileBackendModeLabel", () => {
  it("returns a valid mode label", () => {
    const mode = getMobileBackendModeLabel();

    expect(["mock", "backend"]).toContain(mode);
  });
});

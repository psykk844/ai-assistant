import { beforeEach, describe, expect, it, vi } from "vitest";

const dnsMocks = vi.hoisted(() => ({
  lookup: vi.fn(async () => ({ address: "93.184.216.34", family: 4 })),
}));

vi.mock("node:dns/promises", () => ({
  lookup: dnsMocks.lookup,
}));

import { extractGenericWebLink } from "../lib/link-processing/web";

describe("generic web link extraction", () => {
  beforeEach(() => {
    dnsMocks.lookup.mockReset();
    dnsMocks.lookup.mockResolvedValue({ address: "93.184.216.34", family: 4 });
    vi.unstubAllGlobals();
  });

  it("extracts title and readable text from a web page", async () => {
    const fetchMock = vi.fn(async () => new Response(
      "<html><head><title>Awesome LLM Apps</title><meta name=\"description\" content=\"A curated list of LLM apps.\"></head><body><main><h1>Awesome LLM Apps</h1><p>Build agents and automations with practical examples.</p></main></body></html>",
      { status: 200, headers: { "content-type": "text/html" } },
    ));
    vi.stubGlobal("fetch", fetchMock);

    const extracted = await extractGenericWebLink({
      originalUrl: "https://github.com/Shubhamsaboo/awesome-llm-apps",
      normalizedUrl: "https://github.com/Shubhamsaboo/awesome-llm-apps",
    });

    expect(extracted).toEqual(expect.objectContaining({
      platform: "web",
      title: "Awesome LLM Apps",
      originalUrl: "https://github.com/Shubhamsaboo/awesome-llm-apps",
      normalizedUrl: "https://github.com/Shubhamsaboo/awesome-llm-apps",
      text: expect.stringContaining("Build agents and automations"),
    }));
  });

  it("blocks private network targets before fetching", async () => {
    dnsMocks.lookup.mockResolvedValue({ address: "127.0.0.1", family: 4 });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(extractGenericWebLink({
      originalUrl: "http://localhost:3000/admin",
      normalizedUrl: "http://localhost:3000/admin",
    })).rejects.toThrow("private or local network");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects non-text responses", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("binary", { status: 200, headers: { "content-type": "application/octet-stream" } })));

    await expect(extractGenericWebLink({
      originalUrl: "https://example.com/file.bin",
      normalizedUrl: "https://example.com/file.bin",
    })).rejects.toThrow("Unsupported generic web content type");
  });
});

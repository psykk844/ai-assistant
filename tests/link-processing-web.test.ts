import { describe, expect, it, vi } from "vitest";
import { extractGenericWebLink } from "../lib/link-processing/web";

describe("generic web link extraction", () => {
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
});

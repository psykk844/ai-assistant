import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchLinkSummary } from "../lib/items/link-summary";

const priorApiKey = process.env.OARS_API_KEY;
const priorBaseUrl = process.env.OARS_BASE_URL;
const priorLinkSummaryModel = process.env.OARS_LINK_SUMMARY_MODEL;
const priorModel = process.env.OARS_MODEL;

afterEach(() => {
  restoreEnv("OARS_API_KEY", priorApiKey);
  restoreEnv("OARS_BASE_URL", priorBaseUrl);
  restoreEnv("OARS_LINK_SUMMARY_MODEL", priorLinkSummaryModel);
  restoreEnv("OARS_MODEL", priorModel);
  vi.unstubAllGlobals();
});

describe("link metadata summary", () => {
  it("uses the dedicated link summary model instead of the general OARS model", async () => {
    process.env.OARS_API_KEY = "test-oars-key";
    process.env.OARS_BASE_URL = "https://oars.example.test/v1";
    process.env.OARS_MODEL = "slow-general-model";
    delete process.env.OARS_LINK_SUMMARY_MODEL;
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(pageHtml(), { status: 200, headers: { "content-type": "text/html" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: "Short useful summary." } }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchLinkSummary("https://example.com/article");

    expect(result.ai_summary).toBe("Short useful summary.");
    const aiBody = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
    expect(aiBody.model).toBe("claude-sonnet-4-6");
  });
});

function pageHtml() {
  return `<!doctype html>
    <html>
      <head><title>Example Article</title></head>
      <body>${"Useful article text. ".repeat(20)}</body>
    </html>`;
}

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
    return;
  }

  process.env[key] = value;
}

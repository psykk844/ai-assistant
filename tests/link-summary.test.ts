import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchLinkSummary } from "../lib/items/link-summary";

const priorQuatarlyApiKey = process.env.QUATARLY_API_KEY;
const priorQuatarlyBaseUrl = process.env.QUATARLY_OPENAI_BASE_URL;
const priorLinkSummaryModel = process.env.QUATARLY_LINK_SUMMARY_MODEL;
const priorModel = process.env.QUATARLY_MODEL;

afterEach(() => {
  restoreEnv("QUATARLY_API_KEY", priorQuatarlyApiKey);
  restoreEnv("QUATARLY_OPENAI_BASE_URL", priorQuatarlyBaseUrl);
  restoreEnv("QUATARLY_LINK_SUMMARY_MODEL", priorLinkSummaryModel);
  restoreEnv("QUATARLY_MODEL", priorModel);
  vi.unstubAllGlobals();
});

describe("link metadata summary", () => {
  it("uses Quatarly credentials and the default Sonnet 4.6 thinking model", async () => {
    process.env.QUATARLY_API_KEY = "test-quatarly-key";
    process.env.QUATARLY_OPENAI_BASE_URL = "https://api.quatarly.example/v1";
    process.env.QUATARLY_MODEL = "claude-sonnet-4-6-thinking";
    delete process.env.QUATARLY_LINK_SUMMARY_MODEL;
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(pageHtml(), { status: 200, headers: { "content-type": "text/html" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ summary: "Short useful summary." }) } }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchLinkSummary("https://example.com/article");

    expect(result.ai_summary).toBe("Short useful summary.");
    const aiBody = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
    expect(aiBody.model).toBe("claude-sonnet-4-6-thinking");
    expect(aiBody.response_format).toEqual({ type: "json_object" });
  });

  it("uses the dedicated Quatarly link summary model when configured", async () => {
    process.env.QUATARLY_API_KEY = "test-quatarly-key";
    process.env.QUATARLY_OPENAI_BASE_URL = "https://api.quatarly.example/v1/";
    process.env.QUATARLY_LINK_SUMMARY_MODEL = "claude-sonnet-4-6-thinking";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(pageHtml(), { status: 200, headers: { "content-type": "text/html" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ summary: "Quatarly summary." }) } }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchLinkSummary("https://example.com/article");

    expect(result.ai_summary).toBe("Quatarly summary.");
    expect(fetchMock.mock.calls[1][0]).toBe("https://api.quatarly.example/v1/chat/completions");
    const init = fetchMock.mock.calls[1][1] as RequestInit;
    expect(init.headers).toEqual({ "Content-Type": "application/json", Authorization: "Bearer test-quatarly-key" });
    const body = JSON.parse(String(init.body));
    expect(body.model).toBe("claude-sonnet-4-6-thinking");
    expect(body.response_format).toEqual({ type: "json_object" });
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

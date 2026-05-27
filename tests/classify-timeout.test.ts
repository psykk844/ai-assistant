import { afterEach, describe, expect, it, vi } from "vitest";
import { classifySmartInput } from "../lib/smart/classify-with-ai";

describe("classifySmartInput timeout fallback", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    delete process.env.QUATARLY_API_KEY;
    delete process.env.QUATARLY_CLASSIFY_TIMEOUT_MS;
  });

  it("falls back when the AI classifier does not respond before the timeout", async () => {
    vi.useFakeTimers();
    process.env.QUATARLY_API_KEY = "test-key";
    process.env.QUATARLY_CLASSIFY_TIMEOUT_MS = "50";

    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init?: RequestInit) => {
        return new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
        });
      }),
    );

    const classification = classifySmartInput("buy milk tomorrow");
    await vi.runOnlyPendingTimersAsync();

    await expect(classification).resolves.toMatchObject({
      metadata: expect.objectContaining({ fallbackReason: "quatarly-request-timeout" }),
    });
  });

  it("keeps the timeout active while reading a stalled AI response body", async () => {
    vi.useFakeTimers();
    process.env.QUATARLY_API_KEY = "test-key";
    process.env.QUATARLY_CLASSIFY_TIMEOUT_MS = "50";

    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init?: RequestInit) => {
        return Promise.resolve({
          ok: true,
          json: () =>
            new Promise((_resolve, reject) => {
              init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
            }),
        });
      }),
    );

    const classification = classifySmartInput("buy milk tomorrow");
    await vi.runOnlyPendingTimersAsync();

    await expect(classification).resolves.toMatchObject({
      metadata: expect.objectContaining({ fallbackReason: "quatarly-request-timeout" }),
    });
  });
});

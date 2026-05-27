import { afterEach, describe, expect, it, vi } from "vitest";
import { classifyInput } from "../lib/smart/classifier";
import { classifySmartInput } from "../lib/smart/classify-with-ai";

const mixedLinkEntry =
  "better museletter template: https://chatgpt.com/share/6a116825-9bc8-8323-82da-cddb7a8a13c6 https://mail.google.com/mail/u/0/?hl=en#starred/message";

describe("URL content classification", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.QUATARLY_API_KEY;
  });

  it("classifies a bare URL as a link", () => {
    expect(classifyInput("https://example.com/article")).toMatchObject({ type: "link" });
  });

  it("does not classify mixed text and links as a link", () => {
    expect(classifyInput(mixedLinkEntry)).toMatchObject({ type: "note" });
  });

  it("does not let AI override mixed text and links into a link", async () => {
    process.env.QUATARLY_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      type: "link",
                      confidenceScore: 0.99,
                      needsReview: false,
                      priorityScore: 0.6,
                      title: "ChatGPT - Unsubscribe Tracking Instantly AI",
                      metadata: { contentType: "web_link" },
                    }),
                  },
                },
              ],
            }),
        } as Response),
      ),
    );

    await expect(classifySmartInput(mixedLinkEntry)).resolves.toMatchObject({
      type: "note",
    });
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  processLinkBatch: vi.fn(),
}));

vi.mock("../lib/link-processing/process-batch", () => ({
  processLinkBatch: mocks.processLinkBatch,
}));

describe("background link processing trigger", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mocks.processLinkBatch.mockResolvedValue({ scanned: 0, processed: 0, summarized: 0, failed: 0, duplicates: 0, skipped: 0, errors: [] });
  });

  it("schedules one batch after standalone URL items are inserted", async () => {
    const { scheduleLinkProcessingForInsertedItems } = await import("../lib/link-processing/background");

    scheduleLinkProcessingForInsertedItems([
      { id: "item-1", content: "https://github.com/Shubhamsaboo/awesome-llm-apps" },
    ]);

    expect(mocks.processLinkBatch).not.toHaveBeenCalled();
    await vi.runOnlyPendingTimersAsync();

    expect(mocks.processLinkBatch).toHaveBeenCalledWith({ limit: 1 });
  });

  it("does not schedule processing for text items with embedded links", async () => {
    const { scheduleLinkProcessingForInsertedItems } = await import("../lib/link-processing/background");

    scheduleLinkProcessingForInsertedItems([
      { id: "item-1", content: "Read this later https://github.com/Shubhamsaboo/awesome-llm-apps" },
    ]);
    await vi.runOnlyPendingTimersAsync();

    expect(mocks.processLinkBatch).not.toHaveBeenCalled();
  });

  it("coalesces multiple standalone URLs into one bounded batch", async () => {
    const { scheduleLinkProcessingForInsertedItems } = await import("../lib/link-processing/background");

    scheduleLinkProcessingForInsertedItems([
      { id: "item-1", content: "https://example.com/one" },
      { id: "item-2", content: "https://example.com/two" },
      { id: "item-3", content: "plain note" },
    ]);
    await vi.runOnlyPendingTimersAsync();

    expect(mocks.processLinkBatch).toHaveBeenCalledTimes(1);
    expect(mocks.processLinkBatch).toHaveBeenCalledWith({ limit: 2 });
  });
});

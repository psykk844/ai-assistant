import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  processLinkBatch: vi.fn(),
}));

vi.mock("@/lib/link-processing/process-batch", () => ({
  processLinkBatch: mocks.processLinkBatch,
}));

describe("process links job route", () => {
  beforeEach(() => {
    mocks.processLinkBatch.mockReset();
    delete process.env.LINK_PROCESS_JOB_SECRET;
    delete process.env.CRON_SECRET;
  });

  it("exports force-dynamic rendering", async () => {
    const route = await import("../app/api/jobs/process-links/route");

    expect(route.dynamic).toBe("force-dynamic");
  });

  it("rejects requests when the job secret is missing without running the batch", async () => {
    const { POST } = await import("../app/api/jobs/process-links/route");

    const response = await POST(request({ authorization: "Bearer anything" }));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({ ok: false, error: "Unauthorized" });
    expect(mocks.processLinkBatch).not.toHaveBeenCalled();
  });

  it("rejects requests with a mismatched bearer token without running the batch", async () => {
    process.env.LINK_PROCESS_JOB_SECRET = "expected-secret";
    const { POST } = await import("../app/api/jobs/process-links/route");

    const response = await POST(request({ authorization: "Bearer wrong-secret" }));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({ ok: false, error: "Unauthorized" });
    expect(mocks.processLinkBatch).not.toHaveBeenCalled();
  });

  it("rejects requests with no authorization header without running the batch", async () => {
    process.env.LINK_PROCESS_JOB_SECRET = "expected-secret";
    const { POST } = await import("../app/api/jobs/process-links/route");

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({ ok: false, error: "Unauthorized" });
    expect(mocks.processLinkBatch).not.toHaveBeenCalled();
  });

  it("runs the batch and returns its summary for authorized requests", async () => {
    process.env.LINK_PROCESS_JOB_SECRET = "expected-secret";
    const summary = { scanned: 1, processed: 1, summarized: 1, failed: 0, duplicates: 0, skipped: 0, errors: [] };
    mocks.processLinkBatch.mockResolvedValue(summary);
    const { POST } = await import("../app/api/jobs/process-links/route");

    const response = await POST(request({ authorization: "Bearer expected-secret" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true, summary });
    expect(mocks.processLinkBatch).toHaveBeenCalledTimes(1);
  });

  it("accepts the existing CRON_SECRET as a fallback job secret", async () => {
    process.env.CRON_SECRET = "cron-secret";
    const summary = { scanned: 0, processed: 0, summarized: 0, failed: 0, duplicates: 0, skipped: 0, errors: [] };
    mocks.processLinkBatch.mockResolvedValue(summary);
    const { POST } = await import("../app/api/jobs/process-links/route");

    const response = await POST(request({ authorization: "Bearer cron-secret" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true, summary });
    expect(mocks.processLinkBatch).toHaveBeenCalledTimes(1);
  });

  it("returns a 500 response when the batch throws", async () => {
    process.env.LINK_PROCESS_JOB_SECRET = "expected-secret";
    mocks.processLinkBatch.mockRejectedValue(new Error("batch failed"));
    const { POST } = await import("../app/api/jobs/process-links/route");

    const response = await POST(request({ authorization: "Bearer expected-secret" }));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({ ok: false, error: "batch failed" });
  });
});

function request(headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/jobs/process-links", { method: "POST", headers });
}

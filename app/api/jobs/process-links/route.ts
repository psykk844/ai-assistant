import { NextResponse } from "next/server";
import { processLinkBatch } from "@/lib/link-processing/process-batch";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const secrets = [process.env.LINK_PROCESS_JOB_SECRET, process.env.CRON_SECRET].filter(
    (value): value is string => typeof value === "string" && value.trim().length > 0,
  );
  const authorization = request.headers.get("authorization");

  if (secrets.length === 0 || !secrets.some((secret) => authorization === `Bearer ${secret}`)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const summary = await processLinkBatch();
    return NextResponse.json({ ok: true, summary });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

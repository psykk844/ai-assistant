import { NextResponse } from "next/server";
import { classifySmartInput } from "@/lib/smart/classify-with-ai";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { content?: string };
    const content = String(body.content ?? "").trim();

    if (!content) {
      return NextResponse.json({ error: "content is required" }, { status: 400 });
    }

    const classification = await classifySmartInput(content);
    return NextResponse.json({ classification });
  } catch {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }
}

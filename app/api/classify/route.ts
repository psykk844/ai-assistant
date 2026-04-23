import { NextResponse } from "next/server";
import { classifySmartInput } from "@/lib/smart/classify-with-ai";
import { buildPreferenceContext } from "@/lib/smart/user-preferences";
import { resolveSessionUserId } from "@/lib/auth/session-user";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { content?: string };
    const content = String(body.content ?? "").trim();

    if (!content) {
      return NextResponse.json({ error: "content is required" }, { status: 400 });
    }

    let preferenceContext: string | undefined;
    try {
      const userId = await resolveSessionUserId();
      preferenceContext = await buildPreferenceContext(userId) || undefined;
    } catch {
      // No session or preferences table not ready — classify without preferences
    }

    const classification = await classifySmartInput(content, preferenceContext);
    return NextResponse.json({ classification });
  } catch {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }
}

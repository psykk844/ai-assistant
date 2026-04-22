import { NextResponse } from "next/server";
import { chatWithContext } from "@/lib/ai/oars";

type SuggestTagsBody = {
  content?: string;
  title?: string;
  type?: string;
};

function normalizeTag(tag: string) {
  return tag.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

function parseArray(text: string) {
  const cleaned = text.trim().replace(/^```json\s*/i, "").replace(/^```/, "").replace(/```$/, "").trim();
  try {
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry) => (typeof entry === "string" ? normalizeTag(entry) : ""))
      .filter(Boolean)
      .slice(0, 3);
  } catch {
    return [];
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SuggestTagsBody;
    const content = String(body.content ?? "").trim();
    const title = String(body.title ?? "").trim();
    const type = String(body.type ?? "").trim();

    if (!content) {
      return NextResponse.json({ error: "content is required", tags: [] }, { status: 400 });
    }

    const contentText = await chatWithContext(
      "Return only a strict JSON array of 1 to 3 lowercase hyphenated tags for this item.",
      [`Type: ${type || "unknown"}\nTitle: ${title || "(none)"}\nContent: ${content}`],
    );
    const tags = parseArray(contentText);
    return NextResponse.json({ tags });
  } catch {
    return NextResponse.json({ tags: [] });
  }
}

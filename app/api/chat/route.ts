import { NextResponse } from "next/server";
import { assertApiSession } from "@/lib/auth/api-session";
import { resolveSessionUserId } from "@/lib/auth/session-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { chatWithContext, embedText } from "@/lib/ai/oars";
import { searchPoints } from "@/lib/qdrant/client";

export async function POST(request: Request) {
  try {
    await assertApiSession();
    const userId = await resolveSessionUserId();

    const body = (await request.json()) as { question?: string };
    const question = String(body.question ?? "").trim();
    if (!question) return NextResponse.json({ ok: false, error: "question-required" }, { status: 400 });

    const embedding = await embedText(question);

    const [vaultResults, itemResults] = embedding
      ? await Promise.all([
          searchPoints("vault_notes", embedding, 6, {
            must: [{ key: "user_id", match: { value: userId } }],
          }),
          searchPoints("link_embeddings", embedding, 6, {
            must: [{ key: "user_id", match: { value: userId } }],
          }),
        ])
      : [[], []];

    const admin = createAdminClient();
    const { data: lexical } = await admin
      .from("items")
      .select("id,title,content")
      .eq("user_id", userId)
      .or(`title.ilike.%${question}%,content.ilike.%${question}%`)
      .limit(4);

    const citations: Array<{ source: string; label: string; excerpt: string }> = [];

    for (const row of vaultResults.slice(0, 4)) {
      const payload = (row.payload ?? {}) as Record<string, unknown>;
      citations.push({
        source: "vault",
        label: String(payload.filepath ?? payload.title ?? "vault"),
        excerpt: String(payload.chunk ?? "").slice(0, 280),
      });
    }

    for (const row of itemResults.slice(0, 4)) {
      const payload = (row.payload ?? {}) as Record<string, unknown>;
      citations.push({
        source: "inbox",
        label: String(payload.title ?? "item"),
        excerpt: String(payload.content ?? "").slice(0, 280),
      });
    }

    for (const row of lexical ?? []) {
      citations.push({
        source: "inbox",
        label: String(row.title ?? "item"),
        excerpt: String(row.content ?? "").slice(0, 280),
      });
    }

    const context = citations.map((c) => `[${c.source}] ${c.label}
${c.excerpt}`);
    const answer = await chatWithContext(question, context);

    return NextResponse.json({ ok: true, answer, citations: citations.slice(0, 10) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "chat-failed" }, { status: 500 });
  }
}

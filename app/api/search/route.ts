import { NextResponse } from "next/server";
import { assertApiSession } from "@/lib/auth/api-session";
import { resolveSessionUserId } from "@/lib/auth/session-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { embedText } from "@/lib/ai/oars";
import { searchPoints } from "@/lib/qdrant/client";

export async function GET(request: Request) {
  try {
    await assertApiSession();
    const userId = await resolveSessionUserId();

    const { searchParams } = new URL(request.url);
    const query = String(searchParams.get("q") ?? "").trim();
    if (!query) return NextResponse.json({ ok: true, results: [] });

    const embedding = await embedText(query);

    const [vaultResults, itemVectorResults] = embedding
      ? await Promise.all([
          searchPoints("vault_notes", embedding, 7, {
            must: [{ key: "user_id", match: { value: userId } }],
          }),
          searchPoints("link_embeddings", embedding, 7, {
            must: [{ key: "user_id", match: { value: userId } }],
          }),
        ])
      : [[], []];

    const admin = createAdminClient();
    const { data: lexicalMatches } = await admin
      .from("items")
      .select("id, type, title, content, status, priority_score, confidence_score, needs_review, created_at")
      .eq("user_id", userId)
      .or(`title.ilike.%${query}%,content.ilike.%${query}%`)
      .limit(10);

    const mapped = [
      ...(lexicalMatches ?? []).map((item) => ({
        source: "inbox",
        score: 1,
        item,
      })),
      ...itemVectorResults.map((result) => ({
        source: "inbox-vector",
        score: Number(result.score ?? 0),
        item: {
          id: String((result.payload as Record<string, unknown> | undefined)?.item_id ?? ""),
          title: String((result.payload as Record<string, unknown> | undefined)?.title ?? "Untitled"),
          content: String((result.payload as Record<string, unknown> | undefined)?.content ?? ""),
          type: String((result.payload as Record<string, unknown> | undefined)?.type ?? "note"),
          status: String((result.payload as Record<string, unknown> | undefined)?.status ?? "active"),
        },
      })),
      ...vaultResults.map((result) => ({
        source: "vault",
        score: Number(result.score ?? 0),
        item: {
          id: String((result.payload as Record<string, unknown> | undefined)?.filepath ?? ""),
          title: String((result.payload as Record<string, unknown> | undefined)?.title ?? "Vault note"),
          content: String((result.payload as Record<string, unknown> | undefined)?.chunk ?? ""),
          type: "note",
          status: "active",
          filepath: String((result.payload as Record<string, unknown> | undefined)?.filepath ?? ""),
        },
      })),
    ];

    return NextResponse.json({ ok: true, results: mapped.slice(0, 20) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "search-failed" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { assertApiSession } from "@/lib/auth/api-session";
import { resolveSessionUserId } from "@/lib/auth/session-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { embedText } from "@/lib/ai/oars";
import { searchPoints } from "@/lib/qdrant/client";

function normalizeQuery(query: string) {
  const lowered = query.toLowerCase();
  return lowered
    .replace(/\?/g, " ")
    .replace(/(do|i|have|any|my|the|a|an|about|for|to|please|show|me|notes|note)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueByKey<T>(rows: T[], keyFn: (row: T) => string) {
  const seen = new Set<string>();
  const output: T[] = [];
  for (const row of rows) {
    const key = keyFn(row);
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(row);
  }
  return output;
}

export async function GET(request: Request) {
  try {
    await assertApiSession();
    const userId = await resolveSessionUserId();

    const { searchParams } = new URL(request.url);
    const originalQuery = String(searchParams.get("q") ?? "").trim();
    if (!originalQuery) return NextResponse.json({ ok: true, results: [] });

    const normalized = normalizeQuery(originalQuery) || originalQuery;
    const lexicalNeedle = normalized || originalQuery;

    const embedding = await embedText(`${originalQuery}
${normalized}`);

    const [vaultResults, itemVectorResults] = embedding
      ? await Promise.all([
          searchPoints("vault_notes", embedding, 16, {
            must: [{ key: "user_id", match: { value: userId } }],
          }),
          searchPoints("link_embeddings", embedding, 16, {
            must: [{ key: "user_id", match: { value: userId } }],
          }),
        ])
      : [[], []];

    const admin = createAdminClient();
    const { data: lexicalMatches } = await admin
      .from("items")
      .select("id, type, title, content, status, priority_score, confidence_score, needs_review, created_at")
      .eq("user_id", userId)
      .or(`title.ilike.%${lexicalNeedle}%,content.ilike.%${lexicalNeedle}%`)
      .limit(20);

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

    const deduped = uniqueByKey(mapped, (entry) => `${entry.source}:${entry.item.id}:${entry.item.title}`);

    return NextResponse.json({
      ok: true,
      results: deduped.slice(0, 24),
      meta: {
        query: originalQuery,
        normalized,
        vaultHits: vaultResults.length,
        inboxVectorHits: itemVectorResults.length,
        lexicalHits: (lexicalMatches ?? []).length,
      },
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "search-failed" }, { status: 500 });
  }
}

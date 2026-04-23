import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireHardcodedSession } from "@/lib/auth/session";
import { resolveSessionUserId } from "@/lib/auth/session-user";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get("q")?.trim();
  if (!query) return NextResponse.json({ results: [] });

  await requireHardcodedSession();
  const userId = await resolveSessionUserId();
  const supabase = createAdminClient();

  // Fetch all active items (small dataset — scales to ~500 items fine)
  const { data: allItems, error } = await supabase
    .from("items")
    .select("id, type, title, content, status, priority_score, metadata, created_at, updated_at")
    .eq("user_id", userId)
    .in("status", ["active", "completed"])
    .order("created_at", { ascending: false })
    .limit(200);

  if (error || !allItems?.length) {
    return NextResponse.json({ results: [], lexical_hits: 0, ai_hits: 0 });
  }

  // Step 1: Quick lexical pre-filter for exact/substring matches
  const lowerQuery = query.toLowerCase();
  const queryWords = lowerQuery.split(/\s+/).filter(w => w.length > 2);

  const lexicalMatches = allItems.filter(item => {
    const text = `${item.title ?? ""} ${item.content}`.toLowerCase();
    return queryWords.some(word => text.includes(word));
  });

  // Step 2: AI semantic ranking — send query + items to LLM
  let aiRankedIds: string[] = [];
  try {
    const baseUrl = process.env.OARS_BASE_URL ?? "https://llm.digiwebfr.studio/v1";
    const apiKey = process.env.OARS_API_KEY ?? "";
    const model = process.env.OARS_MODEL ?? "claude-sonnet-4-6";

    if (apiKey) {
      // Build compact item summaries for the LLM
      const itemSummaries = allItems.map(item => ({
        id: item.id,
        type: item.type,
        title: item.title ?? "(untitled)",
        content: (item.content ?? "").slice(0, 200),
        status: item.status,
      }));

      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          max_tokens: 300,
          temperature: 0,
          messages: [
            {
              role: "system",
              content: `You are a search relevance engine. Given a user query and a list of items, return ONLY the IDs of items that are relevant to the query, ranked from most to least relevant. Return a JSON array of ID strings. If nothing is relevant, return []. Be generous — include items that are even loosely related. Consider semantic meaning, not just keyword matching.`,
            },
            {
              role: "user",
              content: `Query: "${query}"\n\nItems:\n${JSON.stringify(itemSummaries, null, 0)}`,
            },
          ],
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const content = data.choices?.[0]?.message?.content ?? "[]";
        // Extract JSON array from response (may have markdown fencing)
        const jsonMatch = content.match(/\[[\s\S]*?\]/);
        if (jsonMatch) {
          aiRankedIds = JSON.parse(jsonMatch[0]);
        }
      }
    }
  } catch (err) {
    console.error("[search] AI ranking failed:", err);
  }

  // Step 3: Merge results — AI ranked first, then lexical matches, deduplicated
  const seen = new Set<string>();
  const results: Array<{
    source: string;
    score: number;
    item: {
      id: string;
      title: string;
      content: string;
      type: string;
      status: string;
    };
  }> = [];

  // AI-ranked results first (highest relevance)
  for (let i = 0; i < aiRankedIds.length; i++) {
    const id = aiRankedIds[i];
    if (seen.has(id)) continue;
    seen.add(id);
    const item = allItems.find(it => it.id === id);
    if (!item) continue;
    results.push({
      source: "ai",
      score: 1.0 - (i * 0.05), // Decreasing score by rank
      item: {
        id: item.id,
        title: item.title ?? "Untitled",
        content: item.content,
        type: item.type,
        status: item.status,
      },
    });
  }

  // Lexical matches that AI missed
  for (const item of lexicalMatches) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    results.push({
      source: "lexical",
      score: 0.5,
      item: {
        id: item.id,
        title: item.title ?? "Untitled",
        content: item.content,
        type: item.type,
        status: item.status,
      },
    });
  }

  return NextResponse.json({
    results: results.slice(0, 24),
    lexical_hits: lexicalMatches.length,
    ai_hits: aiRankedIds.length,
  });
}

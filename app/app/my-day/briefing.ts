import type { InboxItem } from "@/lib/items/types";

export interface BriefingContext {
  totalToday: number;
  topFocus: string | null;
  overdueCount: number;
  overdueItems: { id: string; title: string | null }[];
  staleItems: { id: string; title: string | null; daysSinceUpdate: number }[];
}

export function buildBriefingContext(
  todayItems: InboxItem[],
  overdueItems: InboxItem[],
  staleItems: InboxItem[]
): BriefingContext {
  const sorted = [...todayItems].sort((a, b) => b.priority_score - a.priority_score);
  const today = new Date();

  return {
    totalToday: todayItems.length,
    topFocus: sorted[0]?.title ?? null,
    overdueCount: overdueItems.length,
    overdueItems: overdueItems.map((i) => ({ id: i.id, title: i.title })),
    staleItems: staleItems.map((i) => {
      const updated = new Date(i.updated_at ?? i.created_at);
      const daysSinceUpdate = Math.floor((today.getTime() - updated.getTime()) / (1000 * 60 * 60 * 24));
      return { id: i.id, title: i.title, daysSinceUpdate };
    }),
  };
}

export function buildFallbackBriefing(
  todayItems: InboxItem[],
  overdueItems: InboxItem[],
  staleItems: InboxItem[]
): string {
  const ctx = buildBriefingContext(todayItems, overdueItems, staleItems);
  const lines: string[] = [];

  if (ctx.totalToday > 0) {
    lines.push(`You have **${ctx.totalToday} tasks** today.`);
    if (ctx.topFocus) {
      lines.push(`Your #1 focus: **${ctx.topFocus}**`);
    }
  } else {
    lines.push("No tasks scheduled for today. Time to plan or relax!");
  }

  if (ctx.overdueCount > 0) {
    const names = ctx.overdueItems.map((i) => i.title ?? "Untitled").join(", ");
    lines.push(`⚠️ ${ctx.overdueCount} overdue: ${names}`);
  }

  if (ctx.staleItems.length > 0) {
    for (const item of ctx.staleItems.slice(0, 3)) {
      lines.push(`💡 "${item.title}" has been waiting ${item.daysSinceUpdate} days — move to Today?`);
    }
  }

  return lines.join("\n");
}

export async function generateAIBriefing(
  todayItems: InboxItem[],
  overdueItems: InboxItem[],
  staleItems: InboxItem[]
): Promise<string> {
  const ctx = buildBriefingContext(todayItems, overdueItems, staleItems);

  try {
    const baseUrl = process.env.OARS_BASE_URL ?? "https://llm.digiwebfr.studio/v1";
    const apiKey = process.env.OARS_API_KEY ?? "";
    const model = process.env.OARS_MODEL ?? "claude-opus-4-6";

    if (!apiKey) return buildFallbackBriefing(todayItems, overdueItems, staleItems);

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        max_tokens: 200,
        messages: [
          {
            role: "system",
            content: "You are a friendly ADHD-aware productivity assistant. Generate a brief morning check-in (2-4 sentences). Be encouraging, specific about tasks, mention overdue items gently. No markdown formatting — plain text only.",
          },
          {
            role: "user",
            content: JSON.stringify(ctx),
          },
        ],
      }),
    });

    if (!response.ok) return buildFallbackBriefing(todayItems, overdueItems, staleItems);

    const data = await response.json();
    return data.choices?.[0]?.message?.content ?? buildFallbackBriefing(todayItems, overdueItems, staleItems);
  } catch {
    return buildFallbackBriefing(todayItems, overdueItems, staleItems);
  }
}

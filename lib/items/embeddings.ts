import { embedText } from "@/lib/ai/oars";
import { ensureCollection, upsertPoints } from "@/lib/qdrant/client";
import { createHash } from "node:crypto";

type EmbeddableItem = {
  id: string;
  user_id: string;
  title: string | null;
  content: string;
  type: string;
  status: string;
};

export async function indexItemsInVectorStore(items: EmbeddableItem[]) {
  if (items.length === 0) return;

  await ensureCollection("link_embeddings", 1536);

  const points: Array<{ id: string; vector: number[]; payload: Record<string, unknown> }> = [];

  for (const item of items) {
    const text = `${item.title ?? "Untitled"}
${item.content}`.trim();
    const embedding = await embedText(text);
    if (!embedding) continue;

    points.push({
      id: hashId(item.id),
      vector: embedding,
      payload: {
        user_id: item.user_id,
        item_id: item.id,
        title: item.title ?? "Untitled",
        content: item.content,
        type: item.type,
        status: item.status,
        source: "item",
      },
    });
  }

  await upsertPoints("link_embeddings", points);
}

function hashId(input: string) {
  return createHash("sha1").update(input).digest("hex");
}

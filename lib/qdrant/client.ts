const DEFAULT_QDRANT_URL = "http://127.0.0.1:6333";

function qdrantHeaders() {
  const apiKey = process.env.QDRANT_API_KEY?.trim();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) headers["api-key"] = apiKey;
  return headers;
}

function qdrantBaseUrl() {
  return (process.env.QDRANT_URL?.trim() || DEFAULT_QDRANT_URL).replace(/\/$/, "");
}

export async function ensureCollection(name: string, vectorSize = 1536) {
  const base = qdrantBaseUrl();
  const headers = qdrantHeaders();

  const exists = await fetch(`${base}/collections/${name}`, { headers, cache: "no-store" });
  if (exists.ok) return;

  await fetch(`${base}/collections/${name}`, {
    method: "PUT",
    headers,
    body: JSON.stringify({
      vectors: {
        size: vectorSize,
        distance: "Cosine",
      },
    }),
    cache: "no-store",
  });
}

export async function upsertPoints(
  collection: string,
  points: Array<{ id: string; vector: number[]; payload: Record<string, unknown> }>,
) {
  if (points.length === 0) return;

  const base = qdrantBaseUrl();
  const headers = qdrantHeaders();

  await fetch(`${base}/collections/${collection}/points?wait=true`, {
    method: "PUT",
    headers,
    body: JSON.stringify({ points }),
    cache: "no-store",
  });
}

export async function searchPoints(
  collection: string,
  vector: number[],
  limit: number,
  filter?: Record<string, unknown>,
) {
  const base = qdrantBaseUrl();
  const headers = qdrantHeaders();

  const response = await fetch(`${base}/collections/${collection}/points/search`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      vector,
      limit,
      with_payload: true,
      filter,
    }),
    cache: "no-store",
  });

  if (!response.ok) return [] as Array<Record<string, unknown>>;

  const payload = (await response.json()) as { result?: Array<Record<string, unknown>> };
  return payload.result ?? [];
}

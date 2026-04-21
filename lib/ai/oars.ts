type EmbeddingResponse = {
  data?: Array<{ embedding?: number[] }>;
};

export async function embedText(input: string): Promise<number[] | null> {
  const apiKey = process.env.OARS_API_KEY?.trim();
  if (!apiKey) return deterministicEmbedding(input);

  const baseUrl = (process.env.OARS_BASE_URL?.trim() || "https://llm.digiwebfr.studio/v1").replace(/\/$/, "");
  const model = process.env.OARS_EMBED_MODEL?.trim() || "text-embedding-3-small";

  try {
    const response = await fetch(`${baseUrl}/embeddings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        input,
      }),
      cache: "no-store",
    });

    if (!response.ok) return deterministicEmbedding(input);
    const payload = (await response.json()) as EmbeddingResponse;
    const embedding = payload.data?.[0]?.embedding;
    if (!Array.isArray(embedding) || embedding.length === 0) return deterministicEmbedding(input);
    return embedding.map((v) => Number(v) || 0);
  } catch {
    return deterministicEmbedding(input);
  }
}

export async function chatWithContext(question: string, contextBlocks: string[]): Promise<string> {
  const apiKey = process.env.OARS_API_KEY?.trim();
  if (!apiKey) {
    return `I could not reach the AI provider. Here is the relevant context:\n\n${contextBlocks.slice(0, 4).join("\n\n---\n\n")}`;
  }

  const baseUrl = (process.env.OARS_BASE_URL?.trim() || "https://llm.digiwebfr.studio/v1").replace(/\/$/, "");
  const model = process.env.OARS_MODEL?.trim() || "claude-opus-4-6";

  const system = "You are a grounded productivity assistant. Answer using only provided context when possible. Cite sources with [source] markers.";
  const context = contextBlocks.length
    ? contextBlocks.map((c, i) => `Source ${i + 1}: ${c}`).join("\n\n")
    : "No context found.";

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        messages: [
          { role: "system", content: system },
          { role: "user", content: `Context:
${context}

Question:
${question}` },
        ],
      }),
      cache: "no-store",
    });

    if (!response.ok) return `AI provider returned HTTP ${response.status}.`;

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return payload.choices?.[0]?.message?.content?.trim() || "No answer generated.";
  } catch {
    return "AI request failed.";
  }
}

function deterministicEmbedding(input: string): number[] {
  const values = new Array<number>(1536).fill(0);
  for (let i = 0; i < input.length; i += 1) {
    const index = i % values.length;
    values[index] += input.charCodeAt(i) / 255;
  }
  const norm = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0)) || 1;
  return values.map((value) => value / norm);
}

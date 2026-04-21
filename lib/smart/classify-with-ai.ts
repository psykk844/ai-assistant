import { classifyInput, type Classification, type ItemType } from "@/lib/smart/classifier";

type AiPayload = {
  type?: string;
  confidenceScore?: number;
  needsReview?: boolean;
  priorityScore?: number;
  title?: string | null;
  metadata?: Record<string, unknown>;
};

function clamp01(value: number, fallback: number) {
  if (Number.isNaN(value)) return fallback;
  return Math.max(0, Math.min(1, value));
}

function asItemType(value: string | undefined, fallback: ItemType): ItemType {
  const normalized = String(value ?? "").toLowerCase().trim();
  if (normalized === "note") return "note";
  if (normalized === "todo" || normalized === "task") return "todo";
  if (normalized === "link" || normalized === "url") return "link";
  return fallback;
}

function parseJsonBlock(input: string): AiPayload | null {
  const trimmed = input.trim();
  const plain = trimmed.replace(/^```json\s*/i, "").replace(/^```/, "").replace(/```$/, "").trim();

  try {
    const parsed = JSON.parse(plain) as AiPayload;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function normalizeClassification(raw: AiPayload | null, fallback: Classification): Classification {
  if (!raw) return fallback;

  const confidence = clamp01(Number(raw.confidenceScore ?? fallback.confidenceScore), fallback.confidenceScore);
  const rawPriority = Number(raw.priorityScore ?? fallback.priorityScore);
  const normalizedPriority = rawPriority > 1 ? rawPriority / 10 : rawPriority;
  const priority = clamp01(normalizedPriority, fallback.priorityScore);

  return {
    type: asItemType(raw.type, fallback.type),
    confidenceScore: confidence,
    needsReview: typeof raw.needsReview === "boolean" ? raw.needsReview : confidence < 0.75,
    priorityScore: priority,
    title: typeof raw.title === "string" ? raw.title.slice(0, 90) : fallback.title,
    metadata: {
      ...fallback.metadata,
      ...(raw.metadata ?? {}),
      source: "piramyd",
    },
  };
}

export async function classifySmartInput(content: string): Promise<Classification> {
  const fallback = classifyInput(content);

  const apiKey = process.env.PIRAMYD_API_KEY;
  if (!apiKey) {
    return {
      ...fallback,
      metadata: { ...fallback.metadata, source: "stub-classifier", fallbackReason: "missing-piramyd-api-key" },
    };
  }

  const baseUrl = process.env.PIRAMYD_BASE_URL ?? "https://api.piramyd.com";
  const endpoint = process.env.PIRAMYD_CLASSIFY_ENDPOINT ?? "/v1/chat/completions";
  const model = process.env.PIRAMYD_MODEL ?? "deepseek-v3.2";

  const prompt = `Classify this personal productivity inbox entry into one of: note, todo, link. Return only strict JSON with keys: type, confidenceScore, needsReview, priorityScore, title, metadata.\n\nEntry:\n${content}`;

  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        messages: [
          {
            role: "system",
            content:
              "You classify productivity items. Output strict JSON only with: type(note|todo|link), confidenceScore(0..1), needsReview(boolean), priorityScore(0..1), title(max 90 chars), metadata(object).",
          },
          { role: "user", content: prompt },
        ],
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      return {
        ...fallback,
        metadata: {
          ...fallback.metadata,
          source: "stub-classifier",
          fallbackReason: `piramyd-http-${response.status}`,
        },
      };
    }

    const payload = (await response.json()) as Record<string, unknown>;
    const direct = (payload.classification ?? payload.output) as AiPayload | undefined;

    if (direct && typeof direct === "object") {
      return normalizeClassification(direct, fallback);
    }

    const textCandidate = (payload.choices as Array<{ message?: { content?: string } }> | undefined)?.[0]?.message?.content;
    if (typeof textCandidate === "string") {
      const parsed = parseJsonBlock(textCandidate);
      return normalizeClassification(parsed, fallback);
    }

    return {
      ...fallback,
      metadata: { ...fallback.metadata, source: "stub-classifier", fallbackReason: "unexpected-piramyd-payload" },
    };
  } catch (error) {
    return {
      ...fallback,
      metadata: {
        ...fallback.metadata,
        source: "stub-classifier",
        fallbackReason: "piramyd-request-failed",
        error: error instanceof Error ? error.message : "unknown",
      },
    };
  }
}

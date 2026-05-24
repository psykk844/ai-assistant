import { classifyInput, isStandaloneUrlInput, type Classification, type ItemType } from "@/lib/smart/classifier";

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

function getClassifyTimeoutMs() {
  const configured = Number(process.env.OARS_CLASSIFY_TIMEOUT_MS ?? 8000);
  if (!Number.isFinite(configured) || configured <= 0) return 8000;
  return configured;
}

function normalizeClassification(raw: AiPayload | null, fallback: Classification, content: string): Classification {
  if (!raw) return fallback;

  const confidence = clamp01(Number(raw.confidenceScore ?? fallback.confidenceScore), fallback.confidenceScore);
  const rawPriority = Number(raw.priorityScore ?? fallback.priorityScore);
  const normalizedPriority = rawPriority > 1 ? rawPriority / 10 : rawPriority;
  const priority = clamp01(normalizedPriority, fallback.priorityScore);
  const type = asItemType(raw.type, fallback.type);

  return {
    type: type === "link" && !isStandaloneUrlInput(content) ? fallback.type : type,
    confidenceScore: confidence,
    needsReview: typeof raw.needsReview === "boolean" ? raw.needsReview : confidence < 0.75,
    priorityScore: priority,
    title: typeof raw.title === "string" ? raw.title.slice(0, 90) : fallback.title,
    metadata: {
      ...fallback.metadata,
      ...(raw.metadata ?? {}),
      source: "oars",
    },
  };
}

export async function classifySmartInput(content: string, userPreferenceContext?: string): Promise<Classification> {
  const fallback = classifyInput(content);

  const apiKey = process.env.OARS_API_KEY;
  if (!apiKey) {
    return {
      ...fallback,
      metadata: { ...fallback.metadata, source: "stub-classifier", fallbackReason: "missing-oars-api-key" },
    };
  }

  const baseUrl = (process.env.OARS_BASE_URL ?? "https://llm.digiwebfr.studio/v1").replace(/\/$/, "");
  const model = process.env.OARS_MODEL ?? "claude-opus-4-6";

  const prompt = `Classify this personal productivity inbox entry into one of: note, todo, link. Return only strict JSON with keys: type, confidenceScore, needsReview, priorityScore, title, metadata.\n\nEntry:\n${content}`;

  const systemParts = [
    "You classify productivity items. Output strict JSON only with: type(note|todo|link), confidenceScore(0..1), needsReview(boolean), priorityScore(0..1), title(max 90 chars), metadata(object).",
  ];
  if (userPreferenceContext) {
    systemParts.push("", userPreferenceContext);
  }

  const controller = new AbortController();
  let didTimeout = false;
  const timeout = setTimeout(() => {
    didTimeout = true;
    controller.abort();
  }, getClassifyTimeoutMs());

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
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
            content: systemParts.join("\n"),
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
          fallbackReason: `oars-http-${response.status}`,
        },
      };
    }

    const payload = (await response.json()) as Record<string, unknown>;

    // OpenAI-compatible response: choices[0].message.content
    const textCandidate = (payload.choices as Array<{ message?: { content?: string } }> | undefined)?.[0]?.message?.content;
    if (typeof textCandidate === "string") {
      const parsed = parseJsonBlock(textCandidate);
      return normalizeClassification(parsed, fallback, content);
    }

    // Direct object response (some proxies)
    const direct = (payload.classification ?? payload.output) as AiPayload | undefined;
    if (direct && typeof direct === "object") {
      return normalizeClassification(direct, fallback, content);
    }

    return {
      ...fallback,
      metadata: { ...fallback.metadata, source: "stub-classifier", fallbackReason: "unexpected-oars-payload" },
    };
  } catch (error) {
    return {
      ...fallback,
      metadata: {
        ...fallback.metadata,
        source: "stub-classifier",
        fallbackReason: didTimeout ? "oars-request-timeout" : "oars-request-failed",
        error: error instanceof Error ? error.message : "unknown",
      },
    };
  } finally {
    clearTimeout(timeout);
  }
}

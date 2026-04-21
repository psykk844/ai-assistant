export type ItemType = "note" | "todo" | "link";

export type Classification = {
  type: ItemType;
  confidenceScore: number;
  needsReview: boolean;
  priorityScore: number;
  title: string | null;
  metadata: Record<string, unknown>;
};

const urlRegex = /(https?:\/\/[^\s]+)/i;
const todoRegex = /^(todo:|task:|- \[ \]|\[ \]|remember to|need to|should|must)/i;

export function classifyInput(raw: string): Classification {
  const content = raw.trim();
  const firstLine = content.split("\n")[0]?.trim() ?? "";

  if (urlRegex.test(content)) {
    const url = content.match(urlRegex)?.[0] ?? null;
    return {
      type: "link",
      confidenceScore: 0.95,
      needsReview: false,
      priorityScore: 0.6,
      title: firstLine.slice(0, 90) || "Saved link",
      metadata: { source: "stub-classifier", extractedUrl: url },
    };
  }

  if (todoRegex.test(content) || content.endsWith("?")) {
    return {
      type: "todo",
      confidenceScore: 0.78,
      needsReview: false,
      priorityScore: 0.7,
      title: firstLine.slice(0, 90) || "New task",
      metadata: { source: "stub-classifier" },
    };
  }

  const confidence = 0.72;
  return {
    type: "note",
    confidenceScore: confidence,
    needsReview: confidence < 0.75,
    priorityScore: 0.5,
    title: firstLine.slice(0, 90) || "Quick note",
    metadata: { source: "stub-classifier" },
  };
}

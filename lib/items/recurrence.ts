import type { InboxItem, RecurrenceConfig, RecurrenceFrequency } from "./types";

/**
 * Calculate the next due date after `fromDate`.
 */
export function calculateNextDue(
  frequency: RecurrenceFrequency,
  days: number[] | undefined,
  fromDate: string
): string {
  const from = new Date(fromDate + "T00:00:00Z");

  if (frequency === "daily") {
    const next = new Date(from);
    next.setUTCDate(next.getUTCDate() + 1);
    return next.toISOString().slice(0, 10);
  }

  // Weekly: find next matching day
  if (!days || days.length === 0) {
    const next = new Date(from);
    next.setUTCDate(next.getUTCDate() + 7);
    return next.toISOString().slice(0, 10);
  }

  const sortedDays = [...days].sort((a, b) => a - b);

  for (let offset = 1; offset <= 7; offset++) {
    const candidate = new Date(from);
    candidate.setUTCDate(candidate.getUTCDate() + offset);
    const jsDay = candidate.getUTCDay(); // 0=Sun, 1=Mon..6=Sat
    const ourDay = jsDay === 0 ? 7 : jsDay; // Convert: 7=Sun, 1=Mon..6=Sat
    if (sortedDays.includes(ourDay)) {
      return candidate.toISOString().slice(0, 10);
    }
  }

  const fallback = new Date(from);
  fallback.setUTCDate(fallback.getUTCDate() + 7);
  return fallback.toISOString().slice(0, 10);
}

/**
 * Check if a recurring template should generate an instance for the given date.
 */
export function shouldGenerateInstance(config: RecurrenceConfig, today: string): boolean {
  if (!config.is_template) return false;
  return config.next_due <= today;
}

/**
 * Build a new item from a recurring template.
 */
export function buildRecurringInstance(
  template: InboxItem,
  userId: string
): {
  title: string | null;
  content: string;
  type: string;
  status: string;
  priority_score: number;
  confidence_score: number | null;
  needs_review: boolean;
  user_id: string;
  tags: string[];
  metadata: Record<string, unknown>;
} {
  const templateRecurrence = (template.metadata as Record<string, unknown>)?.recurrence as
    | RecurrenceConfig
    | undefined;

  return {
    title: template.title,
    content: template.content,
    type: template.type,
    status: "active",
    priority_score: 0.9,
    confidence_score: template.confidence_score,
    needs_review: false,
    user_id: userId,
    tags: [...(template.tags ?? [])],
    metadata: {
      recurrence: {
        template_id: template.id,
        is_template: false,
        frequency: templateRecurrence?.frequency ?? "daily",
      },
    },
  };
}

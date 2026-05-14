import type { ExtractedSocialLink, SupportedPlatform } from "./types";

export type ExtractSocialLinkWithApifyInput = {
  platform: SupportedPlatform;
  originalUrl: string;
  normalizedUrl: string;
};

const APIFY_API_BASE = "https://api.apify.com/v2";
const ACTOR_ENV_KEYS: Record<SupportedPlatform, string> = {
  reddit: "APIFY_REDDIT_ACTOR",
  x: "APIFY_X_ACTOR",
  facebook: "APIFY_FACEBOOK_ACTOR",
};
const METRIC_FIELDS = ["score", "likes", "replies", "shares"] as const;
const NON_TERMINAL_RUN_STATUSES = new Set(["READY", "RUNNING", "TIMING-OUT", "ABORTING"]);

export class RetryableExtractionError extends Error {
  readonly retryable = true;
}

export function isRetryableExtractionError(error: unknown): error is RetryableExtractionError {
  return error instanceof Error && (error as { retryable?: unknown }).retryable === true;
}

export function actorNameForPlatform(platform: SupportedPlatform): string {
  const envKey = ACTOR_ENV_KEYS[platform];
  const actorName = process.env[envKey];

  if (!actorName) {
    throw new Error(`Missing ${envKey}`);
  }

  return actorName;
}

export async function extractSocialLinkWithApify(
  input: ExtractSocialLinkWithApifyInput,
): Promise<ExtractedSocialLink> {
  const token = process.env.APIFY_TOKEN || process.env.APIFY;

  if (!token) {
    throw new Error("Missing APIFY_TOKEN or APIFY");
  }

  const actorName = actorNameForPlatform(input.platform);
  const run = await startActorRun(actorName, token, input);
  const status = run.status;

  if (status !== "SUCCEEDED") {
    const statusLabel = isNonEmptyString(status) ? status : "UNKNOWN";
    const message = `Apify actor did not finish successfully: ${statusLabel}`;

    if (NON_TERMINAL_RUN_STATUSES.has(statusLabel)) {
      throw new RetryableExtractionError(message);
    }

    throw new Error(message);
  }

  const datasetId = run.defaultDatasetId;

  if (!isNonEmptyString(datasetId)) {
    throw new Error("Apify actor run did not return a defaultDatasetId");
  }

  const items = await fetchDatasetItems(datasetId, token);

  if (items.length === 0) {
    throw new Error("Apify actor returned no dataset items");
  }

  return normalizeDatasetItem(items[0], input);
}

async function startActorRun(
  actorName: string,
  token: string,
  input: ExtractSocialLinkWithApifyInput,
): Promise<Record<string, unknown>> {
  const response = await fetch(`${APIFY_API_BASE}/acts/${encodeActorName(actorName)}/runs?waitForFinish=120`, {
    method: "POST",
    headers: apifyHeaders(token),
    body: JSON.stringify({
      startUrls: [{ url: input.normalizedUrl }],
    }),
  });

  if (!response.ok) {
    throw await httpError("Apify actor run failed", response);
  }

  const payload = (await response.json()) as { data?: unknown };
  return isRecord(payload.data) ? payload.data : {};
}

async function fetchDatasetItems(datasetId: string, token: string): Promise<unknown[]> {
  const response = await fetch(`${APIFY_API_BASE}/datasets/${encodeURIComponent(datasetId)}/items?clean=true`, {
    headers: apifyHeaders(token),
  });

  if (!response.ok) {
    throw await httpError("Apify dataset fetch failed", response);
  }

  const payload = await response.json();
  return Array.isArray(payload) ? payload : [];
}

function normalizeDatasetItem(item: unknown, input: ExtractSocialLinkWithApifyInput): ExtractedSocialLink {
  const record = isRecord(item) ? item : {};
  const title = firstString(record.title, record.body, record.text, record.fullText, record.description) || input.normalizedUrl;

  return {
    platform: input.platform,
    originalUrl: input.originalUrl,
    normalizedUrl: input.normalizedUrl,
    title,
    author: firstString(record.author, record.username, record.userName),
    publishedAt: firstString(record.createdAt, record.timestamp, record.date),
    text: firstString(record.body, record.text, record.fullText, record.description, record.title) || "",
    comments: normalizeComments(record.comments),
    metrics: normalizeMetrics(record),
    raw: item,
  };
}

function normalizeComments(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((comment) => {
    if (isNonEmptyString(comment)) {
      return [comment];
    }

    if (!isRecord(comment)) {
      return [];
    }

    const text = firstString(comment.body, comment.text, comment.comment);
    return text ? [text] : [];
  });
}

function normalizeMetrics(record: Record<string, unknown>): ExtractedSocialLink["metrics"] {
  const metrics: ExtractedSocialLink["metrics"] = {};

  METRIC_FIELDS.forEach((field) => {
    const value = record[field];
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null) {
      metrics[field] = value;
    }
  });

  return metrics;
}

function encodeActorName(actorName: string): string {
  return actorName.split("/").map(encodeURIComponent).join("~");
}

function apifyHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

async function httpError(message: string, response: Response): Promise<Error> {
  let body = "";

  try {
    body = await response.text();
  } catch {
    body = "";
  }

  const details = body ? `: ${body}` : "";
  return new Error(`${message}: HTTP ${response.status} ${response.statusText}${details}`);
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (isNonEmptyString(value)) {
      return value;
    }
  }

  return null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

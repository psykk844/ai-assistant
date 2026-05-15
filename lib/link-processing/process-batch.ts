import { createAdminClient } from "@/lib/supabase/admin";
import { actorNameForPlatform, extractSocialLinkWithApify, isRetryableExtractionError } from "./apify";
import { removeWrittenLinkNote, writeFailureLinkNote, writeSuccessLinkNote } from "./obsidian";
import { summarizeExtractedLink } from "./summarize";
import type { LinkItem, LinkSource, ProcessLinksSummary, SocialPlatform, WrittenLinkNote } from "./types";
import { detectSupportedPlatform, extractStandaloneUrl, normalizeGenericUrl, normalizeSocialUrl } from "./url";
import { extractGenericWebLink } from "./web";

type BatchOptions = { limit?: number; now?: Date };
type AdminClient = ReturnType<typeof createAdminClient>;
type DbError = { message?: string } | null;

const ITEM_COLUMNS = "id,user_id,title,content,type,status,metadata,created_at,updated_at";
const REQUIRED_ENV_KEYS = ["APIFY_REDDIT_ACTOR", "APIFY_X_ACTOR", "APIFY_FACEBOOK_ACTOR", "OARS_API_KEY"];

export async function processLinkBatch(options: BatchOptions = {}): Promise<ProcessLinksSummary> {
  const summary = emptySummary();
  const missingConfig = missingRequiredConfig();

  if (missingConfig.length > 0) {
    missingConfig.forEach((key) => addError(summary, "batch", `Missing ${key}`));
    return summary;
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("items")
    .select(ITEM_COLUMNS)
    .eq("status", "active")
    .or("type.eq.link,metadata->>contentType.eq.social_media_post,content.ilike.http%")
    .order("created_at", { ascending: true })
    .limit(batchLimit(options.limit));

  if (error) {
    addError(summary, "batch", error.message);
    return summary;
  }

  for (const item of (data ?? []) as LinkItem[]) {
    await processItem(supabase, item, options.now ?? new Date(), summary);
  }

  return summary;
}

async function processItem(supabase: AdminClient, item: LinkItem, now: Date, summary: ProcessLinksSummary) {
  summary.scanned += 1;
  const link = itemLink(item);
  if (!link) {
    summary.skipped += 1;
    return;
  }

  const existing = await existingProcessedLink(supabase, item, link.normalizedUrl);
  if (existing.error) {
    addError(summary, item.id, existing.error);
    return;
  }

  if (existing.found) {
    await deleteDuplicate(supabase, item.id, summary);
    return;
  }

  await processNewLink(supabase, item, link, now, summary);
}

async function processNewLink(
  supabase: AdminClient,
  item: LinkItem,
  link: ValidLink,
  now: Date,
  summary: ProcessLinksSummary,
) {
  const savedAt = now.toISOString();
  const extracted = await extractAndSummarize(supabase, item, link, savedAt, summary);
  if (!extracted) return;

  const note = await writeSuccess(item, extracted, savedAt, summary);
  if (!note) return;

  if (!(await recordProcessed(supabase, item, link, note, null, summary))) {
    await cleanupWrittenNote(note, item.id, summary);
    return;
  }
  if (!(await deleteItem(supabase, item.id, summary))) return;
  summary.processed += 1;
  summary.summarized += 1;
}

async function extractAndSummarize(
  supabase: AdminClient,
  item: LinkItem,
  link: ValidLink,
  savedAt: string,
  summary: ProcessLinksSummary,
) {
  try {
    const extracted = link.platform === "web"
      ? await extractGenericWebLink({ originalUrl: link.originalUrl, normalizedUrl: link.normalizedUrl })
      : await extractSocialLinkWithApify(socialLink(link));
    const brief = await summarizeExtractedLink(extracted);
    return { extracted, brief, apifyActor: link.platform === "web" ? "generic-web-fetch" : actorNameForPlatform(link.platform) };
  } catch (error) {
    if (isRetryableExtractionError(error)) {
      addError(summary, item.id, errorReason(error));
      return null;
    }

    await processFailure(supabase, item, link, savedAt, errorReason(error), summary);
    return null;
  }
}

async function processFailure(
  supabase: AdminClient,
  item: LinkItem,
  link: ValidLink,
  savedAt: string,
  reason: string,
  summary: ProcessLinksSummary,
) {
  const note = await writeFailure(item, link, savedAt, reason, summary);
  if (!note) return;

  if (!(await recordProcessed(supabase, item, link, note, reason, summary))) {
    await cleanupWrittenNote(note, item.id, summary);
    return;
  }
  if (!(await deleteItem(supabase, item.id, summary))) return;
  summary.processed += 1;
  summary.failed += 1;
}

async function cleanupWrittenNote(note: WrittenLinkNote, itemId: string, summary: ProcessLinksSummary) {
  try {
    await removeWrittenLinkNote(note.obsidianPath);
  } catch (error) {
    addError(summary, itemId, `Failed to remove written Obsidian note after registry error: ${errorReason(error)}`);
  }
}

async function writeSuccess(
  item: LinkItem,
  result: NonNullable<Awaited<ReturnType<typeof extractAndSummarize>>>,
  savedAt: string,
  summary: ProcessLinksSummary,
) {
  try {
    return await writeSuccessLinkNote({ itemId: item.id, extracted: result.extracted, brief: result.brief, savedAt, apifyActor: result.apifyActor });
  } catch (error) {
    addError(summary, item.id, errorReason(error));
    return null;
  }
}

async function writeFailure(item: LinkItem, link: ValidLink, savedAt: string, reason: string, summary: ProcessLinksSummary) {
  try {
    return await writeFailureLinkNote({
      itemId: item.id,
      platform: link.platform,
      originalUrl: link.originalUrl,
      normalizedUrl: link.normalizedUrl,
      title: item.title?.trim() || link.originalUrl,
      savedAt,
      failureReason: reason,
    });
  } catch (error) {
    addError(summary, item.id, errorReason(error));
    return null;
  }
}

async function recordProcessed(
  supabase: AdminClient,
  item: LinkItem,
  link: ValidLink,
  note: WrittenLinkNote,
  reason: string | null,
  summary: ProcessLinksSummary,
) {
  const { error } = await supabase.from("processed_links").insert({
    user_id: item.user_id,
    normalized_url: link.normalizedUrl,
    original_url: link.originalUrl,
    platform: link.platform,
    status: note.status,
    obsidian_path: note.obsidianPath,
    original_item_id: item.id,
    failure_reason: reason,
  });
  return handleDbResult(error, item.id, summary);
}

async function existingProcessedLink(supabase: AdminClient, item: LinkItem, normalizedUrl: string) {
  const { data, error } = await supabase
    .from("processed_links")
    .select("id")
    .eq("user_id", item.user_id)
    .eq("normalized_url", normalizedUrl)
    .maybeSingle();

  return { found: Boolean(data), error: error?.message ?? null };
}

async function deleteDuplicate(supabase: AdminClient, itemId: string, summary: ProcessLinksSummary) {
  if (!(await deleteItem(supabase, itemId, summary))) return;
  summary.processed += 1;
  summary.duplicates += 1;
}

async function deleteItem(supabase: AdminClient, itemId: string, summary: ProcessLinksSummary) {
  const { error } = await supabase.from("items").delete().eq("id", itemId);
  return handleDbResult(error, itemId, summary);
}

function itemLink(item: LinkItem): ValidLink | null {
  const originalUrl = extractStandaloneUrl(item.content);
  if (!originalUrl) return null;

  const platform = detectSupportedPlatform(originalUrl);
  if (platform) {
    const normalizedUrl = normalizeSocialUrl(originalUrl);
    return normalizedUrl ? { platform, originalUrl, normalizedUrl } : null;
  }

  const normalizedUrl = normalizeGenericUrl(originalUrl);
  return normalizedUrl ? { platform: "web", originalUrl, normalizedUrl } : null;
}

function socialLink(link: ValidLink): { platform: SocialPlatform; originalUrl: string; normalizedUrl: string } {
  if (link.platform === "web") {
    throw new Error("Generic web links do not use Apify actors");
  }

  return { platform: link.platform, originalUrl: link.originalUrl, normalizedUrl: link.normalizedUrl };
}

function handleDbResult(error: DbError, itemId: string, summary: ProcessLinksSummary) {
  if (!error) return true;
  addError(summary, itemId, error.message ?? "Supabase operation failed");
  return false;
}

function batchLimit(limit?: number) {
  const raw = limit ?? Number.parseInt(process.env.LINK_BATCH_SIZE ?? "", 10);
  const value = Number.isFinite(raw) ? Math.trunc(raw) : 50;
  return Math.min(100, Math.max(1, value));
}

function missingRequiredConfig() {
  const missing = REQUIRED_ENV_KEYS.filter((key) => !process.env[key]?.trim());
  return process.env.APIFY_TOKEN?.trim() || process.env.APIFY?.trim() ? missing : ["APIFY_TOKEN or APIFY", ...missing];
}

function emptySummary(): ProcessLinksSummary {
  return { scanned: 0, processed: 0, summarized: 0, failed: 0, duplicates: 0, skipped: 0, errors: [] };
}

function addError(summary: ProcessLinksSummary, itemId: string, reason: string) {
  summary.errors.push({ itemId, reason });
}

function errorReason(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

type ValidLink = { platform: LinkSource; originalUrl: string; normalizedUrl: string };

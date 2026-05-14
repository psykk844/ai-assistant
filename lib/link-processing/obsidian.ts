import { constants as fsConstants, promises as fs } from "node:fs";
import path from "node:path";
import type { ExtractedSocialLink, LinkBrief, SupportedPlatform, WrittenLinkNote } from "./types";
import { slugifyForFilename } from "./url";

const DEFAULT_VAULT_ROOT = "/shared/obsidian_live_vault";

export type WriteSuccessLinkNoteInput = {
  itemId: string;
  extracted: ExtractedSocialLink;
  brief: LinkBrief;
  savedAt: string;
  apifyActor: string;
};

export type WriteFailureLinkNoteInput = {
  itemId: string;
  platform: SupportedPlatform;
  originalUrl: string;
  normalizedUrl: string;
  title: string;
  savedAt: string;
  failureReason: string;
};

export async function writeSuccessLinkNote(input: WriteSuccessLinkNoteInput): Promise<WrittenLinkNote> {
  const target = await resolveTarget(input.savedAt, input.brief.title, input.itemId);
  const markdown = renderSuccessMarkdown(input);
  const obsidianPath = await writeUnusedNote(target, markdown);

  return { obsidianPath, status: "summarized" };
}

export async function writeFailureLinkNote(input: WriteFailureLinkNoteInput): Promise<WrittenLinkNote> {
  const target = await resolveTarget(input.savedAt, input.title, input.itemId);
  const markdown = renderFailureMarkdown(input);
  const obsidianPath = await writeUnusedNote(target, markdown);

  return { obsidianPath, status: "failed" };
}

export async function removeWrittenLinkNote(obsidianPath: string): Promise<void> {
  const root = path.resolve(resolveVaultRoot());
  const absolutePath = path.resolve(root, ...obsidianPath.split("/"));

  if (!isInside(root, absolutePath)) {
    throw new Error(`Obsidian note cleanup path escapes the Obsidian vault: ${obsidianPath}`);
  }

  await fs.unlink(absolutePath);
}

async function resolveTarget(savedAt: string, title: string, itemId: string) {
  const root = resolveVaultRoot();
  await requireVaultAccess(root);

  const folder = path.join("Links", monthFromSavedAt(savedAt));
  const filename = safeFilename(title, itemId);
  const absoluteDir = path.join(root, folder);

  await fs.mkdir(absoluteDir, { recursive: true });

  return {
    root,
    absoluteDir,
    filename,
  };
}

async function writeUnusedNote(target: Awaited<ReturnType<typeof resolveTarget>>, markdown: string) {
  const parsed = path.parse(target.filename);

  for (let attempt = 1; ; attempt += 1) {
    const filename = attempt === 1 ? target.filename : `${parsed.name}-${attempt}${parsed.ext}`;
    const absolutePath = path.resolve(target.absoluteDir, filename);

    if (!isInside(target.absoluteDir, absolutePath)) {
      throw new Error(`Resolved Obsidian note path escapes target folder: ${filename}`);
    }

    try {
      await fs.writeFile(absolutePath, markdown, { encoding: "utf8", flag: "wx" });
      return path.relative(target.root, absolutePath).split(path.sep).join("/");
    } catch (error) {
      if (!isFileExistsError(error)) {
        throw error;
      }
    }
  }
}

function renderSuccessMarkdown(input: WriteSuccessLinkNoteInput) {
  const { brief, extracted } = input;
  const lines = [
    "---",
    "type: link-summary",
    `source: ${yamlString(extracted.platform)}`,
    `url: ${yamlString(extracted.originalUrl)}`,
    `normalized_url: ${yamlString(extracted.normalizedUrl)}`,
    `saved_at: ${yamlString(input.savedAt)}`,
    "status: summarized",
    `original_todo_id: ${yamlString(input.itemId)}`,
    `apify_actor: ${yamlString(input.apifyActor)}`,
    "tags:",
    ...successTags(extracted.platform, brief.tags).map((tag) => `  - ${yamlString(tag)}`),
    "---",
    "",
    `# ${brief.title}`,
    "",
    "## Why This Was Saved",
    brief.whySaved,
    "",
    "## Full Context",
    brief.fullContext,
    "",
    "## Key Points",
    ...listLines(brief.keyPoints),
    "",
    "## Notable Quotes / Details",
    ...listLines(brief.notableDetails),
    "",
    "## Source Metadata",
    `- Platform: ${extracted.platform}`,
    `- Author: ${extracted.author ?? "Unknown"}`,
    `- Published At: ${extracted.publishedAt ?? "Unknown"}`,
    `- Metrics: ${JSON.stringify(extracted.metrics)}`,
    "",
    `Source original link: ${extracted.originalUrl}`,
    "",
  ];

  return lines.join("\n");
}

function renderFailureMarkdown(input: WriteFailureLinkNoteInput) {
  const lines = [
    "---",
    "type: link-summary-error",
    `source: ${yamlString(input.platform)}`,
    `url: ${yamlString(input.originalUrl)}`,
    `normalized_url: ${yamlString(input.normalizedUrl)}`,
    `saved_at: ${yamlString(input.savedAt)}`,
    "status: failed",
    `original_todo_id: ${yamlString(input.itemId)}`,
    `failure_reason: ${yamlString(input.failureReason)}`,
    "tags:",
    `  - ${yamlString("links")}`,
    `  - ${yamlString("failed-link-capture")}`,
    "---",
    "",
    `# ${input.title}`,
    "",
    `Original URL: ${input.originalUrl}`,
    `Platform: ${input.platform}`,
    `Reason: ${input.failureReason}`,
    "",
  ];

  return lines.join("\n");
}

function resolveVaultRoot() {
  return process.env.OBSIDIAN_VAULT_PATH?.trim() || DEFAULT_VAULT_ROOT;
}

async function requireVaultAccess(root: string) {
  try {
    await fs.access(root, fsConstants.R_OK | fsConstants.W_OK);
  } catch {
    throw new Error(`Obsidian vault is not readable and writable: ${root}`);
  }
}

function monthFromSavedAt(savedAt: string) {
  const date = new Date(savedAt);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid savedAt timestamp: ${savedAt}`);
  }

  return date.toISOString().slice(0, 7);
}

function safeFilename(title: string, itemId: string) {
  const safeId =
    itemId
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "link";
  const filename = slugifyForFilename(title, safeId);
  const basename = filename.split(/[\\/]/).pop() ?? "saved-link.md";
  const stem = basename.replace(/\.md$/i, "").replace(/[^a-z0-9_-]+/g, "-").replace(/-+$/g, "") || "saved-link";

  return `${stem}.md`;
}

function isInside(root: string, candidate: string) {
  const relative = path.relative(root, candidate);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function isFileExistsError(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "EEXIST";
}

function successTags(platform: SupportedPlatform, briefTags: string[]) {
  return ["links", `platform/${platform}`, ...briefTags.map((tag) => `brief/${tag}`)];
}

function listLines(items: string[]) {
  return items.length > 0 ? items.map((item) => `- ${item}`) : ["- None"];
}

function yamlString(value: string) {
  return JSON.stringify(value);
}

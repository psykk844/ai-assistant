import { laneFromItem } from "@/lib/items/lane";
import { promises as fs, constants as fsConstants } from "node:fs";
import path from "node:path";

type MirrorableItem = {
  id: string;
  user_id: string;
  type: "todo" | "note" | "link";
  title: string | null;
  content: string;
  status: "active" | "completed" | "archived";
  priority_score: number;
  confidence_score: number | null;
  needs_review: boolean;
  created_at: string;
  updated_at?: string;
  metadata?: Record<string, unknown> | null;
};

const DEFAULT_ROOT = "/shared/obsidian_live_vault";

export async function mirrorItemToObsidian(item: MirrorableItem): Promise<{ obsidianPath: string } | null> {
  const root = resolveRoot();
  if (!(await rootReadable(root))) return null;

  const metadata = asMetadata(item.metadata);
  const folder = folderForItem(item);
  const filename = existingFilename(metadata) ?? `${slugify(item.title || item.content || "inbox-item")}__${item.id.slice(0, 8)}.md`;

  const targetDir = path.join(root, folder);
  const targetAbs = path.join(targetDir, filename);
  const priorRel = typeof metadata.obsidian_path === "string" ? metadata.obsidian_path : "";
  const priorAbs = priorRel ? path.resolve(root, priorRel) : "";

  await fs.mkdir(targetDir, { recursive: true });

  if (priorAbs && priorAbs !== targetAbs) {
    if (isInside(root, priorAbs)) {
      try {
        await fs.mkdir(path.dirname(targetAbs), { recursive: true });
        await fs.rename(priorAbs, targetAbs);
      } catch {
        // ignore missing old path and continue with write
      }
    }
  }

  await fs.writeFile(targetAbs, renderMarkdown(item), "utf8");

  return { obsidianPath: path.relative(root, targetAbs) };
}

export async function removeMirroredFileFromMetadata(metadata: Record<string, unknown> | null | undefined): Promise<void> {
  const root = resolveRoot();
  if (!(await rootReadable(root))) return;

  const rel = typeof metadata?.obsidian_path === "string" ? metadata.obsidian_path : "";
  if (!rel) return;

  const absolute = path.resolve(root, rel);
  if (!isInside(root, absolute)) return;

  try {
    await fs.unlink(absolute);
  } catch {
    // ignore missing file
  }
}

function renderMarkdown(item: MirrorableItem): string {
  const lane = laneFromItem({ status: item.status, priority_score: item.priority_score });
  const metadata = asMetadata(item.metadata);
  const lines = [
    "---",
    `id: ${item.id}`,
    `user_id: ${item.user_id}`,
    `type: ${item.type}`,
    `status: ${item.status}`,
    `lane: ${lane}`,
    `priority_score: ${item.priority_score}`,
    `confidence_score: ${item.confidence_score ?? ""}`,
    `needs_review: ${item.needs_review}`,
    `source: ai-assistant`,
    `created_at: ${item.created_at}`,
    `updated_at: ${item.updated_at ?? new Date().toISOString()}`,
    "---",
    "",
    item.content.trim(),
    "",
  ];

  if (metadata.generated_from) {
    lines.push("", `Generated from: ${String(metadata.generated_from)}`);
  }

  return lines.join("\n");
}

function resolveRoot() {
  return process.env.OBSIDIAN_VAULT_PATH?.trim() || DEFAULT_ROOT;
}

async function rootReadable(root: string): Promise<boolean> {
  try {
    await fs.access(root, fsConstants.R_OK | fsConstants.W_OK);
    return true;
  } catch {
    return false;
  }
}

function folderForItem(item: MirrorableItem): string {
  const metadata = asMetadata(item.metadata);
  const isTrash = item.status === "archived" && typeof metadata.deleted_at === "string";
  if (isTrash) return "Trash";
  if (item.status == "completed") return "Completed";
  if (item.type === "todo") return "Todos";
  if (item.type === "link") return "Links";
  return "Notes";
}

function existingFilename(metadata: Record<string, unknown>) {
  const p = typeof metadata.obsidian_path === "string" ? metadata.obsidian_path : "";
  if (!p) return null;
  const name = path.basename(p);
  return name.endsWith(".md") ? name : null;
}

function asMetadata(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  return input as Record<string, unknown>;
}

function isInside(root: string, candidate: string) {
  const rootAbs = path.resolve(root) + path.sep;
  return candidate.startsWith(rootAbs) || candidate === path.resolve(root);
}

function slugify(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "inbox-item";
}

import { createAdminClient } from "@/lib/supabase/admin";
import { embedText } from "@/lib/ai/oars";
import { chunkMarkdown, extractFrontmatter } from "@/lib/vault/chunk";
import { ensureCollection, upsertPoints } from "@/lib/qdrant/client";
import { createHash } from "node:crypto";
import { constants as fsConstants, promises as fs } from "node:fs";
import path from "node:path";

const DEFAULT_VAULT_ROOT = "/shared/obsidian_live_vault";

export type SyncSummary = {
  scannedFiles: number;
  syncedFiles: number;
  embeddedChunks: number;
  skippedFiles: number;
};

export type VaultDiagnostics = {
  vaultPath: string;
  pathExists: boolean;
  isReadable: boolean;
  totalMarkdownFiles: number;
};

export async function getVaultDiagnostics(root = resolveVaultRoot()): Promise<VaultDiagnostics> {
  const pathExists = await checkPathExists(root);
  const isReadable = pathExists ? await checkPathReadable(root) : false;
  const totalMarkdownFiles = isReadable ? await countMarkdownFiles(root) : 0;

  return {
    vaultPath: root,
    pathExists,
    isReadable,
    totalMarkdownFiles,
  };
}

export async function runVaultSync(userId: string, root = resolveVaultRoot()): Promise<SyncSummary> {
  const allFiles = await listMarkdownFiles(root);
  const admin = createAdminClient();

  await ensureCollection("vault_notes", 1536);

  let syncedFiles = 0;
  let embeddedChunks = 0;
  let skippedFiles = 0;

  for (const filePath of allFiles) {
    const stat = await fs.stat(filePath);
    const relative = path.relative(root, filePath);
    const mtime = stat.mtime.toISOString();

    const { data: existing } = await admin
      .from("vault_notes")
      .select("id, last_synced")
      .eq("user_id", userId)
      .eq("filepath", relative)
      .maybeSingle();

    if (existing?.last_synced && new Date(existing.last_synced).getTime() >= stat.mtime.getTime()) {
      skippedFiles += 1;
      continue;
    }

    const markdown = await fs.readFile(filePath, "utf8");
    const { frontmatter, body } = extractFrontmatter(markdown);
    const chunks = chunkMarkdown(body);

    const points: Array<{ id: string; vector: number[]; payload: Record<string, unknown> }> = [];

    for (let index = 0; index < chunks.length; index += 1) {
      const chunk = chunks[index];
      const embedding = await embedText(chunk);
      if (!embedding) continue;
      const id = hashId(`${relative}:${index}`);
      points.push({
        id,
        vector: embedding,
        payload: {
          user_id: userId,
          filepath: relative,
          title: String(frontmatter.title || path.basename(relative, ".md")),
          tags: String(frontmatter.tags || ""),
          chunk,
          chunk_index: index,
          source: "vault",
        },
      });
    }

    await upsertPoints("vault_notes", points);

    await admin.from("vault_notes").upsert(
      {
        user_id: userId,
        filepath: relative,
        title: String(frontmatter.title || path.basename(relative, ".md")),
        tags: String(frontmatter.tags || ""),
        chunk_count: chunks.length,
        last_synced: mtime,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,filepath" },
    );

    syncedFiles += 1;
    embeddedChunks += points.length;
  }

  return {
    scannedFiles: allFiles.length,
    syncedFiles,
    embeddedChunks,
    skippedFiles,
  };
}

export function resolveVaultRoot() {
  return process.env.OBSIDIAN_VAULT_PATH?.trim() || DEFAULT_VAULT_ROOT;
}

export async function checkPathExists(root: string): Promise<boolean> {
  try {
    await fs.stat(root);
    return true;
  } catch {
    return false;
  }
}

export async function checkPathReadable(root: string): Promise<boolean> {
  try {
    await fs.access(root, fsConstants.R_OK);
    return true;
  } catch {
    return false;
  }
}

export async function countMarkdownFiles(root: string): Promise<number> {
  return (await listMarkdownFiles(root)).length;
}

async function listMarkdownFiles(root: string): Promise<string[]> {
  const results: string[] = [];

  async function walk(current: string) {
    let entries: Array<{ name: string; isDirectory: () => boolean }> = [];
    try {
      entries = (await fs.readdir(current, { withFileTypes: true })) as Array<{
        name: string;
        isDirectory: () => boolean;
      }>;
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.name.toLowerCase().endsWith(".md")) {
        results.push(fullPath);
      }
    }
  }

  await walk(root);
  return results;
}

function hashId(input: string) {
  return createHash("sha1").update(input).digest("hex");
}

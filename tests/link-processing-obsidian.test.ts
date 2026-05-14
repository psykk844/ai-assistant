import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { removeWrittenLinkNote, writeFailureLinkNote, writeSuccessLinkNote } from "../lib/link-processing/obsidian";
import type { ExtractedSocialLink, LinkBrief } from "../lib/link-processing/types";

const priorVaultPath = process.env.OBSIDIAN_VAULT_PATH;
const tempVaults: string[] = [];

afterEach(async () => {
  if (priorVaultPath === undefined) {
    delete process.env.OBSIDIAN_VAULT_PATH;
  } else {
    process.env.OBSIDIAN_VAULT_PATH = priorVaultPath;
  }

  await Promise.all(tempVaults.splice(0).map((vault) => rm(vault, { recursive: true, force: true })));
});

describe("link processing Obsidian note writer", () => {
  it("writes summarized link notes into the saved month folder", async () => {
    const vault = await createTempVault();
    const extracted: ExtractedSocialLink = {
      platform: "reddit",
      originalUrl: "https://www.reddit.com/r/AI/comments/abc123/a_useful_thread/?utm_source=share",
      normalizedUrl: "https://reddit.com/r/AI/comments/abc123/a_useful_thread",
      title: "A Useful Reddit Thread: AI + Planning!",
      author: "u/example",
      publishedAt: "2026-05-13T10:00:00.000Z",
      text: "Original post text that explains the discussion.",
      comments: ["Comment with a practical planning insight."],
      metrics: { score: 42, comments: 7 },
      raw: { source: "fixture" },
    };
    const brief: LinkBrief = {
      title: "A Useful Reddit Thread: AI + Planning!",
      whySaved: "It connects AI planning with practical execution habits.",
      fullContext: "The thread discusses how people structure AI-assisted work.",
      keyPoints: ["Plan the work before launching agents.", "Keep source links attached to summaries."],
      notableDetails: ["The most useful quote highlights batching related links."],
      tags: ["ai", "planning"],
    };

    const result = await writeSuccessLinkNote({
      itemId: "todo-abc12345",
      extracted,
      brief,
      savedAt: "2026-05-14T12:34:56.000Z",
      apifyActor: "apify/reddit-scraper",
    });

    expect(result.status).toBe("summarized");
    expect(result.obsidianPath).toBe("Links/2026-05/a-useful-reddit-thread-ai-planning__todo-abc.md");

    const markdown = await readObsidianNote(vault, result.obsidianPath);
    expect(markdown).toContain("type: link-summary");
    expect(markdown).toContain('url: "https://www.reddit.com/r/AI/comments/abc123/a_useful_thread/?utm_source=share"');
    expect(markdown).toContain('normalized_url: "https://reddit.com/r/AI/comments/abc123/a_useful_thread"');
    expect(markdown).toContain("status: summarized");
    expect(markdown).toContain('original_todo_id: "todo-abc12345"');
    expect(markdown).toContain('apify_actor: "apify/reddit-scraper"');
    expect(markdown).toContain('- "links"');
    expect(markdown).toContain('- "platform/reddit"');
    expect(markdown).toContain('- "brief/ai"');
    expect(markdown).toContain("# A Useful Reddit Thread: AI + Planning!");
    expect(markdown).toContain("## Why This Was Saved");
    expect(markdown).toContain("It connects AI planning with practical execution habits.");
    expect(markdown).toContain("## Full Context");
    expect(markdown).toContain("## Key Points");
    expect(markdown).toContain("- Plan the work before launching agents.");
    expect(markdown).toContain("## Notable Quotes / Details");
    expect(markdown).toContain("## Source Metadata");
    expect(markdown).toContain("- Platform: reddit");
    expect(markdown).toContain("- Author: u/example");
    expect(markdown).toContain("Source original link: https://www.reddit.com/r/AI/comments/abc123/a_useful_thread/?utm_source=share");
  });

  it("writes failed link notes with the original URL and reason", async () => {
    const vault = await createTempVault();

    const result = await writeFailureLinkNote({
      itemId: "todo-fail9999",
      platform: "x",
      originalUrl: "https://twitter.com/example/status/123?utm_source=feed",
      normalizedUrl: "https://x.com/example/status/123",
      title: "Thread that could not be fetched",
      savedAt: "2026-05-01T09:00:00.000Z",
      failureReason: "Apify actor timed out before returning a dataset.",
    });

    expect(result.status).toBe("failed");
    expect(result.obsidianPath).toBe("Links/2026-05/thread-that-could-not-be-fetched__todo-fai.md");

    const markdown = await readObsidianNote(vault, result.obsidianPath);
    expect(markdown).toContain("type: link-summary-error");
    expect(markdown).toContain('url: "https://twitter.com/example/status/123?utm_source=feed"');
    expect(markdown).toContain('normalized_url: "https://x.com/example/status/123"');
    expect(markdown).toContain("status: failed");
    expect(markdown).toContain('original_todo_id: "todo-fail9999"');
    expect(markdown).toContain('failure_reason: "Apify actor timed out before returning a dataset."');
    expect(markdown).toContain('- "links"');
    expect(markdown).toContain('- "failed-link-capture"');
    expect(markdown).toContain("Original URL: https://twitter.com/example/status/123?utm_source=feed");
    expect(markdown).toContain("Platform: x");
    expect(markdown).toContain("Reason: Apify actor timed out before returning a dataset.");
  });

  it("keeps malicious item IDs inside the month folder", async () => {
    const vault = await createTempVault();

    const result = await writeFailureLinkNote({
      itemId: "../../evil\\capture9999",
      platform: "facebook",
      originalUrl: "https://facebook.com/story.php?id=42",
      normalizedUrl: "https://facebook.com/story.php?id=42",
      title: "Suspicious Link",
      savedAt: "2026-05-08T09:00:00.000Z",
      failureReason: "Could not fetch fixture.",
    });

    expect(result.status).toBe("failed");
    expect(result.obsidianPath).toBe("Links/2026-05/suspicious-link__evil-cap.md");
    expect(result.obsidianPath).not.toContain("..");
    expect(result.obsidianPath.split("/")).toHaveLength(3);

    const markdown = await readObsidianNote(vault, result.obsidianPath);
    expect(markdown).toContain('original_todo_id: "../../evil\\\\capture9999"');
  });

  it("creates a suffixed note instead of overwriting an existing file", async () => {
    const vault = await createTempVault();
    const existingPath = path.join(vault, "Links", "2026-05", "collision-link__same-id.md");
    await mkdir(path.dirname(existingPath), { recursive: true });
    await writeFile(existingPath, "user edited note", "utf8");

    const result = await writeFailureLinkNote({
      itemId: "same-id-123",
      platform: "x",
      originalUrl: "https://x.com/example/status/456",
      normalizedUrl: "https://x.com/example/status/456",
      title: "Collision Link",
      savedAt: "2026-05-09T09:00:00.000Z",
      failureReason: "Dataset was empty.",
    });

    expect(result.status).toBe("failed");
    expect(result.obsidianPath).toBe("Links/2026-05/collision-link__same-id-2.md");
    expect(await readFile(existingPath, "utf8")).toBe("user edited note");
    expect(await readObsidianNote(vault, result.obsidianPath)).toContain("Reason: Dataset was empty.");
  });

  it("removes a written note inside the vault", async () => {
    const vault = await createTempVault();
    const notePath = path.join(vault, "Links", "2026-05", "cleanup.md");
    await mkdir(path.dirname(notePath), { recursive: true });
    await writeFile(notePath, "temporary note", "utf8");

    await removeWrittenLinkNote("Links/2026-05/cleanup.md");

    await expect(readFile(notePath, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects note cleanup paths that escape the vault", async () => {
    const vault = await createTempVault();
    const outsidePath = path.resolve(vault, "..", "outside-link-note.md");
    await writeFile(outsidePath, "outside note", "utf8");

    await expect(removeWrittenLinkNote("../outside-link-note.md")).rejects.toThrow("escapes the Obsidian vault");
    await expect(readFile(outsidePath, "utf8")).resolves.toBe("outside note");

    await rm(outsidePath, { force: true });
  });
});

async function createTempVault() {
  const vault = await mkdtemp(path.join(os.tmpdir(), "obsidian-link-writer-"));
  tempVaults.push(vault);
  process.env.OBSIDIAN_VAULT_PATH = vault;
  return vault;
}

function readObsidianNote(vault: string, obsidianPath: string) {
  return readFile(path.join(vault, ...obsidianPath.split("/")), "utf8");
}

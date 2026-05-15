import type { ExtractedSocialLink } from "./types";

export type ExtractGenericWebLinkInput = {
  originalUrl: string;
  normalizedUrl: string;
};

const TEXT_LIMIT = 12000;

export async function extractGenericWebLink(input: ExtractGenericWebLinkInput): Promise<ExtractedSocialLink> {
  const response = await fetch(input.normalizedUrl, {
    headers: { "User-Agent": "todo-link-archiver/1.0" },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Generic web fetch failed with HTTP ${response.status}`);
  }

  const html = await response.text();
  const title = textFromFirstMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/i) || input.normalizedUrl;
  const description = metaContent(html, "description");
  const text = [description, readableText(html)].filter(Boolean).join("\n\n").slice(0, TEXT_LIMIT);

  return {
    platform: "web",
    originalUrl: input.originalUrl,
    normalizedUrl: input.normalizedUrl,
    title,
    author: null,
    publishedAt: null,
    text: text || title,
    comments: [],
    metrics: {},
    raw: { contentType: response.headers.get("content-type") ?? null },
  };
}

function metaContent(html: string, name: string) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return textFromFirstMatch(html, new RegExp(`<meta[^>]+name=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i"));
}

function readableText(html: string) {
  return decodeHtml(html)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function textFromFirstMatch(value: string, pattern: RegExp) {
  const match = value.match(pattern);
  return match?.[1] ? decodeHtml(match[1]).replace(/\s+/g, " ").trim() : null;
}

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

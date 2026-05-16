import * as dns from "node:dns/promises";
import net from "node:net";
import type { ExtractedSocialLink } from "./types";

export type ExtractGenericWebLinkInput = {
  originalUrl: string;
  normalizedUrl: string;
};

const TEXT_LIMIT = 12000;
const BODY_LIMIT_BYTES = 1_000_000;
const FETCH_TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 5;

export async function extractGenericWebLink(input: ExtractGenericWebLinkInput): Promise<ExtractedSocialLink> {
  const response = await fetchPublicWebResponse(input.normalizedUrl);

  if (!response.ok) {
    throw new Error(`Generic web fetch failed with HTTP ${response.status}`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!isSupportedContentType(contentType)) {
    throw new Error(`Unsupported generic web content type: ${contentType || "unknown"}`);
  }

  const html = await readLimitedText(response);
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
    raw: { contentType: contentType || null },
  };
}

async function fetchPublicWebResponse(url: string) {
  let currentUrl = url;

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    await assertPublicTarget(currentUrl);

    const response = await fetch(currentUrl, {
      headers: { "User-Agent": "todo-link-archiver/1.0" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: "no-store",
      redirect: "manual",
    });

    if (!isRedirectStatus(response.status)) {
      return response;
    }

    const location = response.headers.get("location");
    if (!location) {
      throw new Error(`Generic web fetch failed with HTTP ${response.status}`);
    }

    currentUrl = new URL(location, currentUrl).toString();
  }

  throw new Error("Generic web fetch exceeded redirect limit");
}

function isRedirectStatus(status: number) {
  return status >= 300 && status < 400;
}

async function assertPublicTarget(url: string) {
  const parsed = new URL(url);
  const hostname = parsed.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    throw new Error("Generic web fetch blocked private or local network target");
  }

  const resolved = await dns.lookup(hostname, { all: true });
  const addresses = Array.isArray(resolved) ? resolved : [resolved];
  if (addresses.some((entry) => isPrivateAddress(entry.address))) {
    throw new Error("Generic web fetch blocked private or local network target");
  }
}

function isPrivateAddress(address: string) {
  if (net.isIP(address) === 6) {
    const normalized = address.toLowerCase();
    return normalized === "::1" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe80:");
  }

  if (net.isIP(address) !== 4) return true;
  const parts = address.split(".").map((part) => Number.parseInt(part, 10));
  const [first, second] = parts;

  return first === 0 || first === 10 || first === 127 || (first === 169 && second === 254) || (first === 172 && second >= 16 && second <= 31) || (first === 192 && second === 168);
}

function isSupportedContentType(contentType: string) {
  const normalized = contentType.toLowerCase();
  return normalized.includes("text/html") || normalized.includes("text/plain") || normalized.includes("application/xhtml+xml");
}

async function readLimitedText(response: Response) {
  if (!response.body) {
    return "";
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;

    total += value.byteLength;
    if (total > BODY_LIMIT_BYTES) {
      await reader.cancel();
      throw new Error("Generic web fetch response exceeded size limit");
    }
    chunks.push(value);
  }

  return new TextDecoder().decode(Buffer.concat(chunks));
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

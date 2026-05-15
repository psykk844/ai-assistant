import type { SocialPlatform } from "./types";

const TRAILING_PUNCTUATION = /[),.;]+$/;
const TRACKING_PARAMS = new Set(["fbclid", "gclid", "igshid", "mc_cid", "mc_eid", "s"]);

export function extractFirstUrl(content: string): string | null {
  const match = content.match(/https?:\/\/[^\s<>"]+/i);
  return match ? match[0].replace(TRAILING_PUNCTUATION, "") : null;
}

export function extractStandaloneUrl(content: string): string | null {
  const trimmed = content.trim();
  return /^https?:\/\/[^\s<>"]+$/i.test(trimmed) ? trimmed.replace(TRAILING_PUNCTUATION, "") : null;
}

export function detectSupportedPlatform(url: string): SocialPlatform | null {
  const parsed = parseUrl(url);

  if (!parsed) {
    return null;
  }

  const host = removeWww(parsed.hostname.toLowerCase());

  if (isHostOrSubdomain(host, "reddit.com") && isSupportedPublicSocialUrl(url, "reddit")) {
    return "reddit";
  }

  if ((host === "x.com" || isHostOrSubdomain(host, "twitter.com")) && isSupportedPublicSocialUrl(url, "x")) {
    return "x";
  }

  if (isHostOrSubdomain(host, "facebook.com") && isSupportedPublicSocialUrl(url, "facebook")) {
    return "facebook";
  }

  return null;
}

export function isSupportedPublicSocialUrl(url: string, platform: SocialPlatform): boolean {
  const parsed = parseUrl(url);

  if (!parsed) {
    return false;
  }

  const path = parsed.pathname.toLowerCase().replace(/\/+$/, "") || "/";
  const segments = pathSegments(path);

  if (platform === "reddit") {
    return segments[0] === "comments" || (segments[0] === "r" && Boolean(segments[1]) && (segments[2] === "comments" || segments[2] === "s"));
  }

  if (platform === "x") {
    return isSupportedXStatusPath(segments);
  }

  return isSupportedFacebookPath(segments);
}

export function normalizeSocialUrl(input: string): string | null {
  const parsed = parseUrl(input);

  if (!parsed) {
    return null;
  }

  const platform = detectSupportedPlatform(parsed.toString());

  if (!platform) {
    return null;
  }

  const host = normalizeHost(parsed.hostname, platform);
  const path = parsed.pathname.replace(/\/+$/, "");
  const query = buildQuery(parsed.searchParams);

  return `https://${host}${path}${query}`;
}

export function normalizeGenericUrl(input: string): string | null {
  const parsed = parseUrl(input);

  if (!parsed) {
    return null;
  }

  parsed.hash = "";
  return parsed.toString().replace(/\/$/, "");
}

export function slugifyForFilename(title: string, id: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72)
    .replace(/-+$/g, "") || "saved-link";

  return `${slug}__${id.slice(0, 8)}.md`;
}

function parseUrl(input: string): URL | null {
  try {
    const parsed = new URL(input);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed : null;
  } catch {
    return null;
  }
}

function removeWww(host: string): string {
  return host.replace(/^www\./, "");
}

function isHostOrSubdomain(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

function normalizeHost(hostname: string, platform: SocialPlatform): string {
  const host = removeWww(hostname.toLowerCase());

  if (platform === "reddit") {
    return "reddit.com";
  }

  if (platform === "facebook") {
    return "facebook.com";
  }

  return isHostOrSubdomain(host, "twitter.com") ? "x.com" : host;
}

function pathSegments(path: string) {
  return path.split("/").filter(Boolean);
}

function isSupportedXStatusPath(segments: string[]) {
  const [first, second, third, fourth] = segments;

  if (!first || ["help", "login", "settings"].includes(first)) {
    return false;
  }

  if (first === "i" && second === "web" && third === "status") {
    return /^\d+$/.test(fourth ?? "");
  }

  return second === "status" && /^\d+$/.test(third ?? "");
}

function isSupportedFacebookPath(segments: string[]) {
  const first = segments[0];

  if (!first || ["help", "login", "settings"].includes(first)) {
    return false;
  }

  return (
    segments.includes("posts") ||
    (first === "groups" && segments.includes("permalink")) ||
    first === "story.php" ||
    first === "permalink.php" ||
    first === "reel" ||
    first === "watch" ||
    first === "photo.php" ||
    first === "share" ||
    segments.includes("videos")
  );
}

function buildQuery(params: URLSearchParams): string {
  const kept = new URLSearchParams();
  const entries = Array.from(params.entries())
    .filter(([key]) => !isTrackingParam(key))
    .sort(([leftKey, leftValue], [rightKey, rightValue]) => {
      const keyOrder = leftKey.localeCompare(rightKey);
      return keyOrder === 0 ? leftValue.localeCompare(rightValue) : keyOrder;
    });

  entries.forEach(([key, value]) => {
    kept.append(key, value);
  });

  const query = kept.toString();
  return query ? `?${query}` : "";
}

function isTrackingParam(key: string): boolean {
  const normalized = key.toLowerCase();
  return normalized.startsWith("utm_") || TRACKING_PARAMS.has(normalized);
}

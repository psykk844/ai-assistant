import { NextResponse } from "next/server";
import { assertApiSession } from "@/lib/auth/api-session";
import { resolveSessionUserId } from "@/lib/auth/session-user";
import type { InboxItem } from "@/lib/items/types";

const MOBILE_CORS_ALLOW_HEADERS = "Content-Type, x-mobile-dev-key";
const MOBILE_CORS_ALLOW_METHODS = "GET, POST, OPTIONS";

async function hasMobileApiAuth(request?: Request) {
  const expectedDevKey = process.env.MOBILE_DEV_API_KEY?.trim();
  const providedDevKey = request?.headers.get("x-mobile-dev-key")?.trim();

  if (expectedDevKey && providedDevKey && expectedDevKey === providedDevKey) {
    return true;
  }

  try {
    await assertApiSession();
    return true;
  } catch {
    return false;
  }
}

function isAllowedLocalHostname(hostname: string) {
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return true;
  }

  const privateIpv4 = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/;
  return privateIpv4.test(hostname);
}

function resolveCorsOrigin(request?: Request) {
  const origin = request?.headers.get("origin")?.trim();
  if (!origin) return "*";

  const hostname = (() => {
    try {
      return new URL(origin).hostname;
    } catch {
      return "";
    }
  })();

  if (isAllowedLocalHostname(hostname)) {
    return origin;
  }

  return "*";
}

export function withMobileCors(response: NextResponse, request?: Request) {
  response.headers.set("Access-Control-Allow-Origin", resolveCorsOrigin(request));
  response.headers.set("Access-Control-Allow-Headers", MOBILE_CORS_ALLOW_HEADERS);
  response.headers.set("Access-Control-Allow-Methods", MOBILE_CORS_ALLOW_METHODS);
  response.headers.set("Vary", "Origin");
  return response;
}

export function mobileCorsPreflightResponse(request?: Request) {
  return withMobileCors(new NextResponse(null, { status: 204 }), request);
}

export async function requireMobileApiUser(request?: Request) {
  const expectedDevKey = process.env.MOBILE_DEV_API_KEY?.trim();
  const providedDevKey = request?.headers.get("x-mobile-dev-key")?.trim();

  if (expectedDevKey && providedDevKey && expectedDevKey === providedDevKey) {
    const devUserId = process.env.MOBILE_DEV_USER_ID?.trim() || process.env.DEFAULT_USER_ID?.trim();
    if (devUserId) {
      return { userId: devUserId };
    }
  }

  const authed = await hasMobileApiAuth(request);
  if (!authed) return null;

  try {
    const userId = await resolveSessionUserId();
    return { userId };
  } catch {
    return null;
  }
}

export function unauthorizedResponse(request?: Request) {
  return withMobileCors(NextResponse.json({ error: "unauthorized" }, { status: 401 }), request);
}

export function normalizeItemTags(item: Omit<InboxItem, "tags"> & { tags?: string[] | null }): InboxItem {
  if (Array.isArray(item.tags)) {
    return {
      ...item,
      tags: item.tags,
    };
  }

  const meta = (item.metadata as Record<string, unknown> | null | undefined) ?? {};
  const metadataTags = meta.tags;

  return {
    ...item,
    tags: Array.isArray(metadataTags) ? (metadataTags as string[]) : [],
  };
}

export function withoutTrashFlags(metadata: Record<string, unknown> | null | undefined) {
  if (!metadata) return {};
  const { dismissed, deleted_at, ...rest } = metadata;
  return rest;
}

type MetadataLike = Record<string, unknown> | null | undefined;

function asMetadata(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

export function readItemTags(input: { tags?: unknown; metadata?: MetadataLike }) {
  const directTags = Array.isArray(input.tags) ? input.tags : [];
  const metadataTags = Array.isArray(asMetadata(input.metadata).tags) ? (asMetadata(input.metadata).tags as unknown[]) : [];

  return Array.from(
    new Set([...directTags, ...metadataTags].map((tag) => String(tag ?? "").trim().toLowerCase()).filter(Boolean)),
  );
}

export function withStoredTags(metadata: MetadataLike, tags: string[]) {
  return {
    ...asMetadata(metadata),
    tags,
  };
}

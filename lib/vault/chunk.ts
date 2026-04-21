export function chunkMarkdown(content: string, maxChars = 1800): string[] {
  const normalized = content.trim();
  if (!normalized) return [];

  const paragraphs = normalized.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const chunks: string[] = [];
  let buffer = "";

  for (const paragraph of paragraphs) {
    if (!buffer) {
      buffer = paragraph;
      continue;
    }

    if ((buffer + "\n\n" + paragraph).length <= maxChars) {
      buffer += `\n\n${paragraph}`;
      continue;
    }

    chunks.push(buffer);
    buffer = paragraph;
  }

  if (buffer) chunks.push(buffer);
  return chunks;
}

export function extractFrontmatter(markdown: string) {
  const trimmed = markdown.trimStart();
  if (!trimmed.startsWith("---")) {
    return { frontmatter: {}, body: markdown } as const;
  }

  const end = trimmed.indexOf("\n---", 3);
  if (end === -1) {
    return { frontmatter: {}, body: markdown } as const;
  }

  const block = trimmed.slice(3, end).trim();
  const body = trimmed.slice(end + 4).trimStart();
  const frontmatter: Record<string, string> = {};

  for (const line of block.split("\n")) {
    const separator = line.indexOf(":");
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (key) frontmatter[key] = value;
  }

  return { frontmatter, body } as const;
}

/**
 * Split raw inbox input into individual item chunks.
 * Shared between client (preview) and server (action).
 */

export function splitInboxChunks(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];

  // 1. Blank-line separated paragraphs
  const blankLineParts = trimmed.split(/\n\s*\n/).map((c) => c.trim()).filter(Boolean);
  if (blankLineParts.length > 1) return blankLineParts;

  // 2. Newline-separated short lines
  const lines = trimmed.split(/\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length > 1 && lines.every((l) => l.length <= 120)) {
    return lines.map((l) => l.replace(/[,;]+$/, "").trim()).filter(Boolean);
  }

  // 3. Comma/semicolon separated (single line only)
  if (lines.length === 1) {
    const parts = lines[0].split(/[,;]/).map((p) => p.trim()).filter(Boolean);
    if (parts.length > 1 && parts.every((part) => part.length <= 120)) return parts;
  }

  // 4. Single item
  return [trimmed];
}

export function countChunks(raw: string): number {
  return splitInboxChunks(raw).length;
}

"use client";

import { useState, useCallback } from "react";

/**
 * Modal that shows detected item chunks with merge/split/edit/delete controls.
 * User can confirm or adjust before submitting to the server action.
 */
export function ChunkPreviewModal({
  chunks: initialChunks,
  onConfirm,
  onCancel,
}: {
  chunks: string[];
  onConfirm: (finalChunks: string[]) => void;
  onCancel: () => void;
}) {
  const [chunks, setChunks] = useState<string[]>(initialChunks);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");

  const mergeAll = useCallback(() => {
    setChunks([chunks.join(" ")]);
    setEditingIdx(null);
  }, [chunks]);

  const mergeWithNext = useCallback(
    (idx: number) => {
      if (idx >= chunks.length - 1) return;
      const updated = [...chunks];
      updated[idx] = `${updated[idx]} ${updated[idx + 1]}`;
      updated.splice(idx + 1, 1);
      setChunks(updated);
      setEditingIdx(null);
    },
    [chunks],
  );

  const splitAtCursor = useCallback(
    (idx: number) => {
      const text = chunks[idx];
      // Split at the first sentence boundary (period + space), or midpoint
      const splitPoint = text.search(/\.\s/) + 1 || Math.floor(text.length / 2);
      const part1 = text.slice(0, splitPoint).trim();
      const part2 = text.slice(splitPoint).trim();
      if (!part1 || !part2) return;
      const updated = [...chunks];
      updated.splice(idx, 1, part1, part2);
      setChunks(updated);
      setEditingIdx(null);
    },
    [chunks],
  );

  const deleteChunk = useCallback(
    (idx: number) => {
      if (chunks.length <= 1) return;
      const updated = chunks.filter((_, i) => i !== idx);
      setChunks(updated);
      setEditingIdx(null);
    },
    [chunks],
  );

  const startEdit = useCallback(
    (idx: number) => {
      setEditingIdx(idx);
      setEditValue(chunks[idx]);
    },
    [chunks],
  );

  const saveEdit = useCallback(
    (idx: number) => {
      const trimmed = editValue.trim();
      if (!trimmed) return;
      const updated = [...chunks];
      updated[idx] = trimmed;
      setChunks(updated);
      setEditingIdx(null);
    },
    [chunks, editValue],
  );

  const moveUp = useCallback(
    (idx: number) => {
      if (idx === 0) return;
      const updated = [...chunks];
      [updated[idx - 1], updated[idx]] = [updated[idx], updated[idx - 1]];
      setChunks(updated);
    },
    [chunks],
  );

  const moveDown = useCallback(
    (idx: number) => {
      if (idx >= chunks.length - 1) return;
      const updated = [...chunks];
      [updated[idx], updated[idx + 1]] = [updated[idx + 1], updated[idx]];
      setChunks(updated);
    },
    [chunks],
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onCancel}>
      <div
        className="mx-4 flex max-h-[80vh] w-full max-w-lg flex-col rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-[var(--text)]">
              Review items ({chunks.length})
            </h2>
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">
              Merge, split, edit, reorder, or delete before adding
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md p-1 text-[var(--text-muted)] hover:text-[var(--text)] transition"
            aria-label="Close"
          >
            <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>

        {/* Merge all shortcut */}
        {chunks.length > 1 && (
          <div className="border-b border-[var(--border)] px-5 py-2">
            <button
              type="button"
              onClick={mergeAll}
              className="rounded-md border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-3 py-1.5 text-xs font-medium text-[var(--accent)] transition hover:bg-[var(--accent)]/20"
            >
              Keep as single item
            </button>
          </div>
        )}

        {/* Chunk list */}
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2">
          {chunks.map((chunk, idx) => (
            <div
              key={`${idx}-${chunk.slice(0, 20)}`}
              className="group rounded-lg border border-[var(--border)] bg-[var(--bg-muted)] p-3"
            >
              {/* Chunk number + content */}
              <div className="flex items-start gap-2">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--accent)]/15 text-[10px] font-bold text-[var(--accent)]">
                  {idx + 1}
                </span>
                {editingIdx === idx ? (
                  <textarea
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        saveEdit(idx);
                      }
                      if (e.key === "Escape") setEditingIdx(null);
                    }}
                    className="flex-1 resize-none rounded-md border border-[var(--accent)]/40 bg-[var(--bg)] px-2 py-1 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)]"
                    rows={2}
                    autoFocus
                  />
                ) : (
                  <p
                    className="flex-1 text-sm text-[var(--text)] cursor-pointer hover:text-[var(--accent)] transition"
                    onClick={() => startEdit(idx)}
                    title="Click to edit"
                  >
                    {chunk}
                  </p>
                )}
              </div>

              {/* Action buttons */}
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {/* Reorder */}
                <button
                  type="button"
                  onClick={() => moveUp(idx)}
                  disabled={idx === 0}
                  className="rounded border border-[var(--border)] px-1.5 py-0.5 text-[10px] text-[var(--text-muted)] transition hover:border-[var(--accent)] hover:text-[var(--text)] disabled:opacity-30 disabled:hover:border-[var(--border)]"
                  title="Move up"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => moveDown(idx)}
                  disabled={idx >= chunks.length - 1}
                  className="rounded border border-[var(--border)] px-1.5 py-0.5 text-[10px] text-[var(--text-muted)] transition hover:border-[var(--accent)] hover:text-[var(--text)] disabled:opacity-30 disabled:hover:border-[var(--border)]"
                  title="Move down"
                >
                  ↓
                </button>

                <span className="mx-1 h-3 w-px bg-[var(--border)]" />

                {/* Edit */}
                {editingIdx === idx ? (
                  <button
                    type="button"
                    onClick={() => saveEdit(idx)}
                    className="rounded border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-[10px] text-emerald-300 transition hover:bg-emerald-400/20"
                  >
                    Save
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => startEdit(idx)}
                    className="rounded border border-[var(--border)] px-2 py-0.5 text-[10px] text-[var(--text-muted)] transition hover:border-[var(--accent)] hover:text-[var(--text)]"
                  >
                    Edit
                  </button>
                )}

                {/* Merge with next */}
                {idx < chunks.length - 1 && (
                  <button
                    type="button"
                    onClick={() => mergeWithNext(idx)}
                    className="rounded border border-[var(--border)] px-2 py-0.5 text-[10px] text-[var(--text-muted)] transition hover:border-amber-300/40 hover:text-amber-200"
                    title="Merge with next item"
                  >
                    Merge ↓
                  </button>
                )}

                {/* Split */}
                <button
                  type="button"
                  onClick={() => splitAtCursor(idx)}
                  className="rounded border border-[var(--border)] px-2 py-0.5 text-[10px] text-[var(--text-muted)] transition hover:border-purple-300/40 hover:text-purple-200"
                  title="Split into two items"
                >
                  Split
                </button>

                {/* Delete */}
                {chunks.length > 1 && (
                  <button
                    type="button"
                    onClick={() => deleteChunk(idx)}
                    className="rounded border border-[var(--border)] px-2 py-0.5 text-[10px] text-rose-400/70 transition hover:border-rose-400/40 hover:text-rose-300"
                    title="Remove this item"
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-[var(--border)] px-5 py-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-muted)] transition hover:border-[var(--text-muted)] hover:text-[var(--text)]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(chunks.filter(Boolean))}
            className="rounded-md border border-[var(--accent)]/40 bg-[var(--accent)]/15 px-4 py-1.5 text-xs font-medium text-[var(--accent)] transition hover:bg-[var(--accent)]/25"
          >
            Add {chunks.length} {chunks.length === 1 ? "item" : "items"}
          </button>
        </div>
      </div>
    </div>
  );
}

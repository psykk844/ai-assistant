"use client";

import { useFormStatus } from "react-dom";
import { useState, useCallback } from "react";

function countChunks(raw: string): number {
  const trimmed = raw.trim();
  if (!trimmed) return 0;

  const blankLineParts = trimmed.split(/\n\s*\n/).map((c) => c.trim()).filter(Boolean);
  if (blankLineParts.length > 1) return blankLineParts.length;

  const lines = trimmed.split(/\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length > 1 && lines.every((l) => l.length <= 120)) return lines.length;

  if (lines.length === 1) {
    const parts = lines[0].split(/[,;]/).map((p) => p.trim()).filter(Boolean);
    if (parts.length > 1 && parts.every((p) => p.length <= 120)) return parts.length;
  }

  return 1;
}

export function InboxComposer({
  action,
  buttonClassName,
  textareaRef,
}: {
  action: (formData: FormData) => void;
  buttonClassName?: string;
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
}) {
  const [chunkCount, setChunkCount] = useState(0);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setChunkCount(countChunks(e.target.value));
  }, []);

  return (
    <form action={action} className="mt-4 space-y-3">
      <textarea
        ref={textareaRef}
        name="content"
        required
        onChange={handleChange}
        placeholder="Drop a thought, task, or URL...\n\nOne item per line, or separate with commas."
        className="h-28 w-full resize-y rounded-lg border border-[var(--border)] bg-[var(--bg-muted)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
      />
      <div className="flex items-center gap-3">
        <SubmitBtn count={chunkCount} className={buttonClassName} />
        {chunkCount > 1 && <span className="text-xs text-[var(--text-muted)]">{chunkCount} items detected</span>}
      </div>
    </form>
  );
}

function SubmitBtn({ count, className }: { count: number; className?: string }) {
  const { pending } = useFormStatus();

  const idleLabel = count > 1 ? `Add ${count} items` : "Add to inbox";
  const pendingLabel = count > 1 ? `Classifying ${count} items...` : "Classifying...";

  return (
    <button type="submit" disabled={pending} className={className}>
      {pending ? pendingLabel : idleLabel}
    </button>
  );
}

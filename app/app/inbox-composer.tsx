"use client";

import { useFormStatus } from "react-dom";
import { useState, useCallback, useRef, useTransition } from "react";
import { splitInboxChunks, countChunks } from "@/lib/items/split-chunks";
import { LANE_LABELS, type LaneKey } from "@/lib/items/lane";
import { ChunkPreviewModal } from "./chunk-preview-modal";

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
  const [showPreview, setShowPreview] = useState(false);
  const [pendingChunks, setPendingChunks] = useState<string[]>([]);
  const [rawContent, setRawContent] = useState("");
  const [selectedLane, setSelectedLane] = useState<"" | LaneKey>("");
  const formRef = useRef<HTMLFormElement>(null);
  const chunksInputRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setRawContent(val);
    setChunkCount(countChunks(val));
  }, []);

  const handleSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      const raw = rawContent.trim();
      if (!raw) return;

      const chunks = splitInboxChunks(raw);
      if (chunks.length > 1) {
        e.preventDefault();
        setPendingChunks(chunks);
        setShowPreview(true);
      }
      // If single chunk, let the form submit normally (no chunks field → server auto-splits to 1)
    },
    [rawContent],
  );

  const handleConfirm = useCallback(
    (finalChunks: string[]) => {
      setShowPreview(false);
      if (finalChunks.length === 0) return;

      // Submit via the server action with pre-split chunks
      const fd = new FormData();
      fd.set("content", rawContent.trim());
      fd.set("chunks", JSON.stringify(finalChunks));
      if (selectedLane) fd.set("lane", selectedLane);

      startTransition(() => {
        action(fd);
      });

      // Clear the textarea
      setRawContent("");
      setChunkCount(0);
      if (textareaRef?.current) {
        textareaRef.current.value = "";
      } else if (formRef.current) {
        const ta = formRef.current.querySelector("textarea");
        if (ta) ta.value = "";
      }
    },
    [rawContent, selectedLane, action, textareaRef],
  );

  const handleCancel = useCallback(() => {
    setShowPreview(false);
    setPendingChunks([]);
  }, []);

  return (
    <>
      <form ref={formRef} action={action} onSubmit={handleSubmit} className="mt-4 space-y-3">
        <textarea
          ref={textareaRef}
          name="content"
          required
          onChange={handleChange}
          placeholder="Drop a thought, task, or URL...\n\nOne item per line, or separate with commas."
          className="h-28 w-full resize-y rounded-lg border border-[var(--border)] bg-[var(--bg-muted)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
        />
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
            <span>Lane</span>
            <select
              name="lane"
              value={selectedLane}
              onChange={(e) => setSelectedLane(e.target.value as "" | LaneKey)}
              className="rounded-md border border-[var(--border)] bg-[var(--bg-muted)] px-2 py-1 text-xs text-[var(--text)]"
            >
              <option value="">Auto</option>
              <option value="today">{LANE_LABELS.today}</option>
              <option value="next">{LANE_LABELS.next}</option>
              <option value="upcoming">{LANE_LABELS.upcoming}</option>
              <option value="backlog">{LANE_LABELS.backlog}</option>
            </select>
          </label>
          <SubmitBtn count={chunkCount} isPending={isPending} className={buttonClassName} />
          {chunkCount > 1 && (
            <span className="text-xs text-[var(--text-muted)]">
              {chunkCount} items detected — click to review
            </span>
          )}
        </div>
      </form>

      {showPreview && (
        <ChunkPreviewModal
          chunks={pendingChunks}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        />
      )}
    </>
  );
}

function SubmitBtn({
  count,
  isPending,
  className,
}: {
  count: number;
  isPending: boolean;
  className?: string;
}) {
  const { pending } = useFormStatus();
  const isSubmitting = pending || isPending;

  const idleLabel = count > 1 ? `Review ${count} items` : "Add to inbox";
  const pendingLabel = count > 1 ? `Classifying ${count} items...` : "Classifying...";

  return (
    <button type="submit" disabled={isSubmitting} className={className}>
      {isSubmitting ? pendingLabel : idleLabel}
    </button>
  );
}

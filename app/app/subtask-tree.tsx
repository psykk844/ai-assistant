"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { InboxItem } from "@/lib/items/types";
import { buildSubtaskTree, getSubtaskProgress, type TreeNode } from "@/lib/items/subtask-tree";
import { createSubtask, updateItemStatus } from "./actions";

interface SubtaskTreePanelProps {
  itemId: string;
  allItems: InboxItem[];
}

export function SubtaskTreePanel({ itemId, allItems }: SubtaskTreePanelProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [newSubtaskTitle, setNewSubtaskTitle] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const tree = buildSubtaskTree(allItems);
  const rootNode = tree.find((n) => n.item.id === itemId);
  if (!rootNode) return null;

  const progress = getSubtaskProgress(rootNode);

  const handleAddSubtask = () => {
    if (!newSubtaskTitle.trim()) return;
    startTransition(async () => {
      await createSubtask(itemId, newSubtaskTitle.trim());
      setNewSubtaskTitle("");
      router.refresh();
    });
  };

  const handleComplete = (id: string, currentStatus: string) => {
    // Toggle: completed → active; anything else → completed
    const nextStatus = currentStatus === "completed" ? "active" : "completed";
    startTransition(async () => {
      const form = new FormData();
      form.set("itemId", id);
      form.set("status", nextStatus);
      await updateItemStatus(form);
      router.refresh();
    });
  };

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const renderNode = (node: TreeNode): React.ReactElement => {
    const hasChildren = node.children.length > 0;
    const isExpanded = expanded.has(node.item.id);

    return (
      <div key={node.item.id} style={{ paddingLeft: `${node.depth * 16}px` }}>
        <div className="flex items-center gap-2 py-1 group">
          {hasChildren ? (
            <button onClick={() => toggleExpand(node.item.id)} className="w-4 text-xs text-[var(--text-muted)]">
              {isExpanded ? "▼" : "▶"}
            </button>
          ) : (
            <span className="w-4" />
          )}
          <button
            onClick={() => handleComplete(node.item.id, node.item.status)}
            className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] ${
              node.item.status === "completed"
                ? "bg-[var(--success)] border-[var(--success)] text-white"
                : "border-[var(--border)] hover:border-[var(--accent)]"
            }`}
            aria-label={node.item.status === "completed" ? "Reopen subtask" : "Complete subtask"}
          >
            {node.item.status === "completed" && "✓"}
          </button>
          <span className={`text-xs flex-1 ${node.item.status === "completed" ? "line-through text-[var(--text-muted)]" : "text-[var(--text)]"}`}>
            {node.item.title || node.item.content.slice(0, 40)}
          </span>
        </div>
        {isExpanded && node.children.map(renderNode)}
      </div>
    );
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm text-[var(--text-muted)]">Subtasks</span>
        {progress.total > 0 && (
          <span className="text-xs text-[var(--text-muted)]">
            {progress.completed}/{progress.total} done
          </span>
        )}
      </div>
      {rootNode.children.length > 0 && (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-2">
          {rootNode.children.map(renderNode)}
        </div>
      )}
      <div className="flex gap-2">
        <input
          type="text"
          value={newSubtaskTitle}
          onChange={(e) => setNewSubtaskTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleAddSubtask();
            }
          }}
          placeholder="Add subtask..."
          className="flex-1 rounded-md border border-[var(--border)] bg-[var(--bg-muted)] px-2 py-1 text-xs"
        />
        <button
          onClick={handleAddSubtask}
          disabled={isPending || !newSubtaskTitle.trim()}
          className="rounded-md bg-[var(--accent)] px-2 py-1 text-xs text-white disabled:opacity-50"
        >
          Add
        </button>
      </div>
    </div>
  );
}

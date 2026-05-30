"use client";

import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { ProjectTaskNode } from "@/lib/projects/types";
import { PROJECT_STATUS_ORDER, statusLabel, type ProjectTaskStatus } from "@/lib/projects/status";
import {
  archiveProjectTaskAction,
  createProjectChecklistItemAction,
  createProjectTaskAction,
  updateProjectChecklistItemAction,
  updateProjectTaskAction,
} from "./server-actions";

type TaskDetailDrawerProps = {
  task: ProjectTaskNode | null;
  projectId: string;
  onClose: () => void;
};

export function TaskDetailDrawer({ task, projectId, onClose }: TaskDetailDrawerProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<ProjectTaskStatus>("todo");
  const [dueDate, setDueDate] = useState("");
  const [checklistTitle, setChecklistTitle] = useState("");
  const [subtaskTitle, setSubtaskTitle] = useState("");
  const [mutationMessage, setMutationMessage] = useState<{ tone: "error" | "info"; text: string } | null>(null);
  const [checklistOverrides, setChecklistOverrides] = useState<Record<string, boolean>>({});
  const previousTaskId = useRef<string | null>(null);

  useEffect(() => {
    const nextTaskId = task?.id ?? null;
    const taskChanged = previousTaskId.current !== nextTaskId;
    previousTaskId.current = nextTaskId;

    setTitle(task?.title ?? "");
    setDescription(task?.description ?? "");
    setStatus(task?.status ?? "todo");
    setDueDate(task?.due_date ?? "");
    setChecklistTitle("");
    setSubtaskTitle("");
    if (taskChanged) setMutationMessage(null);
    setChecklistOverrides((current) => {
      if (taskChanged || !task) return {};

      const checklistById = new Map(task.checklist.map((item) => [item.id, item.completed]));
      const next = { ...current };
      let changed = false;

      for (const [id, completed] of Object.entries(current)) {
        const savedValue = checklistById.get(id);
        if (savedValue === undefined || savedValue === completed) {
          delete next[id];
          changed = true;
        }
      }

      return changed ? next : current;
    });
  }, [task]);

  if (!task) return null;
  const currentTask = task;

  function resetEditableFields(source: ProjectTaskNode) {
    setTitle(source.title);
    setDescription(source.description ?? "");
    setStatus(source.status);
    setDueDate(source.due_date ?? "");
  }

  function runMutation(
    action: () => Promise<void>,
    options: { onSuccess?: () => void; onFailure?: () => void; failureMessage?: string } = {},
  ) {
    startTransition(async () => {
      setMutationMessage(null);
      try {
        await action();
        options.onSuccess?.();
        setMutationMessage({ tone: "info", text: "Saved." });
        router.refresh();
      } catch (error) {
        resetEditableFields(currentTask);
        options.onFailure?.();
        setMutationMessage({ tone: "error", text: options.failureMessage ?? "Save failed. Please try again." });
        console.error("Failed to update project task detail", { taskId: currentTask.id, error });
        router.refresh();
      }
    });
  }

  function updateTask(patch: Parameters<typeof updateProjectTaskAction>[1]) {
    runMutation(() => updateProjectTaskAction(currentTask.id, patch));
  }

  function handleTitleBlur() {
    const nextTitle = title.trim();
    if (!nextTitle || nextTitle === currentTask.title) {
      setTitle(currentTask.title);
      return;
    }
    updateTask({ title: nextTitle });
  }

  function handleDescriptionBlur() {
    if (description === (currentTask.description ?? "")) return;
    updateTask({ description });
  }

  function handleAddChecklistItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextTitle = checklistTitle.trim();
    if (!nextTitle) return;
    runMutation(() => createProjectChecklistItemAction(currentTask.id, nextTitle), {
      onSuccess: () => setChecklistTitle(""),
      failureMessage: "Could not add checklist item. Please try again.",
    });
  }

  function handleAddSubtask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextTitle = subtaskTitle.trim();
    if (!nextTitle || !projectId) return;

    const formData = new FormData();
    formData.set("projectId", projectId);
    formData.set("parentTaskId", currentTask.id);
    formData.set("status", "todo");
    formData.set("title", nextTitle);

    runMutation(() => createProjectTaskAction(formData), {
      onSuccess: () => setSubtaskTitle(""),
      failureMessage: "Could not add subtask. Please try again.",
    });
  }

  function handleArchive() {
    runMutation(async () => {
      await archiveProjectTaskAction(currentTask.id);
      onClose();
    }, {
      failureMessage: "Could not archive task. Please try again.",
    });
  }

  return (
    <aside className="fixed right-0 top-0 z-40 h-screen w-full max-w-md overflow-y-auto border-l border-[var(--border)] bg-[var(--bg-elevated)] p-5 text-[var(--text)] shadow-2xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-mono uppercase tracking-[0.2em] text-[var(--text-muted)]">Task detail</p>
          <p
            className={`mt-2 min-h-5 text-xs ${
              mutationMessage?.tone === "error" ? "text-red-300" : "text-[var(--text-muted)]"
            }`}
          >
            {isPending ? "Saving..." : mutationMessage?.text ?? "Changes save on edit"}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-[var(--border)] px-3 py-2 text-sm text-[var(--text-muted)] transition hover:border-[var(--accent)] hover:text-[var(--text)]"
        >
          Close
        </button>
      </div>

      <div className="mt-5 space-y-4">
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onBlur={handleTitleBlur}
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-muted)] px-3 py-2 text-xl font-semibold outline-none focus:border-[var(--accent)]"
          disabled={isPending}
        />

        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          onBlur={handleDescriptionBlur}
          placeholder="Add a description"
          rows={5}
          className="w-full resize-none rounded-lg border border-[var(--border)] bg-[var(--bg-muted)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
          disabled={isPending}
        />

        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1 text-xs font-medium text-[var(--text-muted)]">
            <span>Status</span>
            <select
              value={status}
              onChange={(event) => {
                const nextStatus = event.target.value as ProjectTaskStatus;
                setStatus(nextStatus);
                updateTask({ status: nextStatus });
              }}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-muted)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)]"
              disabled={isPending}
            >
              {PROJECT_STATUS_ORDER.map((status) => (
                <option key={status} value={status}>
                  {statusLabel(status)}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-xs font-medium text-[var(--text-muted)]">
            <span>Due date</span>
            <input
              type="date"
              value={dueDate}
              onChange={(event) => {
                setDueDate(event.target.value);
                updateTask({ due_date: event.target.value || null });
              }}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-muted)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)]"
              disabled={isPending}
            />
          </label>
        </div>
      </div>

      <section className="mt-6 border-t border-[var(--border)] pt-5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Checklist</h2>
          <span className="text-xs text-[var(--text-muted)]">{currentTask.checklist.length}</span>
        </div>

        <div className="mt-3 space-y-2">
          {currentTask.checklist.length === 0 ? (
            <p className="rounded-lg border border-dashed border-[var(--border)] p-3 text-sm text-[var(--text-muted)]">
              No checklist items.
            </p>
          ) : (
            currentTask.checklist.map((item) => {
              const checked = checklistOverrides[item.id] ?? item.completed;

              return (
                <label
                  key={item.id}
                  className="flex items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-muted)] px-3 py-2 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(event) => {
                      const nextCompleted = event.target.checked;
                      setChecklistOverrides((current) => ({ ...current, [item.id]: nextCompleted }));
                      runMutation(() => updateProjectChecklistItemAction(item.id, { completed: nextCompleted }), {
                        onFailure: () =>
                          setChecklistOverrides((current) => ({ ...current, [item.id]: item.completed })),
                        failureMessage: "Could not update checklist item. Please try again.",
                      });
                    }}
                    disabled={isPending}
                  />
                  <span className={checked ? "text-[var(--text-muted)] line-through" : ""}>{item.title}</span>
                </label>
              );
            })
          )}
        </div>

        <form onSubmit={handleAddChecklistItem} className="mt-3 flex gap-2">
          <input
            value={checklistTitle}
            onChange={(event) => setChecklistTitle(event.target.value)}
            placeholder="Add checklist item"
            className="min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg-muted)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
            disabled={isPending}
          />
          <button
            type="submit"
            className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-medium text-black transition hover:bg-[var(--accent-strong)] disabled:opacity-60"
            disabled={isPending || !checklistTitle.trim()}
          >
            Add
          </button>
        </form>
      </section>

      <section className="mt-6 border-t border-[var(--border)] pt-5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Subtasks</h2>
          <span className="text-xs text-[var(--text-muted)]">{currentTask.subtasks.length}</span>
        </div>

        <div className="mt-3 space-y-2">
          {currentTask.subtasks.length === 0 ? (
            <p className="rounded-lg border border-dashed border-[var(--border)] p-3 text-sm text-[var(--text-muted)]">
              No subtasks.
            </p>
          ) : (
            currentTask.subtasks.map((subtask) => (
              <div key={subtask.id} className="rounded-lg border border-[var(--border)] bg-[var(--bg-muted)] px-3 py-2">
                <p className="text-sm font-medium">{subtask.title}</p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">{statusLabel(subtask.status)}</p>
              </div>
            ))
          )}
        </div>

        <form onSubmit={handleAddSubtask} className="mt-3 flex gap-2">
          <input
            value={subtaskTitle}
            onChange={(event) => setSubtaskTitle(event.target.value)}
            placeholder="Add subtask"
            className="min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg-muted)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
            disabled={isPending}
          />
          <button
            type="submit"
            className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-medium text-black transition hover:bg-[var(--accent-strong)] disabled:opacity-60"
            disabled={isPending || !subtaskTitle.trim() || !projectId}
          >
            Add
          </button>
        </form>
      </section>

      <button
        type="button"
        onClick={handleArchive}
        className="mt-6 w-full rounded-lg border border-red-500/50 px-3 py-2 text-sm font-medium text-red-300 transition hover:bg-red-500/10 disabled:opacity-60"
        disabled={isPending}
      >
        Archive task
      </button>
    </aside>
  );
}

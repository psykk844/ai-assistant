"use client";

import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { mergeChecklistTitleDrafts } from "@/lib/projects/checklist-drafts";
import type { ProjectTaskNode } from "@/lib/projects/types";
import { PROJECT_STATUS_ORDER, statusLabel, type ProjectTaskStatus } from "@/lib/projects/status";
import {
  archiveProjectTaskAction,
  addProjectTaskFocusAction,
  createProjectChecklistItemAction,
  createProjectTaskAction,
  deleteProjectChecklistItemAction,
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
  const [checklistTitleDrafts, setChecklistTitleDrafts] = useState<Record<string, string>>({});
  const [subtaskTitle, setSubtaskTitle] = useState("");
  const [subtaskTitleDrafts, setSubtaskTitleDrafts] = useState<Record<string, string>>({});
  const [mutationMessage, setMutationMessage] = useState<{ tone: "error" | "info"; text: string } | null>(null);
  const [checklistOverrides, setChecklistOverrides] = useState<Record<string, boolean>>({});
  const [focusedTaskIds, setFocusedTaskIds] = useState<Set<string>>(() => new Set());
  const previousTaskId = useRef<string | null>(null);
  const dirtyChecklistTitleIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    const nextTaskId = task?.id ?? null;
    const taskChanged = previousTaskId.current !== nextTaskId;
    previousTaskId.current = nextTaskId;

    setTitle(task?.title ?? "");
    setDescription(task?.description ?? "");
    setStatus(task?.status ?? "todo");
    setDueDate(task?.due_date ?? "");
    setChecklistTitle("");
    if (taskChanged || !task) {
      dirtyChecklistTitleIds.current.clear();
    } else {
      const currentChecklistIds = new Set(task.checklist.map((item) => item.id));
      for (const itemId of dirtyChecklistTitleIds.current) {
        if (!currentChecklistIds.has(itemId)) {
          dirtyChecklistTitleIds.current.delete(itemId);
        }
      }
    }
    setChecklistTitleDrafts((current) =>
      mergeChecklistTitleDrafts(task?.checklist ?? [], current, dirtyChecklistTitleIds.current),
    );
    setSubtaskTitle("");
    setSubtaskTitleDrafts(Object.fromEntries((task?.subtasks ?? []).map((subtask) => [subtask.id, subtask.title])));
    if (taskChanged) {
      setMutationMessage(null);
      setFocusedTaskIds(new Set());
    }
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
    options: { onSuccess?: () => void; onFailure?: () => void; successMessage?: string; failureMessage?: string } = {},
  ) {
    startTransition(async () => {
      setMutationMessage(null);
      try {
        await action();
        options.onSuccess?.();
        setMutationMessage({ tone: "info", text: options.successMessage ?? "Saved." });
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

  function handleChecklistTitleSave(item: ProjectTaskNode["checklist"][number]) {
    const nextTitle = (checklistTitleDrafts[item.id] ?? item.title).trim();
    if (!nextTitle) {
      setMutationMessage({ tone: "error", text: "Checklist title is required." });
      dirtyChecklistTitleIds.current.delete(item.id);
      setChecklistTitleDrafts((current) => ({ ...current, [item.id]: item.title }));
      return;
    }
    if (nextTitle === item.title) {
      dirtyChecklistTitleIds.current.delete(item.id);
      setChecklistTitleDrafts((current) => ({ ...current, [item.id]: item.title }));
      return;
    }

    runMutation(() => updateProjectChecklistItemAction(item.id, { title: nextTitle }), {
      onSuccess: () => {
        dirtyChecklistTitleIds.current.delete(item.id);
        setChecklistTitleDrafts((current) => ({ ...current, [item.id]: nextTitle }));
      },
      onFailure: () => {
        dirtyChecklistTitleIds.current.delete(item.id);
        setChecklistTitleDrafts((current) => ({ ...current, [item.id]: item.title }));
      },
      failureMessage: "Could not update checklist item. Please try again.",
    });
  }

  function handleMoveChecklistItem(itemId: string, direction: "up" | "down") {
    const currentIndex = currentTask.checklist.findIndex((item) => item.id === itemId);
    const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= currentTask.checklist.length) return;

    const nextOrder = [...currentTask.checklist];
    const [moved] = nextOrder.splice(currentIndex, 1);
    nextOrder.splice(targetIndex, 0, moved);

    runMutation(
      async () => {
        await Promise.all(
          nextOrder.map((item, index) => updateProjectChecklistItemAction(item.id, { position: (index + 1) * 1000 })),
        );
      },
      { failureMessage: "Could not reorder checklist. Please try again." },
    );
  }

  function handleRemoveChecklistItem(itemId: string) {
    dirtyChecklistTitleIds.current.delete(itemId);
    runMutation(() => deleteProjectChecklistItemAction(itemId), {
      failureMessage: "Could not remove checklist item. Please try again.",
    });
  }

  function handleSubtaskTitleSave(subtask: ProjectTaskNode["subtasks"][number]) {
    const nextTitle = (subtaskTitleDrafts[subtask.id] ?? subtask.title).trim();
    if (!nextTitle) {
      setMutationMessage({ tone: "error", text: "Subtask title is required." });
      setSubtaskTitleDrafts((current) => ({ ...current, [subtask.id]: subtask.title }));
      return;
    }
    if (nextTitle === subtask.title) return;

    runMutation(() => updateProjectTaskAction(subtask.id, { title: nextTitle }), {
      onFailure: () => setSubtaskTitleDrafts((current) => ({ ...current, [subtask.id]: subtask.title })),
      failureMessage: "Could not update subtask. Please try again.",
    });
  }

  function handleMoveSubtask(subtaskId: string, direction: "up" | "down") {
    const currentIndex = currentTask.subtasks.findIndex((subtask) => subtask.id === subtaskId);
    const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= currentTask.subtasks.length) return;

    const nextOrder = [...currentTask.subtasks];
    const [moved] = nextOrder.splice(currentIndex, 1);
    nextOrder.splice(targetIndex, 0, moved);

    runMutation(
      async () => {
        await Promise.all(
          nextOrder.map((subtask, index) => updateProjectTaskAction(subtask.id, { position: (index + 1) * 1000 })),
        );
      },
      { failureMessage: "Could not reorder subtasks. Please try again." },
    );
  }

  function handleArchiveSubtask(subtaskId: string) {
    runMutation(() => archiveProjectTaskAction(subtaskId), {
      failureMessage: "Could not remove subtask. Please try again.",
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

  function handleAddToToday(taskId: string) {
    const formData = new FormData();
    formData.set("taskId", taskId);

    runMutation(() => addProjectTaskFocusAction(formData), {
      onSuccess: () => setFocusedTaskIds((current) => new Set(current).add(taskId)),
      successMessage: "Added to Today.",
      failureMessage: "Could not add to Today. Please try again.",
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
            currentTask.checklist.map((item, index) => {
              const checked = checklistOverrides[item.id] ?? item.completed;
              const draftTitle = checklistTitleDrafts[item.id] ?? item.title;
              const titleChanged = draftTitle.trim() !== item.title;

              return (
                <div
                  key={item.id}
                  className="rounded-lg border border-[var(--border)] bg-[var(--bg-muted)] px-3 py-2 text-sm"
                >
                  <div className="flex items-center gap-3">
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
                    <label className="sr-only" htmlFor={`checklist-title-${item.id}`}>
                      Checklist item title
                    </label>
                    <input
                      id={`checklist-title-${item.id}`}
                      value={draftTitle}
                      onChange={(event) => {
                        const nextTitle = event.target.value;
                        if (nextTitle.trim() === item.title) {
                          dirtyChecklistTitleIds.current.delete(item.id);
                        } else {
                          dirtyChecklistTitleIds.current.add(item.id);
                        }
                        setChecklistTitleDrafts((current) => ({ ...current, [item.id]: nextTitle }));
                      }}
                      onBlur={() => {
                        if (titleChanged) handleChecklistTitleSave(item);
                      }}
                      className={`min-w-0 flex-1 rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-1.5 outline-none focus:border-[var(--accent)] ${
                        checked ? "text-[var(--text-muted)] line-through" : ""
                      }`}
                      disabled={isPending}
                    />
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 pl-7">
                    <button
                      type="button"
                      onClick={() => handleChecklistTitleSave(item)}
                      className="rounded-md border border-[var(--border)] px-2 py-1 text-xs text-[var(--text-muted)] transition hover:border-[var(--accent)] hover:text-[var(--text)] disabled:opacity-60"
                      disabled={isPending || !draftTitle.trim() || !titleChanged}
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMoveChecklistItem(item.id, "up")}
                      className="rounded-md border border-[var(--border)] px-2 py-1 text-xs text-[var(--text-muted)] transition hover:border-[var(--accent)] hover:text-[var(--text)] disabled:opacity-60"
                      disabled={isPending || index === 0}
                    >
                      Up
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMoveChecklistItem(item.id, "down")}
                      className="rounded-md border border-[var(--border)] px-2 py-1 text-xs text-[var(--text-muted)] transition hover:border-[var(--accent)] hover:text-[var(--text)] disabled:opacity-60"
                      disabled={isPending || index === currentTask.checklist.length - 1}
                    >
                      Down
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemoveChecklistItem(item.id)}
                      className="rounded-md border border-red-500/50 px-2 py-1 text-xs text-red-300 transition hover:bg-red-500/10 disabled:opacity-60"
                      disabled={isPending}
                    >
                      Remove
                    </button>
                  </div>
                </div>
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
            currentTask.subtasks.map((subtask, index) => {
              const draftTitle = subtaskTitleDrafts[subtask.id] ?? subtask.title;
              const titleChanged = draftTitle.trim() !== subtask.title;

              return (
              <div key={subtask.id} className="rounded-lg border border-[var(--border)] bg-[var(--bg-muted)] px-3 py-2">
                <div className="space-y-3">
                  <div>
                    <label className="sr-only" htmlFor={`subtask-title-${subtask.id}`}>
                      Subtask title
                    </label>
                    <input
                      id={`subtask-title-${subtask.id}`}
                      value={draftTitle}
                      onChange={(event) =>
                        setSubtaskTitleDrafts((current) => ({ ...current, [subtask.id]: event.target.value }))
                      }
                      onBlur={() => {
                        if (titleChanged) handleSubtaskTitleSave(subtask);
                      }}
                      className="w-full rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-1.5 text-sm font-medium outline-none focus:border-[var(--accent)]"
                      disabled={isPending}
                    />
                    <p className="mt-1 text-xs text-[var(--text-muted)]">{statusLabel(subtask.status)}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleSubtaskTitleSave(subtask)}
                      className="rounded-md border border-[var(--border)] px-2 py-1 text-xs text-[var(--text-muted)] transition hover:border-[var(--accent)] hover:text-[var(--text)] disabled:opacity-60"
                      disabled={isPending || !draftTitle.trim() || !titleChanged}
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMoveSubtask(subtask.id, "up")}
                      className="rounded-md border border-[var(--border)] px-2 py-1 text-xs text-[var(--text-muted)] transition hover:border-[var(--accent)] hover:text-[var(--text)] disabled:opacity-60"
                      disabled={isPending || index === 0}
                    >
                      Up
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMoveSubtask(subtask.id, "down")}
                      className="rounded-md border border-[var(--border)] px-2 py-1 text-xs text-[var(--text-muted)] transition hover:border-[var(--accent)] hover:text-[var(--text)] disabled:opacity-60"
                      disabled={isPending || index === currentTask.subtasks.length - 1}
                    >
                      Down
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAddToToday(subtask.id)}
                      className="rounded-md border border-[var(--border)] px-2 py-1 text-xs text-[var(--text-muted)] transition hover:border-[var(--accent)] hover:text-[var(--text)] disabled:opacity-60"
                      disabled={isPending || subtask.status === "done" || focusedTaskIds.has(subtask.id)}
                    >
                      {focusedTaskIds.has(subtask.id) ? "Added" : isPending ? "Adding..." : "Today"}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleArchiveSubtask(subtask.id)}
                      className="rounded-md border border-red-500/50 px-2 py-1 text-xs text-red-300 transition hover:bg-red-500/10 disabled:opacity-60"
                      disabled={isPending}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>
              );
            })
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

      <div className="mt-6 grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => handleAddToToday(currentTask.id)}
          className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium text-[var(--text-muted)] transition hover:border-[var(--accent)] hover:text-[var(--text)] disabled:opacity-60"
          disabled={isPending || currentTask.status === "done" || focusedTaskIds.has(currentTask.id)}
        >
          {focusedTaskIds.has(currentTask.id) ? "Added to Today" : isPending ? "Adding..." : "Add to Today"}
        </button>
        <button
          type="button"
          onClick={handleArchive}
          className="w-full rounded-lg border border-red-500/50 px-3 py-2 text-sm font-medium text-red-300 transition hover:bg-red-500/10 disabled:opacity-60"
          disabled={isPending}
        >
          Archive task
        </button>
      </div>
    </aside>
  );
}

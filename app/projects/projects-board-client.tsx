"use client";

import { memo, useEffect, useMemo, useState, useTransition, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { ProjectBoard, ProjectTaskNode } from "@/lib/projects/types";
import { checklistProgress, groupTopLevelTasksByStatus, subtaskProgress } from "@/lib/projects/progress";
import { PROJECT_STATUS_ORDER, statusLabel, type ProjectTaskStatus } from "@/lib/projects/status";
import { positionForProjectDrop, type ProjectDropPlacement } from "./project-drop-position";
import { createProjectAction, createProjectTaskAction, moveProjectTaskAction } from "./server-actions";

type ProjectsBoardClientProps = {
  initialBoard: ProjectBoard;
};

function statusTone(status: ProjectTaskStatus) {
  const tones: Record<ProjectTaskStatus, string> = {
    backlog: "var(--text-muted)",
    todo: "var(--lane-next)",
    doing: "var(--accent)",
    waiting: "#f2c94c",
    done: "#79d19a",
  };
  return tones[status];
}

function isStatusDropId(value: string): value is `status:${ProjectTaskStatus}` {
  return PROJECT_STATUS_ORDER.some((status) => value === `status:${status}`);
}

function filterTasks(tasks: ProjectTaskNode[], query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return tasks;

  return tasks.filter((task) => {
    const haystack = [
      task.title,
      task.description ?? "",
      task.labels.map((label) => label.name).join(" "),
      task.subtasks.map((subtask) => subtask.title).join(" "),
      task.checklist.map((item) => item.title).join(" "),
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(needle);
  });
}

function dropPlacementFromRects(event: DragEndEvent): ProjectDropPlacement {
  const activeRect = event.active.rect.current.translated ?? event.active.rect.current.initial;
  const overRect = event.over?.rect;
  if (!activeRect || !overRect) return "before";

  const activeCenterY = activeRect.top + activeRect.height / 2;
  const overCenterY = overRect.top + overRect.height / 2;
  return activeCenterY > overCenterY ? "after" : "before";
}

export function ProjectsBoardClient({ initialBoard }: ProjectsBoardClientProps) {
  const [board, setBoard] = useState(initialBoard);
  const [query, setQuery] = useState("");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const activeProject = board.activeProject;
  const filteredTasks = useMemo(() => filterTasks(board.tasks, query), [board.tasks, query]);
  const grouped = useMemo(() => groupTopLevelTasksByStatus(filteredTasks), [filteredTasks]);

  useEffect(() => setBoard(initialBoard), [initialBoard]);

  function handleDragEnd(event: DragEndEvent) {
    const activeId = String(event.active.id ?? "");
    const overId = event.over?.id ? String(event.over.id) : null;
    if (!activeId) return;

    const draggedTask = board.tasks.find((task) => task.id === activeId);
    if (!draggedTask || draggedTask.parent_task_id) return;

    let toStatus: ProjectTaskStatus | null = null;
    let overTaskId: string | null = null;
    let placement: ProjectDropPlacement = "after";
    if (overId && isStatusDropId(overId)) {
      toStatus = overId.replace("status:", "") as ProjectTaskStatus;
    } else if (overId) {
      const overTask = board.tasks.find((task) => task.id === overId);
      if (overTask) {
        if (overTask.id === activeId) return;
        toStatus = overTask.status;
        overTaskId = overTask.id;
        placement = dropPlacementFromRects(event);
      }
    }

    if (!toStatus) return;

    const targetItems = board.tasks
      .filter((task) => !task.parent_task_id && !task.archived_at && task.status === toStatus)
      .sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at));
    const nextPosition = positionForProjectDrop(targetItems, activeId, overTaskId, placement);

    if (draggedTask.status === toStatus && draggedTask.position === nextPosition) return;

    const previousBoard = board;
    setStatusMessage("Moving task...");
    setBoard((current) => ({
      ...current,
      tasks: current.tasks.map((task) =>
        task.id === activeId ? { ...task, status: toStatus, position: nextPosition } : task,
      ),
    }));

    startTransition(async () => {
      const formData = new FormData();
      formData.set("taskId", activeId);
      formData.set("status", toStatus);
      formData.set("position", String(nextPosition));

      try {
        await moveProjectTaskAction(formData);
        setStatusMessage("Task moved.");
        router.refresh();
      } catch (error) {
        setBoard(previousBoard);
        setStatusMessage("Move failed. Please try again.");
        console.error("Failed to move project task", { taskId: activeId, toStatus, error });
        router.refresh();
      }
    });
  }

  return (
    <main className="min-h-screen bg-[var(--bg)] p-4 text-[var(--text)] md:p-6">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <div className="mx-auto grid max-w-7xl gap-4 lg:grid-cols-[260px_1fr]">
          <aside className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-mono uppercase tracking-[0.2em] text-[var(--text-muted)]">Projects</p>
                <h2 className="mt-2 text-lg font-semibold">Kanban</h2>
              </div>
              <a
                href="/app"
                className="rounded-md border border-[var(--border)] px-3 py-2 text-sm text-[var(--text-muted)] hover:bg-[var(--bg-muted)] hover:text-[var(--text)]"
              >
                Inbox
              </a>
            </div>

            <nav className="mt-4 space-y-2">
              {board.projects.length === 0 ? (
                <p className="rounded-lg border border-dashed border-[var(--border)] p-3 text-sm text-[var(--text-muted)]">
                  Add a project to start planning.
                </p>
              ) : (
                board.projects.map((project) => (
                  <a
                    key={project.id}
                    href={`/projects?project=${encodeURIComponent(project.id)}`}
                    className={`block rounded-lg border px-3 py-2 text-sm transition ${
                      project.id === activeProject?.id
                        ? "border-[var(--accent)] bg-[color-mix(in_oklab,var(--accent)_14%,transparent)] text-[var(--text)]"
                        : "border-[var(--border)] bg-[var(--bg-muted)] text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--text)]"
                    }`}
                  >
                    <span className="block font-medium">{project.name}</span>
                    {project.description && <span className="mt-1 block line-clamp-2 text-xs">{project.description}</span>}
                  </a>
                ))
              )}
            </nav>

            <form action={createProjectAction} className="mt-5 space-y-2">
              <p className="text-xs font-mono uppercase tracking-[0.2em] text-[var(--text-muted)]">Add project</p>
              <input
                name="name"
                placeholder="Project name"
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-muted)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
                required
              />
              <textarea
                name="description"
                placeholder="Optional description"
                rows={3}
                className="w-full resize-none rounded-lg border border-[var(--border)] bg-[var(--bg-muted)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
              />
              <button
                type="submit"
                className="w-full rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-medium text-black transition hover:bg-[var(--accent-strong)]"
              >
                Create project
              </button>
            </form>
          </aside>

          <section className="min-w-0 space-y-4">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5">
              <div className="flex flex-wrap items-start gap-3">
                <div>
                  <p className="text-xs font-mono uppercase tracking-[0.2em] text-[var(--text-muted)]">Project board</p>
                  <h1 className="mt-2 text-2xl font-semibold">{activeProject?.name ?? "No project selected"}</h1>
                  {activeProject?.description && (
                    <p className="mt-1 max-w-2xl text-sm text-[var(--text-muted)]">{activeProject.description}</p>
                  )}
                </div>
                <div className="ml-auto flex flex-wrap items-center gap-2">
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search tasks"
                    className="w-56 rounded-lg border border-[var(--border)] bg-[var(--bg-muted)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
                  />
                  {activeProject && (
                    <form action={createProjectTaskAction} className="flex gap-2">
                      <input type="hidden" name="projectId" value={activeProject.id} />
                      <input type="hidden" name="status" value="todo" />
                      <input
                        name="title"
                        placeholder="Fast add task"
                        className="w-48 rounded-lg border border-[var(--border)] bg-[var(--bg-muted)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
                        required
                      />
                      <button
                        type="submit"
                        className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-medium text-black transition hover:bg-[var(--accent-strong)]"
                      >
                        Add
                      </button>
                    </form>
                  )}
                </div>
              </div>
              <div className="mt-3 min-h-5 text-xs text-[var(--text-muted)]">
                {isPending ? "Saving..." : statusMessage ?? `${filteredTasks.length} visible task(s)`}
              </div>
            </div>

            {activeProject ? (
              <div className="grid gap-3 xl:grid-cols-5">
                {PROJECT_STATUS_ORDER.map((status) => (
                  <ProjectStatusColumn
                    key={status}
                    status={status}
                    tasks={grouped[status]}
                    projectId={activeProject.id}
                    pending={isPending}
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--bg-elevated)] p-8 text-center text-sm text-[var(--text-muted)]">
                Create a project to show the board.
              </div>
            )}
          </section>
        </div>
      </DndContext>
    </main>
  );
}

type ProjectStatusColumnProps = {
  status: ProjectTaskStatus;
  tasks: ProjectTaskNode[];
  projectId: string;
  pending: boolean;
};

const ProjectStatusColumn = memo(function ProjectStatusColumn({
  status,
  tasks,
  projectId,
  pending,
}: ProjectStatusColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: `status:${status}` });
  const tone = statusTone(status);

  return (
    <section
      ref={setNodeRef}
      className={`min-h-80 rounded-xl border bg-[var(--bg-elevated)] p-3 transition ${
        isOver ? "border-[var(--accent)]" : "border-[var(--border)]"
      }`}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-xs font-mono uppercase tracking-[0.16em]" style={{ color: tone }}>
          <span className="inline-block h-[6px] w-[6px] rounded-full" style={{ backgroundColor: tone }} />
          {statusLabel(status)}
        </p>
        <span className="text-xs font-mono text-[var(--text-muted)]">{tasks.length}</span>
      </div>

      <SortableContext items={tasks.map((task) => task.id)} strategy={verticalListSortingStrategy}>
        {tasks.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[var(--border)] p-3 text-sm text-[var(--text-muted)]">
            No tasks here.
          </div>
        ) : (
          <ul className="space-y-3">
            {tasks.map((task) => (
              <ProjectTaskCard key={task.id} task={task} pending={pending} />
            ))}
          </ul>
        )}
      </SortableContext>

      <form action={createProjectTaskAction} className="mt-3 space-y-2">
        <input type="hidden" name="projectId" value={projectId} />
        <input type="hidden" name="status" value={status} />
        <input
          name="title"
          placeholder={`Add to ${statusLabel(status)}`}
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-muted)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
          required
        />
        <button
          type="submit"
          className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--text-muted)] transition hover:border-[var(--accent)] hover:text-[var(--text)] disabled:opacity-60"
          disabled={pending}
        >
          Add task
        </button>
      </form>
    </section>
  );
});

type ProjectTaskCardProps = {
  task: ProjectTaskNode;
  pending: boolean;
};

const ProjectTaskCard = memo(function ProjectTaskCard({ task, pending }: ProjectTaskCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });
  const checklist = checklistProgress(task.checklist);
  const subtasks = subtaskProgress(task);
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.55 : 1,
    touchAction: "none",
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="rounded-lg border border-[var(--border)] bg-[var(--bg-muted)] p-3 shadow-sm"
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          aria-label={`Drag ${task.title}`}
          className="mt-0.5 rounded-md border border-[var(--border)] px-2 py-1 text-xs text-[var(--text-muted)] cursor-grab hover:border-[var(--accent)] active:cursor-grabbing disabled:opacity-60"
          disabled={pending}
          {...attributes}
          {...listeners}
        >
          Drag
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium leading-snug">{task.title}</p>
          {task.description && <p className="mt-1 line-clamp-3 text-xs text-[var(--text-muted)]">{task.description}</p>}
        </div>
      </div>

      {task.labels.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {task.labels.slice(0, 4).map((label) => (
            <span
              key={`${task.id}-${label.name}`}
              className="rounded-full border px-2 py-0.5 text-[11px]"
              style={{ borderColor: label.color, color: label.color }}
            >
              {label.name}
            </span>
          ))}
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-[var(--text-muted)]">
        {checklist.total > 0 && (
          <span className="rounded-md border border-[var(--border)] px-2 py-1">
            Checklist {checklist.completed}/{checklist.total}
          </span>
        )}
        {subtasks.total > 0 && (
          <span className="rounded-md border border-[var(--border)] px-2 py-1">
            Subtasks {subtasks.completed}/{subtasks.total}
          </span>
        )}
        {task.due_date && <span className="rounded-md border border-[var(--border)] px-2 py-1">Due {task.due_date}</span>}
      </div>
    </li>
  );
});

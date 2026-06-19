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
import {
  PROJECT_AREA_ORDER,
  PROJECT_STATUS_ORDER,
  areaLabel,
  statusLabel,
  type ProjectArea,
  type ProjectTaskStatus,
} from "@/lib/projects/status";
import { positionForProjectDrop, type ProjectDropPlacement } from "./project-drop-position";
import { findProjectTaskDetail } from "./project-task-selection";
import { createProjectAction, createProjectTaskAction, moveProjectTaskAction, updateProjectArchiveAction } from "./server-actions";
import { TaskDetailDrawer } from "./task-detail-drawer";

type ProjectsBoardClientProps = {
  initialArchived: boolean;
  initialArea: ProjectArea | null;
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

function areaTone(area: ProjectArea) {
  const tones: Record<ProjectArea, { border: string; bg: string; text: string; dot: string }> = {
    demand: {
      border: "border-rose-300/35",
      bg: "bg-rose-300/10",
      text: "text-rose-100",
      dot: "#fb7185",
    },
    delivery: {
      border: "border-sky-300/35",
      bg: "bg-sky-300/10",
      text: "text-sky-100",
      dot: "#38bdf8",
    },
    personal: {
      border: "border-emerald-300/35",
      bg: "bg-emerald-300/10",
      text: "text-emerald-100",
      dot: "#34d399",
    },
  };
  return tones[area];
}

function projectsHref(params: { area?: ProjectArea | null; archived?: boolean; projectId?: string | null }) {
  const search = new URLSearchParams();
  if (params.area) search.set("area", params.area);
  if (params.archived) search.set("archived", "1");
  if (params.projectId) search.set("project", params.projectId);
  const query = search.toString();
  return query ? `/projects?${query}` : "/projects";
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
      task.project?.name ?? "",
      task.project ? areaLabel(task.project.area) : "",
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

export function ProjectsBoardClient({ initialArchived, initialArea, initialBoard }: ProjectsBoardClientProps) {
  const [board, setBoard] = useState(initialBoard);
  const [query, setQuery] = useState("");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
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
  const activeProjectId = activeProject?.id ?? null;
  const filteredTasks = useMemo(() => filterTasks(board.tasks, query), [board.tasks, query]);
  const grouped = useMemo(() => groupTopLevelTasksByStatus(filteredTasks), [filteredTasks]);
  const selectedTaskDetail = useMemo(() => findProjectTaskDetail(board, selectedTaskId), [board, selectedTaskId]);

  useEffect(() => setBoard(initialBoard), [initialBoard]);
  useEffect(() => setSelectedTaskId(null), [activeProjectId]);

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
      <DndContext id="project-board-dnd" sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
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

            <div className="mt-4 grid grid-cols-4 gap-1 rounded-lg border border-[var(--border)] bg-[var(--bg-muted)] p-1">
              <a
                href={projectsHref({ archived: initialArchived })}
                className={`rounded-md px-2 py-2 text-center text-xs font-medium transition ${
                  initialArea === null
                    ? "bg-[var(--accent)] text-black"
                    : "text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text)]"
                }`}
              >
                All
              </a>
              {PROJECT_AREA_ORDER.map((area) => (
                <a
                  key={area}
                  href={projectsHref({ area, archived: initialArchived })}
                  className={`rounded-md px-2 py-2 text-center text-xs font-medium transition ${
                    area === initialArea
                      ? "bg-[var(--accent)] text-black"
                      : "text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text)]"
                  }`}
                >
                  {areaLabel(area)}
                </a>
              ))}
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <a
                href={projectsHref({ area: initialArea })}
                className={`rounded-lg border px-3 py-2 text-center text-xs font-medium transition ${
                  !initialArchived
                    ? "border-[var(--accent)] text-[var(--text)]"
                    : "border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--text)]"
                }`}
              >
                Active
              </a>
              <a
                href={projectsHref({ area: initialArea, archived: true })}
                className={`rounded-lg border px-3 py-2 text-center text-xs font-medium transition ${
                  initialArchived
                    ? "border-[var(--accent)] text-[var(--text)]"
                    : "border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--text)]"
                }`}
              >
                Archived
              </a>
            </div>

            <nav className="mt-4 space-y-2">
              {board.projects.length === 0 ? (
                <p className="rounded-lg border border-dashed border-[var(--border)] p-3 text-sm text-[var(--text-muted)]">
                  {initialArchived ? "No archived projects here." : "Add a project to start planning."}
                </p>
              ) : (
                board.projects.map((project) => (
                  <div key={project.id} className="rounded-lg border border-[var(--border)] bg-[var(--bg-muted)] p-3">
                    <a
                      href={projectsHref({ area: initialArea, archived: initialArchived, projectId: project.id })}
                      className={`block text-sm transition ${
                        project.id === activeProject?.id ? "text-[var(--text)]" : "text-[var(--text-muted)] hover:text-[var(--text)]"
                      }`}
                    >
                      <span className="block font-medium">{project.name}</span>
                      {project.description && <span className="mt-1 block line-clamp-2 text-xs">{project.description}</span>}
                    </a>
                    {initialArchived && (
                      <form action={updateProjectArchiveAction} className="mt-3">
                        <input type="hidden" name="projectId" value={project.id} />
                        <input type="hidden" name="area" value={project.area} />
                        <input type="hidden" name="archived" value="false" />
                        <button
                          type="submit"
                          className="w-full rounded-md border border-[var(--border)] px-2 py-1.5 text-xs text-[var(--text-muted)] transition hover:border-[var(--accent)] hover:text-[var(--text)]"
                        >
                          Restore
                        </button>
                      </form>
                    )}
                  </div>
                ))
              )}
            </nav>

            {!initialArchived && (
              <form action={createProjectAction} className="mt-5 space-y-2">
                <p className="text-xs font-mono uppercase tracking-[0.2em] text-[var(--text-muted)]">Add project</p>
                {initialArea ? (
                  <input type="hidden" name="area" value={initialArea} />
                ) : (
                  <select
                    name="area"
                    defaultValue="demand"
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-muted)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)]"
                    aria-label="Project area"
                  >
                    {PROJECT_AREA_ORDER.map((area) => (
                      <option key={area} value={area}>
                        {areaLabel(area)}
                      </option>
                    ))}
                  </select>
                )}
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
            )}
          </aside>

          <section className="min-w-0 space-y-4">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5">
              <div className="flex flex-wrap items-start gap-3">
                <div>
                  <p className="text-xs font-mono uppercase tracking-[0.2em] text-[var(--text-muted)]">Project board</p>
                  <h1 className="mt-2 text-2xl font-semibold">{activeProject?.name ?? "All projects"}</h1>
                  {!activeProject && (
                    <p className="mt-1 max-w-2xl text-sm text-[var(--text-muted)]">
                      Demand, Delivery, and Personal tasks in one priority view. Select a project on the left to add new tasks.
                    </p>
                  )}
                  {activeProject?.description && (
                    <p className="mt-1 max-w-2xl text-sm text-[var(--text-muted)]">{activeProject.description}</p>
                  )}
                  {initialArchived && <p className="mt-2 text-sm text-[var(--text-muted)]">Archived projects are preserved and can be restored.</p>}
                </div>
                <div className="ml-auto flex flex-wrap items-center gap-2">
                  {!initialArchived && (
                    <input
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Search tasks"
                      className="w-56 rounded-lg border border-[var(--border)] bg-[var(--bg-muted)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
                    />
                  )}
                  {activeProject && !initialArchived && (
                    <form action={updateProjectArchiveAction}>
                      <input type="hidden" name="projectId" value={activeProject.id} />
                      <input type="hidden" name="area" value={activeProject.area} />
                      <input type="hidden" name="archived" value="true" />
                      <button
                        type="submit"
                        className="rounded-lg border border-red-500/50 px-3 py-2 text-sm font-medium text-red-300 transition hover:bg-red-500/10"
                      >
                        Archive project
                      </button>
                    </form>
                  )}
                  {activeProject && !initialArchived && (
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

            {initialArchived ? (
              <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--bg-elevated)] p-8 text-center text-sm text-[var(--text-muted)]">
                Select an archived project on the left and click Restore to bring it back.
              </div>
            ) : board.projects.length > 0 ? (
              <div className="grid gap-3 xl:grid-cols-5">
                {PROJECT_STATUS_ORDER.map((status) => (
                  <ProjectStatusColumn
                    key={status}
                    status={status}
                    tasks={grouped[status]}
                    projectId={activeProject?.id ?? null}
                    pending={isPending}
                    onOpenTask={setSelectedTaskId}
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
      <TaskDetailDrawer
        task={selectedTaskDetail.task}
        parentTask={selectedTaskDetail.parentTask}
        projectId={selectedTaskDetail.task?.project_id ?? activeProject?.id ?? ""}
        onClose={() => setSelectedTaskId(null)}
        onOpenTask={setSelectedTaskId}
      />
    </main>
  );
}

type ProjectStatusColumnProps = {
  status: ProjectTaskStatus;
  tasks: ProjectTaskNode[];
  projectId: string | null;
  pending: boolean;
  onOpenTask: (taskId: string) => void;
};

const ProjectStatusColumn = memo(function ProjectStatusColumn({
  status,
  tasks,
  projectId,
  pending,
  onOpenTask,
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
              <ProjectTaskCard key={task.id} task={task} pending={pending} onOpenTask={onOpenTask} />
            ))}
          </ul>
        )}
      </SortableContext>

      {projectId ? (
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
      ) : (
        <p className="mt-3 rounded-lg border border-dashed border-[var(--border)] p-3 text-xs text-[var(--text-muted)]">
          Select a project to add tasks.
        </p>
      )}
    </section>
  );
});

type ProjectTaskCardProps = {
  task: ProjectTaskNode;
  pending: boolean;
  onOpenTask: (taskId: string) => void;
};

const ProjectTaskCard = memo(function ProjectTaskCard({ task, pending, onOpenTask }: ProjectTaskCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });
  const checklist = checklistProgress(task.checklist);
  const subtasks = subtaskProgress(task);
  const tone = task.project ? areaTone(task.project.area) : null;
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
      onClick={() => {
        if (!isDragging) onOpenTask(task.id);
      }}
      className={`rounded-lg border ${tone ? `${tone.border} ${tone.bg}` : "border-[var(--border)] bg-[var(--bg-muted)]"} p-3 shadow-sm`}
    >
      {task.project && (
        <div className="mb-2 flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: tone?.dot }} />
          <span className={`rounded-full border px-2 py-0.5 text-[11px] font-mono uppercase ${tone?.border} ${tone?.text}`}>
            {areaLabel(task.project.area)}
          </span>
          <span className="min-w-0 truncate text-xs text-[var(--text-muted)]">{task.project.name}</span>
        </div>
      )}
      <div className="flex items-start gap-2">
        <button
          type="button"
          aria-label={`Drag ${task.title}`}
          onClick={(event) => event.stopPropagation()}
          className="mt-0.5 rounded-md border border-[var(--border)] px-2 py-1 text-xs text-[var(--text-muted)] cursor-grab hover:border-[var(--accent)] active:cursor-grabbing disabled:opacity-60"
          disabled={pending}
          {...attributes}
          {...listeners}
        >
          Drag
        </button>
        <div className="min-w-0 flex-1">
          <button
            type="button"
            aria-label={`Open ${task.title}`}
            onClick={(event) => {
              event.stopPropagation();
              onOpenTask(task.id);
            }}
            className="block w-full text-left text-sm font-medium leading-snug text-[var(--text)]"
            disabled={pending}
          >
            {task.title}
          </button>
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

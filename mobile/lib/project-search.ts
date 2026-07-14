import type { MobileProjectTask } from "./projects-types";

export function filterMobileProjectTasks(tasks: MobileProjectTask[], query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return tasks;

  return tasks.filter((task) => {
    const searchableText = [
      task.title,
      task.description ?? "",
      task.project?.name ?? "",
      task.labels.map((label) => label.name).join(" "),
      task.checklist.map((item) => item.title).join(" "),
      task.subtasks
        .flatMap((subtask) => [
          subtask.title,
          subtask.description ?? "",
          subtask.labels.map((label) => label.name).join(" "),
          subtask.checklist.map((item) => item.title).join(" "),
        ])
        .join(" "),
    ]
      .join(" ")
      .toLowerCase();

    return searchableText.includes(needle);
  });
}

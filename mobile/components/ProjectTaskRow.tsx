import { type Href, useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { projectStatusTabs } from "../lib/projects-api";
import type { MobileProjectArea, MobileProjectSubtask, MobileProjectTask, MobileProjectTaskStatus } from "../lib/projects-types";

type ProjectTaskRowProps = {
  task: MobileProjectTask | MobileProjectSubtask;
  onStatusChange: (taskId: string, nextStatus: MobileProjectTaskStatus) => void | Promise<void>;
  statusDisabled?: boolean;
};

function checklistSummary(task: MobileProjectTask | MobileProjectSubtask) {
  if (!task.checklist.length) return "0 checks";
  const done = task.checklist.filter((item) => item.completed).length;
  return `${done}/${task.checklist.length} checks`;
}

function areaColor(area: MobileProjectArea) {
  if (area === "demand") return "#e11d48";
  if (area === "delivery") return "#0284c7";
  return "#059669";
}

function areaLabel(area: MobileProjectArea) {
  if (area === "demand") return "Demand";
  if (area === "delivery") return "Delivery";
  return "Personal";
}

export function ProjectTaskRow({ task, onStatusChange, statusDisabled = false }: ProjectTaskRowProps) {
  const router = useRouter();
  const subtaskCount = "subtasks" in task ? task.subtasks.length : 0;

  function openDetail() {
    const href = `/project-task/${encodeURIComponent(task.id)}?projectId=${encodeURIComponent(task.project_id)}` as Href;
    router.push(href);
  }

  return (
    <View style={styles.row}>
      <Pressable accessibilityRole="button" onPress={openDetail} style={styles.mainTapZone}>
        {task.project ? (
          <View style={styles.projectMetaRow}>
            <View style={[styles.areaDot, { backgroundColor: areaColor(task.project.area) }]} />
            <Text style={[styles.areaText, { color: areaColor(task.project.area) }]}>{areaLabel(task.project.area)}</Text>
            <Text style={styles.projectText}>{task.project.name}</Text>
          </View>
        ) : null}
        <Text style={styles.title}>{task.title}</Text>
        <View style={styles.metaRow}>
          {task.due_date ? <Text style={styles.metaText}>Due {task.due_date}</Text> : null}
          <Text style={styles.metaText}>{checklistSummary(task)}</Text>
          {subtaskCount ? <Text style={styles.metaText}>{subtaskCount} subtasks</Text> : null}
        </View>
      </Pressable>

      {task.labels.length ? (
        <View style={styles.labelRow}>
          {task.labels.map((label) => (
            <View key={`${task.id}-${label.name}`} style={[styles.labelChip, { borderColor: label.color }]}>
              <Text style={[styles.labelText, { color: label.color }]}>{label.name}</Text>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.statusRow}>
        {projectStatusTabs().map((status) => (
          <Pressable
            accessibilityRole="button"
            disabled={statusDisabled}
            key={`${task.id}-${status.key}`}
            onPress={() => onStatusChange(task.id, status.key)}
            style={[styles.statusChip, task.status === status.key && styles.activeStatusChip, statusDisabled && styles.disabledChip]}
          >
            <Text style={[styles.statusText, task.status === status.key && styles.activeStatusText]}>{status.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    gap: 10,
  },
  mainTapZone: {
    gap: 6,
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  projectMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  areaDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
  },
  areaText: {
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  projectText: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: "700",
  },
  metaText: {
    fontSize: 12,
    color: "#64748b",
    fontWeight: "600",
  },
  labelRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  labelChip: {
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: "#ffffff",
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  labelText: {
    fontSize: 12,
    fontWeight: "800",
  },
  statusRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  statusChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#f8fafc",
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  activeStatusChip: {
    borderColor: "#4f46e5",
    backgroundColor: "#eef2ff",
  },
  disabledChip: {
    opacity: 0.5,
  },
  statusText: {
    color: "#334155",
    fontSize: 12,
    fontWeight: "700",
  },
  activeStatusText: {
    color: "#3730a3",
  },
});

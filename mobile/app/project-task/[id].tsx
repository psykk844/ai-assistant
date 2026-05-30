import { useEffect, useMemo, useRef, useState } from "react";
import { useLocalSearchParams } from "expo-router";
import { ActivityIndicator, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import {
  buildProjectTaskStatusPatch,
  getMobileProjectBoard,
  projectStatusTabs,
  updateMobileProjectChecklistItem,
  updateMobileProjectTask,
} from "../../lib/projects-api";
import type {
  MobileProjectBoardPayload,
  MobileProjectChecklistItem,
  MobileProjectSubtask,
  MobileProjectTask,
  MobileProjectTaskStatus,
} from "../../lib/projects-types";

type DisplayTask = MobileProjectTask | MobileProjectSubtask;

function findTask(board: MobileProjectBoardPayload, id: string): DisplayTask | null {
  for (const task of board.tasks) {
    if (task.id === id) return task;
    const subtask = task.subtasks.find((candidate) => candidate.id === id);
    if (subtask) return subtask;
  }
  return null;
}

function updateTaskInBoard(
  board: MobileProjectBoardPayload,
  taskId: string,
  updater: (task: DisplayTask) => DisplayTask,
): MobileProjectBoardPayload {
  return {
    ...board,
    tasks: board.tasks.map((task) => {
      if (task.id === taskId) return updater(task) as MobileProjectTask;
      return {
        ...task,
        subtasks: task.subtasks.map((subtask) => (subtask.id === taskId ? (updater(subtask) as MobileProjectSubtask) : subtask)),
      };
    }),
  };
}

function updateChecklist(task: DisplayTask, itemId: string, completed: boolean): DisplayTask {
  return {
    ...task,
    checklist: task.checklist.map((item) => (item.id === itemId ? { ...item, completed } : item)),
  };
}

export default function ProjectTaskDetailScreen() {
  const { id, projectId } = useLocalSearchParams<{ id: string; projectId?: string }>();
  const [board, setBoard] = useState<MobileProjectBoardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusSaving, setStatusSaving] = useState(false);
  const [pendingChecklistItemIds, setPendingChecklistItemIds] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState("");
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const statusSavingRef = useRef(false);
  const savingRef = useRef(false);
  const pendingChecklistItemIdsRef = useRef(new Set<string>());

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const payload = await getMobileProjectBoard(projectId);
        const task = id ? findTask(payload, id) : null;
        if (!active) return;
        setBoard(payload);
        setTitleDraft(task?.title ?? "");
        setDescriptionDraft(task?.description ?? "");
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : "Failed to load project task.");
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [id, projectId]);

  const task = useMemo(() => (board && id ? findTask(board, id) : null), [board, id]);

  async function handleStatusChange(nextStatus: MobileProjectTaskStatus) {
    if (!task || task.status === nextStatus || statusSavingRef.current) return;
    const previousStatus = task.status;
    statusSavingRef.current = true;
    setStatusSaving(true);
    setBoard((current) =>
      current ? updateTaskInBoard(current, task.id, (taskToUpdate) => ({ ...taskToUpdate, status: nextStatus })) : current,
    );
    setError(null);

    try {
      await updateMobileProjectTask(task.project_id, task.id, buildProjectTaskStatusPatch(nextStatus));
    } catch (saveError) {
      setBoard((current) =>
        current ? updateTaskInBoard(current, task.id, (taskToUpdate) => ({ ...taskToUpdate, status: previousStatus })) : current,
      );
      setError(saveError instanceof Error ? saveError.message : "Failed to update status.");
    } finally {
      statusSavingRef.current = false;
      setStatusSaving(false);
    }
  }

  async function handleChecklistToggle(item: MobileProjectChecklistItem) {
    if (!task || pendingChecklistItemIdsRef.current.has(item.id)) return;
    const nextCompleted = !item.completed;
    pendingChecklistItemIdsRef.current.add(item.id);
    setPendingChecklistItemIds((current) => new Set(current).add(item.id));
    setBoard((current) =>
      current ? updateTaskInBoard(current, task.id, (taskToUpdate) => updateChecklist(taskToUpdate, item.id, nextCompleted)) : current,
    );
    setError(null);

    try {
      await updateMobileProjectChecklistItem(task.project_id, task.id, item.id, { completed: nextCompleted });
    } catch (saveError) {
      setBoard((current) =>
        current ? updateTaskInBoard(current, task.id, (taskToUpdate) => updateChecklist(taskToUpdate, item.id, item.completed)) : current,
      );
      setError(saveError instanceof Error ? saveError.message : "Failed to update checklist.");
    } finally {
      pendingChecklistItemIdsRef.current.delete(item.id);
      setPendingChecklistItemIds((current) => {
        const next = new Set(current);
        next.delete(item.id);
        return next;
      });
    }
  }

  async function handleSaveText() {
    if (!task || savingRef.current) return;
    const title = titleDraft.trim();
    if (!title) {
      setError("Title is required.");
      return;
    }

    const description = descriptionDraft.trim();
    const previousTitle = task.title;
    const previousDescription = task.description;
    savingRef.current = true;
    setSaving(true);
    setError(null);
    setBoard((current) =>
      current
        ? updateTaskInBoard(current, task.id, (taskToUpdate) => ({
            ...taskToUpdate,
            title,
            description: description || null,
          }))
        : current,
    );

    try {
      await updateMobileProjectTask(task.project_id, task.id, { title, description: description || null });
    } catch (saveError) {
      setBoard((current) =>
        current
          ? updateTaskInBoard(current, task.id, (taskToUpdate) => ({
              ...taskToUpdate,
              title: previousTitle,
              description: previousDescription,
            }))
          : current,
      );
      setTitleDraft(previousTitle);
      setDescriptionDraft(previousDescription ?? "");
      setError(saveError instanceof Error ? saveError.message : "Failed to save task.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.card}>
          <Text style={styles.eyebrow}>Project task</Text>
          {loading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="small" color="#4f46e5" />
              <Text style={styles.muted}>Loading task...</Text>
            </View>
          ) : task ? (
            <View style={styles.contentWrap}>
              <TextInput
                accessibilityLabel="Project task title"
                value={titleDraft}
                onChangeText={setTitleDraft}
                placeholder="Task title"
                placeholderTextColor="#94a3b8"
                style={styles.titleInput}
              />

              <Text style={styles.label}>Description</Text>
              <TextInput
                accessibilityLabel="Project task description"
                value={descriptionDraft}
                onChangeText={setDescriptionDraft}
                multiline
                placeholder="Description"
                placeholderTextColor="#94a3b8"
                style={[styles.input, styles.textArea]}
              />

              <Pressable accessibilityRole="button" disabled={saving} onPress={handleSaveText} style={styles.saveButton}>
                <Text style={styles.saveButtonText}>{saving ? "Saving..." : "Save text"}</Text>
              </Pressable>

              <Text style={styles.label}>Status</Text>
              <View style={styles.chipRow}>
                {projectStatusTabs().map((status) => (
                  <Pressable
                    accessibilityRole="button"
                    key={status.key}
                    disabled={statusSaving}
                    onPress={() => handleStatusChange(status.key)}
                    style={[styles.chip, task.status === status.key && styles.activeChip, statusSaving && styles.disabledChip]}
                  >
                    <Text style={[styles.chipText, task.status === status.key && styles.activeChipText]}>{status.label}</Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.label}>Labels</Text>
              <View style={styles.chipRow}>
                {task.labels.length ? (
                  task.labels.map((label) => (
                    <View key={`${task.id}-${label.name}`} style={[styles.labelChip, { borderColor: label.color }]}>
                      <Text style={[styles.labelText, { color: label.color }]}>{label.name}</Text>
                    </View>
                  ))
                ) : (
                  <Text style={styles.muted}>No labels</Text>
                )}
              </View>

              <Text style={styles.label}>Due date</Text>
              <Text style={styles.value}>{task.due_date ?? "No due date"}</Text>

              <Text style={styles.label}>Checklist</Text>
              <View style={styles.listWrap}>
                {task.checklist.length ? (
                  task.checklist.map((item) => (
                    <Pressable
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: item.completed }}
                      key={item.id}
                      disabled={pendingChecklistItemIds.has(item.id)}
                      onPress={() => handleChecklistToggle(item)}
                      style={[styles.checkRow, pendingChecklistItemIds.has(item.id) && styles.disabledRow]}
                    >
                      <Text style={[styles.checkBox, item.completed && styles.checkedBox]}>{item.completed ? "✓" : ""}</Text>
                      <Text style={[styles.checkText, item.completed && styles.completedText]}>{item.title}</Text>
                    </Pressable>
                  ))
                ) : (
                  <Text style={styles.muted}>No checklist items</Text>
                )}
              </View>

              {"subtasks" in task ? (
                <>
                  <Text style={styles.label}>Subtasks</Text>
                  <View style={styles.listWrap}>
                    {task.subtasks.length ? (
                      task.subtasks.map((subtask) => (
                        <View key={subtask.id} style={styles.subtaskRow}>
                          <Text style={styles.subtaskTitle}>{subtask.title}</Text>
                          <Text style={styles.subtaskMeta}>{subtask.status}</Text>
                        </View>
                      ))
                    ) : (
                      <Text style={styles.muted}>No subtasks</Text>
                    )}
                  </View>
                </>
              ) : null}

              {error ? <Text style={styles.errorText}>{error}</Text> : null}
            </View>
          ) : (
            <Text style={styles.muted}>Task not found.</Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#f3f4f6",
  },
  scrollContent: {
    padding: 20,
  },
  card: {
    marginTop: 24,
    borderRadius: 20,
    backgroundColor: "#ffffff",
    padding: 20,
    gap: 12,
    shadowColor: "#111827",
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1,
    color: "#4f46e5",
  },
  contentWrap: {
    gap: 10,
  },
  loadingWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  muted: {
    fontSize: 15,
    color: "#6b7280",
  },
  titleInput: {
    borderBottomWidth: 1,
    borderBottomColor: "#cbd5e1",
    color: "#111827",
    fontSize: 24,
    fontWeight: "800",
    paddingVertical: 8,
  },
  label: {
    fontSize: 12,
    textTransform: "uppercase",
    color: "#64748b",
    fontWeight: "800",
    letterSpacing: 0.8,
    marginTop: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: "#dbe3ef",
    borderRadius: 14,
    backgroundColor: "#f8fafc",
    color: "#0f172a",
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  textArea: {
    minHeight: 96,
    textAlignVertical: "top",
  },
  saveButton: {
    alignSelf: "flex-start",
    borderRadius: 14,
    backgroundColor: "#0f172a",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  saveButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "800",
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    borderColor: "#dbe3ef",
    borderRadius: 999,
    backgroundColor: "#f8fafc",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  activeChip: {
    borderColor: "#4f46e5",
    backgroundColor: "#eef2ff",
  },
  disabledChip: {
    opacity: 0.5,
  },
  chipText: {
    color: "#475569",
    fontSize: 13,
    fontWeight: "800",
  },
  activeChipText: {
    color: "#3730a3",
  },
  labelChip: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  labelText: {
    fontSize: 12,
    fontWeight: "800",
  },
  value: {
    color: "#0f172a",
    fontSize: 15,
  },
  listWrap: {
    gap: 8,
  },
  checkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  disabledRow: {
    opacity: 0.5,
  },
  checkBox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#94a3b8",
    color: "#ffffff",
    lineHeight: 22,
    textAlign: "center",
    fontWeight: "900",
  },
  checkedBox: {
    borderColor: "#15803d",
    backgroundColor: "#16a34a",
  },
  checkText: {
    flex: 1,
    color: "#0f172a",
    fontSize: 15,
    fontWeight: "600",
  },
  completedText: {
    color: "#64748b",
    textDecorationLine: "line-through",
  },
  subtaskRow: {
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    paddingTop: 8,
    gap: 3,
  },
  subtaskTitle: {
    color: "#111827",
    fontSize: 15,
    fontWeight: "700",
  },
  subtaskMeta: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  errorText: {
    color: "#b91c1c",
    fontSize: 14,
    fontWeight: "700",
  },
});

import { useEffect, useMemo, useRef, useState } from "react";
import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { ActivityIndicator, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import {
  archiveMobileProjectTask,
  buildProjectTaskStatusPatch,
  createMobileProjectChecklistItem,
  createMobileProjectSubtask,
  deleteMobileProjectChecklistItem,
  getMobileProjectBoard,
  projectStatusTabs,
  reorderMobileProjectChecklistItems,
  updateMobileProjectChecklistItem,
  updateMobileProjectTask,
  updateMobileProjectTaskFocus,
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

function updateChecklistItemText(task: DisplayTask, itemId: string, title: string): DisplayTask {
  return {
    ...task,
    checklist: task.checklist.map((item) => (item.id === itemId ? { ...item, title } : item)),
  };
}

function appendChecklistItem(task: DisplayTask, item: MobileProjectChecklistItem): DisplayTask {
  return {
    ...task,
    checklist: [...task.checklist, item],
  };
}

function removeChecklistItemFromTask(task: DisplayTask, itemId: string): DisplayTask {
  return {
    ...task,
    checklist: task.checklist.filter((item) => item.id !== itemId),
  };
}

function reorderSubtasks(
  subtasks: MobileProjectSubtask[],
  subtaskId: string,
  direction: "up" | "down",
): MobileProjectSubtask[] | null {
  const currentIndex = subtasks.findIndex((subtask) => subtask.id === subtaskId);
  const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
  if (currentIndex < 0 || targetIndex < 0 || targetIndex >= subtasks.length) return null;

  const nextOrder = [...subtasks];
  const [moved] = nextOrder.splice(currentIndex, 1);
  nextOrder.splice(targetIndex, 0, moved);
  return nextOrder.map((subtask, index) => ({ ...subtask, position: (index + 1) * 1000 }));
}

export default function ProjectTaskDetailScreen() {
  const { id, projectId } = useLocalSearchParams<{ id: string; projectId?: string }>();
  const router = useRouter();
  const [board, setBoard] = useState<MobileProjectBoardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusSaving, setStatusSaving] = useState(false);
  const [pendingChecklistItemIds, setPendingChecklistItemIds] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);
  const [focusMessage, setFocusMessage] = useState<string | null>(null);
  const [focusedTaskIds, setFocusedTaskIds] = useState<Set<string>>(() => new Set());
  const [titleDraft, setTitleDraft] = useState("");
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [checklistTitleDraft, setChecklistTitleDraft] = useState("");
  const [checklistEditDrafts, setChecklistEditDrafts] = useState<Record<string, string>>({});
  const [subtaskTitleDraft, setSubtaskTitleDraft] = useState("");
  const [subtaskEditDrafts, setSubtaskEditDrafts] = useState<Record<string, string>>({});
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
        setChecklistTitleDraft("");
        setChecklistEditDrafts(Object.fromEntries((task?.checklist ?? []).map((item) => [item.id, item.title])));
        setSubtaskTitleDraft("");
        setSubtaskEditDrafts(
          task && "subtasks" in task ? Object.fromEntries(task.subtasks.map((subtask) => [subtask.id, subtask.title])) : {},
        );
        setFocusMessage(null);
        setFocusedTaskIds(new Set());
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

  async function handleCreateChecklistItem() {
    if (!task || savingRef.current) return;
    const title = checklistTitleDraft.trim();
    if (!title) {
      setError("Checklist title is required.");
      return;
    }

    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      const created = await createMobileProjectChecklistItem(task.project_id, task.id, title);
      setBoard((current) =>
        current ? updateTaskInBoard(current, task.id, (taskToUpdate) => appendChecklistItem(taskToUpdate, created)) : current,
      );
      setChecklistEditDrafts((current) => ({ ...current, [created.id]: created.title }));
      setChecklistTitleDraft("");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to add checklist item.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  async function handleChecklistTitleSave(item: MobileProjectChecklistItem) {
    if (!task || pendingChecklistItemIdsRef.current.has(item.id)) return;
    const title = (checklistEditDrafts[item.id] ?? item.title).trim();
    if (!title) {
      setError("Checklist title is required.");
      return;
    }
    if (title === item.title) return;

    pendingChecklistItemIdsRef.current.add(item.id);
    setPendingChecklistItemIds((current) => new Set(current).add(item.id));
    setError(null);
    try {
      await updateMobileProjectChecklistItem(task.project_id, task.id, item.id, { title });
      setBoard((current) =>
        current ? updateTaskInBoard(current, task.id, (taskToUpdate) => updateChecklistItemText(taskToUpdate, item.id, title)) : current,
      );
      setChecklistEditDrafts((current) => ({ ...current, [item.id]: title }));
    } catch (saveError) {
      setChecklistEditDrafts((current) => ({ ...current, [item.id]: item.title }));
      setError(saveError instanceof Error ? saveError.message : "Failed to update checklist item.");
    } finally {
      pendingChecklistItemIdsRef.current.delete(item.id);
      setPendingChecklistItemIds((current) => {
        const next = new Set(current);
        next.delete(item.id);
        return next;
      });
    }
  }

  async function handleChecklistRemove(item: MobileProjectChecklistItem) {
    if (!task || pendingChecklistItemIdsRef.current.has(item.id)) return;

    pendingChecklistItemIdsRef.current.add(item.id);
    setPendingChecklistItemIds((current) => new Set(current).add(item.id));
    setBoard((current) =>
      current ? updateTaskInBoard(current, task.id, (taskToUpdate) => removeChecklistItemFromTask(taskToUpdate, item.id)) : current,
    );
    setError(null);

    try {
      await deleteMobileProjectChecklistItem(task.project_id, task.id, item.id);
      setChecklistEditDrafts((current) => {
        const next = { ...current };
        delete next[item.id];
        return next;
      });
    } catch (saveError) {
      setBoard((current) =>
        current ? updateTaskInBoard(current, task.id, (taskToUpdate) => appendChecklistItem(taskToUpdate, item)) : current,
      );
      setChecklistEditDrafts((current) => ({ ...current, [item.id]: item.title }));
      setError(saveError instanceof Error ? saveError.message : "Failed to remove checklist item.");
    } finally {
      pendingChecklistItemIdsRef.current.delete(item.id);
      setPendingChecklistItemIds((current) => {
        const next = new Set(current);
        next.delete(item.id);
        return next;
      });
    }
  }

  async function handleMoveChecklistItem(item: MobileProjectChecklistItem, direction: "up" | "down") {
    if (!task || savingRef.current) return;
    const nextChecklist = reorderMobileProjectChecklistItems(task.checklist, item.id, direction);
    if (!nextChecklist) return;

    const previousChecklist = task.checklist;
    savingRef.current = true;
    setSaving(true);
    setError(null);
    setBoard((current) =>
      current ? updateTaskInBoard(current, task.id, (taskToUpdate) => ({ ...taskToUpdate, checklist: nextChecklist })) : current,
    );

    try {
      await Promise.all(
        nextChecklist.map((candidate) =>
          updateMobileProjectChecklistItem(task.project_id, task.id, candidate.id, { position: candidate.position }),
        ),
      );
    } catch (saveError) {
      setBoard((current) =>
        current ? updateTaskInBoard(current, task.id, (taskToUpdate) => ({ ...taskToUpdate, checklist: previousChecklist })) : current,
      );
      setError(saveError instanceof Error ? saveError.message : "Failed to reorder checklist.");
    } finally {
      savingRef.current = false;
      setSaving(false);
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

  async function handleAddToToday(taskToFocus = task) {
    if (!taskToFocus || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError(null);
    setFocusMessage(null);
    try {
      await updateMobileProjectTaskFocus(taskToFocus.project_id, taskToFocus.id, true);
      setFocusedTaskIds((current) => new Set(current).add(taskToFocus.id));
      setFocusMessage("Added to Today.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to add task to Today.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  async function handleCreateSubtask() {
    if (!task || !("subtasks" in task) || savingRef.current) return;
    const title = subtaskTitleDraft.trim();
    if (!title) {
      setError("Subtask title is required.");
      return;
    }

    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      const created = await createMobileProjectSubtask(task.project_id, task.id, title);
      setBoard((current) =>
        current
          ? updateTaskInBoard(current, task.id, (taskToUpdate) =>
              "subtasks" in taskToUpdate ? { ...taskToUpdate, subtasks: [...taskToUpdate.subtasks, created] } : taskToUpdate,
            )
          : current,
      );
      setSubtaskEditDrafts((current) => ({ ...current, [created.id]: created.title }));
      setSubtaskTitleDraft("");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to add subtask.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  async function handleSubtaskTitleSave(subtask: MobileProjectSubtask) {
    if (!task || !("subtasks" in task) || savingRef.current) return;
    const title = (subtaskEditDrafts[subtask.id] ?? subtask.title).trim();
    if (!title) {
      setError("Subtask title is required.");
      setSubtaskEditDrafts((current) => ({ ...current, [subtask.id]: subtask.title }));
      return;
    }
    if (title === subtask.title) return;

    const previousTitle = subtask.title;
    savingRef.current = true;
    setSaving(true);
    setError(null);
    setBoard((current) =>
      current
        ? updateTaskInBoard(current, task.id, (taskToUpdate) =>
            "subtasks" in taskToUpdate
              ? {
                  ...taskToUpdate,
                  subtasks: taskToUpdate.subtasks.map((candidate) =>
                    candidate.id === subtask.id ? { ...candidate, title } : candidate,
                  ),
                }
              : taskToUpdate,
          )
        : current,
    );

    try {
      await updateMobileProjectTask(task.project_id, subtask.id, { title });
      setSubtaskEditDrafts((current) => ({ ...current, [subtask.id]: title }));
    } catch (saveError) {
      setBoard((current) =>
        current
          ? updateTaskInBoard(current, task.id, (taskToUpdate) =>
              "subtasks" in taskToUpdate
                ? {
                    ...taskToUpdate,
                    subtasks: taskToUpdate.subtasks.map((candidate) =>
                      candidate.id === subtask.id ? { ...candidate, title: previousTitle } : candidate,
                    ),
                  }
                : taskToUpdate,
            )
          : current,
      );
      setSubtaskEditDrafts((current) => ({ ...current, [subtask.id]: previousTitle }));
      setError(saveError instanceof Error ? saveError.message : "Failed to update subtask.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  async function handleMoveSubtask(subtask: MobileProjectSubtask, direction: "up" | "down") {
    if (!task || !("subtasks" in task) || savingRef.current) return;
    const nextSubtasks = reorderSubtasks(task.subtasks, subtask.id, direction);
    if (!nextSubtasks) return;

    const previousSubtasks = task.subtasks;
    savingRef.current = true;
    setSaving(true);
    setError(null);
    setBoard((current) =>
      current
        ? updateTaskInBoard(current, task.id, (taskToUpdate) =>
            "subtasks" in taskToUpdate ? { ...taskToUpdate, subtasks: nextSubtasks } : taskToUpdate,
          )
        : current,
    );

    try {
      await Promise.all(
        nextSubtasks.map((candidate) => updateMobileProjectTask(task.project_id, candidate.id, { position: candidate.position })),
      );
    } catch (saveError) {
      setBoard((current) =>
        current
          ? updateTaskInBoard(current, task.id, (taskToUpdate) =>
              "subtasks" in taskToUpdate ? { ...taskToUpdate, subtasks: previousSubtasks } : taskToUpdate,
            )
          : current,
      );
      setError(saveError instanceof Error ? saveError.message : "Failed to reorder subtasks.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  async function handleRemoveSubtask(subtask: MobileProjectSubtask) {
    if (!task || !("subtasks" in task) || savingRef.current) return;
    const previousSubtasks = task.subtasks;
    savingRef.current = true;
    setSaving(true);
    setError(null);
    setBoard((current) =>
      current
        ? updateTaskInBoard(current, task.id, (taskToUpdate) =>
            "subtasks" in taskToUpdate
              ? { ...taskToUpdate, subtasks: taskToUpdate.subtasks.filter((candidate) => candidate.id !== subtask.id) }
              : taskToUpdate,
          )
        : current,
    );

    try {
      await archiveMobileProjectTask(task.project_id, subtask.id);
      setSubtaskEditDrafts((current) => {
        const next = { ...current };
        delete next[subtask.id];
        return next;
      });
    } catch (saveError) {
      setBoard((current) =>
        current
          ? updateTaskInBoard(current, task.id, (taskToUpdate) =>
              "subtasks" in taskToUpdate ? { ...taskToUpdate, subtasks: previousSubtasks } : taskToUpdate,
            )
          : current,
      );
      setError(saveError instanceof Error ? saveError.message : "Failed to remove subtask.");
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

              <Pressable
                accessibilityRole="button"
                disabled={saving || task.status === "done" || focusedTaskIds.has(task.id)}
                onPress={() => handleAddToToday(task)}
                style={[styles.focusButton, (saving || task.status === "done" || focusedTaskIds.has(task.id)) && styles.disabledChip]}
              >
                <Text style={styles.focusButtonText}>
                  {focusedTaskIds.has(task.id) ? "Added to Today" : saving ? "Adding..." : "Add to Today"}
                </Text>
              </Pressable>
              {focusMessage ? <Text style={styles.focusMessage}>{focusMessage}</Text> : null}

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
                  task.checklist.map((item, index) => (
                    <View key={item.id} style={styles.checkEditWrap}>
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
                    <View style={styles.checkEditRow}>
                      <TextInput
                        accessibilityLabel="Checklist item title"
                        value={checklistEditDrafts[item.id] ?? item.title}
                        onChangeText={(value) => setChecklistEditDrafts((current) => ({ ...current, [item.id]: value }))}
                        placeholder="Checklist item"
                        placeholderTextColor="#94a3b8"
                        style={styles.checkInput}
                      />
                      <Pressable
                        accessibilityRole="button"
                        disabled={pendingChecklistItemIds.has(item.id) || (checklistEditDrafts[item.id] ?? item.title).trim() === item.title}
                        onPress={() => handleChecklistTitleSave(item)}
                        style={[
                          styles.smallActionButton,
                          (pendingChecklistItemIds.has(item.id) || (checklistEditDrafts[item.id] ?? item.title).trim() === item.title) &&
                            styles.disabledChip,
                        ]}
                      >
                        <Text style={styles.smallActionButtonText}>Save</Text>
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        disabled={saving || pendingChecklistItemIds.has(item.id) || index === 0}
                        onPress={() => handleMoveChecklistItem(item, "up")}
                        style={[
                          styles.smallActionButton,
                          (saving || pendingChecklistItemIds.has(item.id) || index === 0) && styles.disabledChip,
                        ]}
                      >
                        <Text style={styles.smallActionButtonText}>Up</Text>
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        disabled={saving || pendingChecklistItemIds.has(item.id) || index === task.checklist.length - 1}
                        onPress={() => handleMoveChecklistItem(item, "down")}
                        style={[
                          styles.smallActionButton,
                          (saving || pendingChecklistItemIds.has(item.id) || index === task.checklist.length - 1) && styles.disabledChip,
                        ]}
                      >
                        <Text style={styles.smallActionButtonText}>Down</Text>
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        disabled={pendingChecklistItemIds.has(item.id)}
                        onPress={() => handleChecklistRemove(item)}
                        style={[styles.removeButton, pendingChecklistItemIds.has(item.id) && styles.disabledChip]}
                      >
                        <Text style={styles.removeButtonText}>Remove</Text>
                      </Pressable>
                    </View>
                    </View>
                  ))
                ) : (
                  <Text style={styles.muted}>No checklist items</Text>
                )}
                <View style={styles.addSubtaskRow}>
                  <TextInput
                    accessibilityLabel="New checklist item title"
                    value={checklistTitleDraft}
                    onChangeText={setChecklistTitleDraft}
                    placeholder="Add checklist item"
                    placeholderTextColor="#94a3b8"
                    style={styles.addSubtaskInput}
                  />
                  <Pressable
                    accessibilityRole="button"
                    disabled={saving || !checklistTitleDraft.trim()}
                    onPress={handleCreateChecklistItem}
                    style={[styles.addSubtaskButton, (saving || !checklistTitleDraft.trim()) && styles.disabledChip]}
                  >
                    <Text style={styles.addSubtaskButtonText}>{saving ? "Adding..." : "Add"}</Text>
                  </Pressable>
                </View>
              </View>

              {"subtasks" in task ? (
                <>
                  <Text style={styles.label}>Subtasks</Text>
                  <View style={styles.listWrap}>
                    {task.subtasks.length ? (
                      task.subtasks.map((subtask, index) => {
                        const subtaskTitle = subtaskEditDrafts[subtask.id] ?? subtask.title;
                        const subtaskTitleChanged = subtaskTitle.trim() !== subtask.title;
                        const href =
                          `/project-task/${encodeURIComponent(subtask.id)}?projectId=${encodeURIComponent(subtask.project_id)}` as Href;

                        return (
                        <View key={subtask.id} style={styles.subtaskRow}>
                          <View style={styles.subtaskHeader}>
                            <View style={styles.subtaskTextWrap}>
                              <TextInput
                                accessibilityLabel="Subtask title"
                                value={subtaskTitle}
                                onChangeText={(value) => setSubtaskEditDrafts((current) => ({ ...current, [subtask.id]: value }))}
                                placeholder="Subtask title"
                                placeholderTextColor="#94a3b8"
                                style={styles.subtaskTitleInput}
                              />
                              <Text style={styles.subtaskMeta}>{subtask.status}</Text>
                            </View>
                          </View>
                          <View style={styles.subtaskActionRow}>
                            <Pressable
                              accessibilityRole="button"
                              disabled={saving || !subtaskTitle.trim() || !subtaskTitleChanged}
                              onPress={() => handleSubtaskTitleSave(subtask)}
                              style={[
                                styles.smallActionButton,
                                (saving || !subtaskTitle.trim() || !subtaskTitleChanged) && styles.disabledChip,
                              ]}
                            >
                              <Text style={styles.smallActionButtonText}>Save</Text>
                            </Pressable>
                            <Pressable
                              accessibilityRole="button"
                              disabled={saving || index === 0}
                              onPress={() => handleMoveSubtask(subtask, "up")}
                              style={[styles.smallActionButton, (saving || index === 0) && styles.disabledChip]}
                            >
                              <Text style={styles.smallActionButtonText}>Up</Text>
                            </Pressable>
                            <Pressable
                              accessibilityRole="button"
                              disabled={saving || index === task.subtasks.length - 1}
                              onPress={() => handleMoveSubtask(subtask, "down")}
                              style={[styles.smallActionButton, (saving || index === task.subtasks.length - 1) && styles.disabledChip]}
                            >
                              <Text style={styles.smallActionButtonText}>Down</Text>
                            </Pressable>
                            <Pressable accessibilityRole="button" onPress={() => router.push(href)} style={styles.smallActionButton}>
                              <Text style={styles.smallActionButtonText}>Open</Text>
                            </Pressable>
                            <Pressable
                              accessibilityRole="button"
                              disabled={saving || subtask.status === "done" || focusedTaskIds.has(subtask.id)}
                              onPress={() => handleAddToToday(subtask)}
                              style={[
                                styles.subtaskFocusButton,
                                (saving || subtask.status === "done" || focusedTaskIds.has(subtask.id)) && styles.disabledChip,
                              ]}
                            >
                              <Text style={styles.subtaskFocusButtonText}>
                                {focusedTaskIds.has(subtask.id) ? "Added" : saving ? "Adding..." : "Today"}
                              </Text>
                            </Pressable>
                            <Pressable
                              accessibilityRole="button"
                              disabled={saving}
                              onPress={() => handleRemoveSubtask(subtask)}
                              style={[styles.removeButton, saving && styles.disabledChip]}
                            >
                              <Text style={styles.removeButtonText}>Remove</Text>
                            </Pressable>
                          </View>
                        </View>
                        );
                      })
                    ) : (
                      <Text style={styles.muted}>No subtasks</Text>
                    )}
                    <View style={styles.addSubtaskRow}>
                      <TextInput
                        accessibilityLabel="New subtask title"
                        value={subtaskTitleDraft}
                        onChangeText={setSubtaskTitleDraft}
                        placeholder="Add subtask"
                        placeholderTextColor="#94a3b8"
                        style={styles.addSubtaskInput}
                      />
                      <Pressable
                        accessibilityRole="button"
                        disabled={saving || !subtaskTitleDraft.trim()}
                        onPress={handleCreateSubtask}
                        style={[styles.addSubtaskButton, (saving || !subtaskTitleDraft.trim()) && styles.disabledChip]}
                      >
                        <Text style={styles.addSubtaskButtonText}>{saving ? "Adding..." : "Add"}</Text>
                      </Pressable>
                    </View>
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
  focusButton: {
    alignSelf: "flex-start",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#ffffff",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  focusButtonText: {
    color: "#334155",
    fontSize: 14,
    fontWeight: "800",
  },
  focusMessage: {
    color: "#15803d",
    fontSize: 13,
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
  checkEditWrap: {
    gap: 7,
  },
  checkEditRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
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
  checkInput: {
    flex: 1,
    minWidth: 0,
    borderWidth: 1,
    borderColor: "#dbe3ef",
    borderRadius: 10,
    backgroundColor: "#f8fafc",
    color: "#0f172a",
    fontSize: 14,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  completedText: {
    color: "#64748b",
    textDecorationLine: "line-through",
  },
  smallActionButton: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#ffffff",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  smallActionButtonText: {
    color: "#334155",
    fontSize: 12,
    fontWeight: "800",
  },
  removeButton: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#fecaca",
    backgroundColor: "#fff1f2",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  removeButtonText: {
    color: "#be123c",
    fontSize: 12,
    fontWeight: "800",
  },
  subtaskRow: {
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    paddingTop: 8,
    gap: 3,
  },
  subtaskHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  subtaskActionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
  },
  subtaskTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  subtaskTitleInput: {
    borderWidth: 1,
    borderColor: "#dbe3ef",
    borderRadius: 10,
    backgroundColor: "#f8fafc",
    color: "#111827",
    fontSize: 15,
    fontWeight: "700",
    paddingHorizontal: 10,
    paddingVertical: 7,
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
  subtaskFocusButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#ffffff",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  subtaskFocusButtonText: {
    color: "#334155",
    fontSize: 12,
    fontWeight: "800",
  },
  addSubtaskRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  addSubtaskInput: {
    flex: 1,
    minWidth: 0,
    borderWidth: 1,
    borderColor: "#dbe3ef",
    borderRadius: 12,
    backgroundColor: "#f8fafc",
    color: "#0f172a",
    fontSize: 15,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  addSubtaskButton: {
    borderRadius: 12,
    backgroundColor: "#0f172a",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  addSubtaskButtonText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "800",
  },
  errorText: {
    color: "#b91c1c",
    fontSize: 14,
    fontWeight: "700",
  },
});

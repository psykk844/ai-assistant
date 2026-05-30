import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { ProjectTaskRow } from "../../components/ProjectTaskRow";
import {
  buildProjectTaskStatusPatch,
  createMobileProjectTask,
  getMobileProjectBoard,
  projectStatusTabs,
  updateMobileProjectTask,
} from "../../lib/projects-api";
import type { MobileProjectBoardPayload, MobileProjectTask, MobileProjectTaskStatus } from "../../lib/projects-types";

export default function ProjectsScreen() {
  const [board, setBoard] = useState<MobileProjectBoardPayload | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<MobileProjectTaskStatus>("todo");
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pendingTaskIds, setPendingTaskIds] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);
  const pendingTaskIdsRef = useRef(new Set<string>());
  const addingTaskRef = useRef(false);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const payload = await getMobileProjectBoard(selectedProjectId);
        if (!active) return;
        setBoard(payload);
        setSelectedProjectId(payload.activeProject?.id ?? payload.projects[0]?.id ?? null);
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : "Failed to load projects.");
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [selectedProjectId]);

  const visibleTasks = useMemo(() => {
    if (!board) return [];
    return board.tasks.filter((task) => task.status === selectedStatus);
  }, [board, selectedStatus]);

  async function handleProjectSelect(projectId: string) {
    setSelectedProjectId(projectId);
  }

  async function handleStatusChange(taskId: string, nextStatus: MobileProjectTaskStatus) {
    if (!board || pendingTaskIdsRef.current.has(taskId)) return;
    const task = board.tasks.find((candidate) => candidate.id === taskId);
    if (!task || task.status === nextStatus) return;
    const previousStatus = task.status;

    pendingTaskIdsRef.current.add(taskId);
    setPendingTaskIds((current) => new Set(current).add(taskId));
    setBoard((current) =>
      current
        ? {
            ...current,
            tasks: current.tasks.map((candidate) =>
              candidate.id === taskId ? { ...candidate, status: nextStatus } : candidate,
            ),
          }
        : current,
    );

    try {
      await updateMobileProjectTask(task.project_id, taskId, buildProjectTaskStatusPatch(nextStatus));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to update task status.");
      setBoard((current) =>
        current
          ? {
              ...current,
              tasks: current.tasks.map((candidate) =>
                candidate.id === taskId ? { ...candidate, status: previousStatus } : candidate,
              ),
            }
          : current,
      );
    } finally {
      pendingTaskIdsRef.current.delete(taskId);
      setPendingTaskIds((current) => {
        const next = new Set(current);
        next.delete(taskId);
        return next;
      });
    }
  }

  async function handleAddTask() {
    const title = newTaskTitle.trim();
    if (!board?.activeProject || !title || addingTaskRef.current) return;

    addingTaskRef.current = true;
    setSaving(true);
    setError(null);
    try {
      const task = (await createMobileProjectTask(board.activeProject.id, title, selectedStatus)) as MobileProjectTask;
      setBoard((current) => (current ? { ...current, tasks: [task, ...current.tasks] } : current));
      setNewTaskTitle("");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to add task.");
    } finally {
      addingTaskRef.current = false;
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.eyebrow}>Project board</Text>
          <Text style={styles.title}>Projects</Text>

          {loading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="small" color="#4f46e5" />
              <Text style={styles.muted}>Loading projects...</Text>
            </View>
          ) : board ? (
            <>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalRow}>
                {board.projects.map((project) => (
                  <Pressable
                    accessibilityRole="button"
                    key={project.id}
                    onPress={() => handleProjectSelect(project.id)}
                    style={[styles.projectChip, selectedProjectId === project.id && styles.activeProjectChip]}
                  >
                    <Text style={[styles.projectChipText, selectedProjectId === project.id && styles.activeProjectChipText]}>
                      {project.name}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>

              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalRow}>
                {projectStatusTabs().map((status) => (
                  <Pressable
                    accessibilityRole="button"
                    key={status.key}
                    onPress={() => setSelectedStatus(status.key)}
                    style={[styles.statusTab, selectedStatus === status.key && styles.activeStatusTab]}
                  >
                    <Text style={[styles.statusTabText, selectedStatus === status.key && styles.activeStatusTabText]}>
                      {status.label}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>

              <View style={styles.addRow}>
                <TextInput
                  accessibilityLabel="New project task title"
                  value={newTaskTitle}
                  onChangeText={setNewTaskTitle}
                  onSubmitEditing={handleAddTask}
                  placeholder={`Add to ${selectedStatus}`}
                  placeholderTextColor="#94a3b8"
                  style={styles.input}
                />
                <Pressable
                  accessibilityRole="button"
                  disabled={saving || !newTaskTitle.trim()}
                  onPress={handleAddTask}
                  style={[styles.addButton, (saving || !newTaskTitle.trim()) && styles.disabledButton]}
                >
                  <Text style={styles.addButtonText}>{saving ? "Adding" : "Add"}</Text>
                </Pressable>
              </View>

              {error ? <Text style={styles.errorText}>{error}</Text> : null}

              <View style={styles.listWrap}>
                {visibleTasks.length ? (
                  visibleTasks.map((task) => (
                    <ProjectTaskRow
                      key={task.id}
                      task={task}
                      onStatusChange={handleStatusChange}
                      statusDisabled={pendingTaskIds.has(task.id)}
                    />
                  ))
                ) : (
                  <Text style={styles.muted}>No tasks in this status.</Text>
                )}
              </View>
            </>
          ) : (
            <Text style={styles.muted}>No project board found.</Text>
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
  content: {
    padding: 20,
  },
  card: {
    marginTop: 24,
    borderRadius: 20,
    backgroundColor: "#ffffff",
    padding: 20,
    gap: 14,
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
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "#111827",
  },
  loadingWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 12,
  },
  muted: {
    fontSize: 15,
    color: "#6b7280",
  },
  horizontalRow: {
    flexDirection: "row",
    gap: 8,
    paddingRight: 20,
  },
  projectChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#f8fafc",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  activeProjectChip: {
    borderColor: "#0f172a",
    backgroundColor: "#0f172a",
  },
  projectChipText: {
    color: "#334155",
    fontSize: 13,
    fontWeight: "800",
  },
  activeProjectChipText: {
    color: "#ffffff",
  },
  statusTab: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#dbe3ef",
    backgroundColor: "#ffffff",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  activeStatusTab: {
    borderColor: "#4f46e5",
    backgroundColor: "#eef2ff",
  },
  statusTabText: {
    color: "#475569",
    fontSize: 13,
    fontWeight: "800",
  },
  activeStatusTabText: {
    color: "#3730a3",
  },
  addRow: {
    flexDirection: "row",
    gap: 8,
  },
  input: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#f8fafc",
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: "#0f172a",
  },
  addButton: {
    borderRadius: 14,
    backgroundColor: "#4f46e5",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  disabledButton: {
    opacity: 0.5,
  },
  addButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "800",
  },
  errorText: {
    color: "#b91c1c",
    fontSize: 14,
    fontWeight: "700",
  },
  listWrap: {
    gap: 0,
  },
});

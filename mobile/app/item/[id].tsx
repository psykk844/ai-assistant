import { useEffect, useState } from "react";
import { useLocalSearchParams } from "expo-router";
import { ActivityIndicator, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { getMobileItemById, updateMobileItem } from "../../lib/api";
import type { MobileItemPreview, MobileLaneKey } from "../../lib/types";

type EditDraft = {
  title: string;
  content: string;
  lane: MobileLaneKey;
  status: MobileItemPreview["status"];
  priority: "high" | "medium" | "low";
  tagsText: string;
};

const laneOptions: Array<{ value: MobileLaneKey; label: string }> = [
  { value: "today", label: "Today" },
  { value: "next", label: "Next" },
  { value: "upcoming", label: "Upcoming" },
  { value: "backlog", label: "Backlog" },
];

const priorityOptions: Array<{ value: EditDraft["priority"]; label: string; score: number }> = [
  { value: "high", label: "High", score: 0.9 },
  { value: "medium", label: "Medium", score: 0.7 },
  { value: "low", label: "Low", score: 0.35 },
];

function priorityFromScore(score: number): EditDraft["priority"] {
  if (score >= 0.85) return "high";
  if (score >= 0.6) return "medium";
  return "low";
}

function draftFromItem(item: MobileItemPreview): EditDraft {
  return {
    title: item.title ?? "",
    content: item.content ?? "",
    lane: item.lane,
    status: item.status,
    priority: priorityFromScore(item.priority_score),
    tagsText: item.tags.join(", "),
  };
}

function parseTags(value: string) {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export default function ItemDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [item, setItem] = useState<MobileItemPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<EditDraft | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      if (!id) {
        if (active) {
          setItem(null);
          setLoading(false);
        }
        return;
      }

      const found = await getMobileItemById(id);
      if (active) {
        setItem(found);
        setDraft(found ? draftFromItem(found) : null);
        setLoading(false);
      }
    }

    load();
    return () => {
      active = false;
    };
  }, [id]);

  function beginEdit() {
    if (!item) return;
    setDraft(draftFromItem(item));
    setError(null);
    setEditing(true);
  }

  function cancelEdit() {
    if (item) setDraft(draftFromItem(item));
    setError(null);
    setEditing(false);
  }

  async function saveEdit() {
    if (!id || !draft) return;
    const title = draft.title.trim();
    const content = draft.content.trim();
    if (!title && !content) {
      setError("Title or content is required.");
      return;
    }

    const priority = priorityOptions.find((option) => option.value === draft.priority)?.score ?? 0.7;
    setSaving(true);
    setError(null);
    try {
      const updated = await updateMobileItem(id, {
        title,
        content,
        lane: draft.lane,
        status: draft.status,
        priority_score: priority,
        tags: parseTags(draft.tagsText),
      });
      setItem(updated);
      setDraft(draftFromItem(updated));
      setEditing(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save item.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.card}>
        <Text style={styles.eyebrow}>Item</Text>
        <View style={styles.headerRow}>
          <Text style={styles.title}>Detail</Text>
          {item && !editing ? (
            <Pressable accessibilityRole="button" onPress={beginEdit} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>Edit</Text>
            </Pressable>
          ) : null}
        </View>

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="small" color="#4f46e5" />
            <Text style={styles.muted}>Loading item…</Text>
          </View>
        ) : item && draft && editing ? (
          <View style={styles.infoWrap}>
            <Text style={styles.label}>Title</Text>
            <TextInput
              accessibilityLabel="Edit title"
              value={draft.title}
              onChangeText={(title) => setDraft({ ...draft, title })}
              placeholder="Title"
              style={styles.input}
            />

            <Text style={styles.label}>Content</Text>
            <TextInput
              accessibilityLabel="Edit content"
              value={draft.content}
              onChangeText={(content) => setDraft({ ...draft, content })}
              multiline
              placeholder="Content"
              style={[styles.input, styles.textArea]}
            />

            <Text style={styles.label}>Lane</Text>
            <View style={styles.chipRow}>
              {laneOptions.map((option) => (
                <Pressable
                  accessibilityRole="button"
                  key={option.value}
                  onPress={() => setDraft({ ...draft, lane: option.value })}
                  style={[styles.chip, draft.lane === option.value && styles.activeChip]}
                >
                  <Text style={[styles.chipText, draft.lane === option.value && styles.activeChipText]}>{option.label}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.label}>Status</Text>
            <View style={styles.chipRow}>
              {(["active", "completed"] as Array<MobileItemPreview["status"]>).map((status) => (
                <Pressable
                  accessibilityRole="button"
                  key={status}
                  onPress={() => setDraft({ ...draft, status })}
                  style={[styles.chip, draft.status === status && styles.activeChip]}
                >
                  <Text style={[styles.chipText, draft.status === status && styles.activeChipText]}>{status}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.label}>Priority</Text>
            <View style={styles.chipRow}>
              {priorityOptions.map((option) => (
                <Pressable
                  accessibilityRole="button"
                  key={option.value}
                  onPress={() => setDraft({ ...draft, priority: option.value })}
                  style={[styles.chip, draft.priority === option.value && styles.activeChip]}
                >
                  <Text style={[styles.chipText, draft.priority === option.value && styles.activeChipText]}>{option.label}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.label}>Tags</Text>
            <TextInput
              accessibilityLabel="Edit tags"
              value={draft.tagsText}
              onChangeText={(tagsText) => setDraft({ ...draft, tagsText })}
              placeholder="phone, work"
              style={styles.input}
            />

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <View style={styles.actionRow}>
              <Pressable accessibilityRole="button" disabled={saving} onPress={saveEdit} style={styles.primaryButton}>
                <Text style={styles.primaryButtonText}>{saving ? "Saving…" : "Save"}</Text>
              </Pressable>
              <Pressable accessibilityRole="button" disabled={saving} onPress={cancelEdit} style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        ) : item ? (
          <View style={styles.infoWrap}>
            <Text style={styles.label}>Title</Text>
            <Text style={styles.value}>{item.title ?? item.content}</Text>

            <Text style={styles.label}>Content</Text>
            <Text style={styles.value}>{item.content}</Text>

            <Text style={styles.label}>Lane</Text>
            <Text style={styles.value}>{item.lane}</Text>

            <Text style={styles.label}>Status</Text>
            <Text style={styles.value}>{item.status}</Text>

            <Text style={styles.label}>Type</Text>
            <Text style={styles.value}>{item.type}</Text>

            <Text style={styles.label}>Priority</Text>
            <Text style={styles.value}>{Math.round(item.priority_score * 100)}</Text>

            <Text style={styles.label}>Tags</Text>
            <Text style={styles.value}>{item.tags.length ? item.tags.join(", ") : "No tags"}</Text>
          </View>
        ) : (
          <Text style={styles.muted}>Item not found.</Text>
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
    gap: 10,
    shadowColor: "#111827",
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 1,
    color: "#6366f1",
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "#111827",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  loadingWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  infoWrap: {
    gap: 8,
  },
  label: {
    fontSize: 12,
    textTransform: "uppercase",
    color: "#64748b",
    fontWeight: "700",
    letterSpacing: 0.8,
  },
  value: {
    fontSize: 16,
    color: "#0f172a",
    marginBottom: 6,
  },
  muted: {
    fontSize: 15,
    color: "#6b7280",
  },
  input: {
    borderWidth: 1,
    borderColor: "#dbe3ef",
    borderRadius: 14,
    backgroundColor: "#f8fafc",
    color: "#0f172a",
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  textArea: {
    minHeight: 110,
    textAlignVertical: "top",
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 4,
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
  chipText: {
    color: "#475569",
    fontSize: 14,
    fontWeight: "700",
  },
  activeChipText: {
    color: "#3730a3",
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 8,
  },
  primaryButton: {
    borderRadius: 14,
    backgroundColor: "#4f46e5",
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "800",
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 14,
    backgroundColor: "#ffffff",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  secondaryButtonText: {
    color: "#334155",
    fontSize: 15,
    fontWeight: "800",
  },
  errorText: {
    color: "#b91c1c",
    fontSize: 14,
    fontWeight: "700",
  },
});

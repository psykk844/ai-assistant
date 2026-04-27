import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { LaneKey } from "../shared/lane";
import { MOBILE_QUICK_ADD_LANES } from "../lib/lane-options";

type QuickAddBarProps = {
  defaultLane?: LaneKey;
  onSubmit: (content: string, lane: LaneKey) => Promise<void>;
};

export function QuickAddBar({ defaultLane = "today", onSubmit }: QuickAddBarProps) {
  const [content, setContent] = useState("");
  const [selectedLane, setSelectedLane] = useState<LaneKey>(defaultLane);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit() {
    const trimmed = content.trim();
    if (!trimmed || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await onSubmit(trimmed, selectedLane);
      setContent("");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <View style={styles.card}>
      <Text style={styles.eyebrow}>Quick Add</Text>
      <Text style={styles.title}>Capture now, choose lane first</Text>
      <TextInput
        value={content}
        onChangeText={setContent}
        placeholder="Add a task, note, or reminder"
        placeholderTextColor="#9ca3af"
        style={styles.input}
      />
      <View style={styles.laneRow}>
        {MOBILE_QUICK_ADD_LANES.map((lane) => {
          const selected = lane.key === selectedLane;
          return (
            <Pressable
              key={lane.key}
              onPress={() => setSelectedLane(lane.key)}
              style={[styles.laneChip, selected && styles.laneChipSelected]}
            >
              <Text style={[styles.laneChipText, selected && styles.laneChipTextSelected]}>{lane.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <Pressable
        onPress={handleSubmit}
        style={[styles.submitButton, (!content.trim() || isSubmitting) && styles.submitButtonDisabled]}
      >
        <Text style={styles.submitButtonText}>{isSubmitting ? "Adding…" : `Add to ${selectedLane}`}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    backgroundColor: "#ffffff",
    padding: 20,
    gap: 12,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1,
    color: "#2563eb",
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
  },
  input: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#d1d5db",
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: "#111827",
    backgroundColor: "#f9fafb",
  },
  laneRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  laneChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#f8fafc",
  },
  laneChipSelected: {
    borderColor: "#2563eb",
    backgroundColor: "#dbeafe",
  },
  laneChipText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#475569",
  },
  laneChipTextSelected: {
    color: "#1d4ed8",
  },
  submitButton: {
    borderRadius: 14,
    backgroundColor: "#111827",
    alignItems: "center",
    paddingVertical: 13,
  },
  submitButtonDisabled: {
    opacity: 0.45,
  },
  submitButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "700",
  },
});

import { Pressable, StyleSheet, Text, View } from "react-native";
import type { LaneKey } from "../shared/lane";
import type { MobileItemPreview } from "../lib/types";

const MOVE_TARGETS: LaneKey[] = ["today", "next", "upcoming", "backlog"];

type ItemRowProps = {
  item: MobileItemPreview;
  onComplete: (itemId: string) => void | Promise<void>;
  onOpenDetail: (itemId: string) => void;
  onMoveLane: (itemId: string, toLane: LaneKey) => void | Promise<void>;
};

export function ItemRow({ item, onComplete, onOpenDetail, onMoveLane }: ItemRowProps) {
  const meta =
    item.source === "project_task" && item.project
      ? `PROJECT - ${item.project.area.toUpperCase()} / ${item.project.name}`
      : `${item.lane.toUpperCase()} - ${item.type}`;

  return (
    <View style={styles.row}>
      <Pressable style={styles.mainTapZone} onPress={() => onOpenDetail(item.id)}>
        <Text style={styles.itemTitle}>{item.title ?? item.content}</Text>
        <Text style={styles.itemMeta}>{meta}</Text>
      </Pressable>

      <View style={styles.actionRow}>
        <Pressable onPress={() => onComplete(item.id)} style={styles.completeButton}>
          <Text style={styles.completeButtonText}>Complete</Text>
        </Pressable>
        {item.source !== "project_task" ? (
          <Pressable onPress={() => onOpenDetail(item.id)} style={styles.openButton}>
            <Text style={styles.openButtonText}>Open</Text>
          </Pressable>
        ) : null}
      </View>

      {item.source !== "project_task" ? (
        <View style={styles.moveRow}>
          {MOVE_TARGETS.filter((lane) => lane !== item.lane).map((lane) => (
            <Pressable key={`${item.id}-${lane}`} onPress={() => onMoveLane(item.id, lane)} style={styles.moveChip}>
              <Text style={styles.moveChipText}>Move to {lane}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
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
    gap: 4,
  },
  itemTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },
  itemMeta: {
    fontSize: 12,
    color: "#6b7280",
    textTransform: "uppercase",
  },
  actionRow: {
    flexDirection: "row",
    gap: 8,
  },
  completeButton: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#dcfce7",
  },
  completeButtonText: {
    color: "#166534",
    fontWeight: "700",
    fontSize: 12,
  },
  openButton: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#dbeafe",
  },
  openButtonText: {
    color: "#1d4ed8",
    fontWeight: "700",
    fontSize: 12,
  },
  moveRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  moveChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "#f8fafc",
  },
  moveChipText: {
    color: "#334155",
    fontWeight: "600",
    fontSize: 12,
  },
});

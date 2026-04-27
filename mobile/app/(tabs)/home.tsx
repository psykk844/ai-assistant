import { useEffect, useState } from "react";
import { ActivityIndicator, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { completeItem, createQuickAddItem, getMobileHomePayload, moveItemToLane } from "../../lib/api";
import type { MobileHomePayload, MobileItemPreview } from "../../lib/types";
import { QuickAddBar } from "../../components/QuickAddBar";
import { ItemRow } from "../../components/ItemRow";
import type { LaneKey } from "../../shared/lane";
import { completeFromHomePayload, moveInHomePayload } from "../../lib/home-row-actions";

export default function HomeScreen() {
  const [payload, setPayload] = useState<MobileHomePayload | null>(null);
  const router = useRouter();

  useEffect(() => {
    getMobileHomePayload().then(setPayload);
  }, []);

  async function handleQuickAdd(content: string, lane: LaneKey) {
    const newItem = await createQuickAddItem(content, lane);

    setPayload((current) => {
      if (!current) return current;

      if (lane === "today") {
        return {
          ...current,
          today: [newItem, ...current.today].slice(0, 5),
          counts: {
            ...current.counts,
            todayTotal: current.counts.todayTotal + 1,
          },
        };
      }

      if (lane === "next") {
        return {
          ...current,
          next: [newItem, ...current.next].slice(0, 5),
          counts: {
            ...current.counts,
            nextTotal: current.counts.nextTotal + 1,
          },
        };
      }

      if (lane === "upcoming") {
        return {
          ...current,
          counts: {
            ...current.counts,
            upcomingTotal: current.counts.upcomingTotal + 1,
          },
        };
      }

      return {
        ...current,
        counts: {
          ...current.counts,
          backlogTotal: current.counts.backlogTotal + 1,
        },
      };
    });
  }

  async function handleComplete(itemId: string) {
    await completeItem(itemId);
    setPayload((current) => {
      if (!current) return current;
      return completeFromHomePayload(current, itemId);
    });
  }

  function handleOpenDetail(itemId: string) {
    router.push({ pathname: "/item/[id]", params: { id: itemId } });
  }

  async function handleMoveLane(itemId: string, toLane: LaneKey) {
    await moveItemToLane(itemId, toLane);
    setPayload((current) => {
      if (!current) return current;
      return moveInHomePayload(current, itemId, toLane);
    });
  }

  if (!payload) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.loadingCard}>
          <ActivityIndicator size="small" color="#4f46e5" />
          <Text style={styles.loadingText}>Loading your focused day…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.heroCard}>
          <Text style={styles.eyebrow}>Mobile MVP</Text>
          <Text style={styles.title}>Home</Text>
          <Text style={styles.body}>Focused loading only: Today 5, Next 5, and lightweight lane counts.</Text>
        </View>

        <QuickAddBar onSubmit={handleQuickAdd} />

        <View style={styles.countGrid}>
          <CountCard label="Today" value={payload.counts.todayTotal} accent="#4f46e5" />
          <CountCard label="Next" value={payload.counts.nextTotal} accent="#0f766e" />
          <CountCard label="Upcoming" value={payload.counts.upcomingTotal} accent="#b45309" />
          <CountCard label="Backlog" value={payload.counts.backlogTotal} accent="#475569" />
        </View>

        <SectionCard
          eyebrow="Today 5"
          title="Current focus"
          items={payload.today}
          emptyText="No Today items yet."
          onComplete={handleComplete}
          onOpenDetail={handleOpenDetail}
          onMoveLane={handleMoveLane}
        />

        <SectionCard
          eyebrow="Next 5"
          title="Queued up next"
          items={payload.next}
          emptyText="No Next items queued."
          onComplete={handleComplete}
          onOpenDetail={handleOpenDetail}
          onMoveLane={handleMoveLane}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

function CountCard({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <View style={styles.countCard}>
      <Text style={[styles.countLabel, { color: accent }]}>{label}</Text>
      <Text style={styles.countValue}>{value}</Text>
    </View>
  );
}

function SectionCard({
  eyebrow,
  title,
  items,
  emptyText,
  onComplete,
  onOpenDetail,
  onMoveLane,
}: {
  eyebrow: string;
  title: string;
  items: MobileItemPreview[];
  emptyText: string;
  onComplete: (itemId: string) => void | Promise<void>;
  onOpenDetail: (itemId: string) => void;
  onMoveLane: (itemId: string, toLane: LaneKey) => void | Promise<void>;
}) {
  return (
    <View style={styles.sectionCard}>
      <Text style={styles.sectionEyebrow}>{eyebrow}</Text>
      <Text style={styles.sectionTitle}>{title}</Text>
      {items.length === 0 ? (
        <Text style={styles.emptyText}>{emptyText}</Text>
      ) : (
        items.map((item) => (
          <ItemRow key={item.id} item={item} onComplete={onComplete} onOpenDetail={onOpenDetail} onMoveLane={onMoveLane} />
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#f3f4f6",
  },
  content: {
    padding: 20,
    gap: 16,
  },
  heroCard: {
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
  loadingCard: {
    margin: 20,
    marginTop: 32,
    borderRadius: 20,
    backgroundColor: "#ffffff",
    padding: 24,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  loadingText: {
    color: "#4b5563",
    fontSize: 15,
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
  body: {
    fontSize: 16,
    lineHeight: 24,
    color: "#4b5563",
  },
  countGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  countCard: {
    minWidth: "47%",
    flexGrow: 1,
    borderRadius: 18,
    backgroundColor: "#ffffff",
    padding: 16,
    gap: 6,
  },
  countLabel: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  countValue: {
    fontSize: 28,
    fontWeight: "700",
    color: "#111827",
  },
  sectionCard: {
    borderRadius: 20,
    backgroundColor: "#ffffff",
    padding: 20,
    gap: 14,
  },
  sectionEyebrow: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1,
    color: "#6d28d9",
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
  },
  emptyText: {
    fontSize: 15,
    color: "#6b7280",
  },
});

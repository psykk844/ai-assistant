import { useEffect, useState } from "react";
import { useLocalSearchParams } from "expo-router";
import { ActivityIndicator, SafeAreaView, StyleSheet, Text, View } from "react-native";
import { getMobileItemById } from "../../lib/api";
import type { MobileItemPreview } from "../../lib/types";

export default function ItemDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [item, setItem] = useState<MobileItemPreview | null>(null);
  const [loading, setLoading] = useState(true);

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
        setLoading(false);
      }
    }

    load();
    return () => {
      active = false;
    };
  }, [id]);

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.card}>
        <Text style={styles.eyebrow}>Item</Text>
        <Text style={styles.title}>Detail</Text>

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="small" color="#4f46e5" />
            <Text style={styles.muted}>Loading item…</Text>
          </View>
        ) : item ? (
          <View style={styles.infoWrap}>
            <Text style={styles.label}>Title</Text>
            <Text style={styles.value}>{item.title ?? item.content}</Text>

            <Text style={styles.label}>Lane</Text>
            <Text style={styles.value}>{item.lane}</Text>

            <Text style={styles.label}>Type</Text>
            <Text style={styles.value}>{item.type}</Text>

            <Text style={styles.label}>Priority</Text>
            <Text style={styles.value}>{Math.round(item.priority_score * 100)}</Text>
          </View>
        ) : (
          <Text style={styles.muted}>Item not found.</Text>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#f3f4f6",
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
});

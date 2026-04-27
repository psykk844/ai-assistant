import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, SafeAreaView, StyleSheet, Text, TextInput, View } from "react-native";
import { getMobileBacklogPage } from "../../lib/api";
import type { MobileItemPreview } from "../../lib/types";

type BacklogState = {
  items: MobileItemPreview[];
  nextCursor: string | null;
  hasMore: boolean;
};

const PAGE_SIZE = 20;

export default function BacklogScreen() {
  const [state, setState] = useState<BacklogState>({
    items: [],
    nextCursor: null,
    hasMore: true,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  const loadFirstPage = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const page = await getMobileBacklogPage({
        limit: PAGE_SIZE,
        search: search.trim() || undefined,
      });
      setState({
        items: page.items,
        nextCursor: page.pageInfo.nextCursor,
        hasMore: page.pageInfo.hasMore,
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load backlog");
    } finally {
      setIsLoading(false);
    }
  }, [search]);

  useEffect(() => {
    void loadFirstPage();
  }, [loadFirstPage, search]);

  async function handleLoadMore() {
    if (!state.hasMore || !state.nextCursor || isLoadingMore) return;
    setIsLoadingMore(true);
    setError(null);

    try {
      const page = await getMobileBacklogPage({
        limit: PAGE_SIZE,
        cursor: state.nextCursor,
        search: search.trim() || undefined,
      });

      setState((current) => ({
        items: [...current.items, ...page.items],
        nextCursor: page.pageInfo.nextCursor,
        hasMore: page.pageInfo.hasMore,
      }));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load next backlog page");
    } finally {
      setIsLoadingMore(false);
    }
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.card}>
        <Text style={styles.eyebrow}>Phase 3</Text>
        <Text style={styles.title}>Backlog</Text>
        <Text style={styles.body}>Backlog is paginated and isolated from Home startup payload.</Text>

        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search backlog"
          placeholderTextColor="#94a3b8"
          style={styles.searchInput}
        />

        {isLoading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="small" color="#0f766e" />
            <Text style={styles.muted}>Loading backlog…</Text>
          </View>
        ) : error ? (
          <View style={styles.errorWrap}>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable style={styles.retryButton} onPress={loadFirstPage}>
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.listWrap}>
            {state.items.length === 0 ? (
              <Text style={styles.muted}>No backlog items found.</Text>
            ) : (
              state.items.map((item) => (
                <View key={item.id} style={styles.itemRow}>
                  <View style={styles.itemTextWrap}>
                    <Text style={styles.itemTitle}>{item.title ?? item.content}</Text>
                    <Text style={styles.itemMeta}>BACKLOG · {item.type}</Text>
                  </View>
                  <Text style={styles.itemPriority}>{Math.round(item.priority_score * 100)}</Text>
                </View>
              ))
            )}

            {state.hasMore ? (
              <Pressable style={[styles.loadMoreButton, isLoadingMore && styles.loadMoreButtonDisabled]} onPress={handleLoadMore}>
                <Text style={styles.loadMoreText}>{isLoadingMore ? "Loading…" : "Load more"}</Text>
              </Pressable>
            ) : state.items.length > 0 ? (
              <Text style={styles.endText}>You reached the end of backlog.</Text>
            ) : null}
          </View>
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
    color: "#0f766e",
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
  searchInput: {
    marginTop: 4,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#f8fafc",
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: "#0f172a",
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
  errorWrap: {
    gap: 10,
    paddingVertical: 12,
  },
  errorText: {
    color: "#b91c1c",
    fontSize: 14,
  },
  retryButton: {
    alignSelf: "flex-start",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#fee2e2",
  },
  retryText: {
    color: "#991b1b",
    fontWeight: "700",
    fontSize: 13,
  },
  listWrap: {
    gap: 0,
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  itemTextWrap: {
    flex: 1,
    gap: 4,
    paddingRight: 12,
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
  itemPriority: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0f766e",
  },
  loadMoreButton: {
    marginTop: 12,
    borderRadius: 14,
    backgroundColor: "#0f172a",
    alignItems: "center",
    paddingVertical: 12,
  },
  loadMoreButtonDisabled: {
    opacity: 0.6,
  },
  loadMoreText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 14,
  },
  endText: {
    marginTop: 12,
    color: "#64748b",
    fontSize: 13,
    textAlign: "center",
  },
});

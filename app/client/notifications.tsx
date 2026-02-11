import React, { useCallback } from "react";
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator, Platform, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { apiRequest, queryClient } from "@/lib/query-client";
import { router } from "expo-router";
import Colors from "@/constants/colors";

const ICON_MAP: Record<string, keyof typeof Ionicons.glyphMap> = {
  ride: "car-sport",
  wallet: "wallet",
  safety: "shield-checkmark",
  general: "notifications",
};

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const { data: notifications, isLoading, refetch } = useQuery({
    queryKey: ["/api/notifications/user", user?.id || ""],
    enabled: !!user,
  });

  const markReadMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("PUT", `/api/notifications/${id}/read`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/user", user?.id || ""] });
    },
  });

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHrs = Math.floor(diffMin / 60);
    if (diffHrs < 24) return `${diffHrs}h ago`;
    return d.toLocaleDateString("en-ZA", { day: "numeric", month: "short" });
  };

  const renderNotification = useCallback(({ item }: { item: any }) => (
    <Pressable
      style={[styles.notifCard, !item.isRead && styles.notifUnread]}
      onPress={() => { if (!item.isRead) markReadMutation.mutate(item.id); }}
    >
      <View style={[styles.notifIcon, !item.isRead && styles.notifIconActive]}>
        <Ionicons name={ICON_MAP[item.type] || "notifications"} size={18} color={!item.isRead ? Colors.white : Colors.textMuted} />
      </View>
      <View style={styles.notifContent}>
        <View style={styles.notifHeader}>
          <Text style={[styles.notifTitle, !item.isRead && styles.notifTitleUnread]}>{item.title}</Text>
          <Text style={styles.notifTime}>{formatTime(item.createdAt)}</Text>
        </View>
        <Text style={styles.notifBody} numberOfLines={2}>{item.body}</Text>
      </View>
    </Pressable>
  ), []);

  return (
    <View style={[styles.container, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 16) }]}>
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.navigate("/client/profile")}>
          <Ionicons name="chevron-back" size={24} color={Colors.white} />
        </Pressable>
        <Text style={styles.title}>Notifications</Text>
        <View style={{ width: 24 }} />
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.white} />
        </View>
      ) : !notifications || (Array.isArray(notifications) && notifications.length === 0) ? (
        <View style={styles.center}>
          <Ionicons name="notifications-off-outline" size={48} color={Colors.textMuted} />
          <Text style={styles.emptyText}>No notifications</Text>
          <Text style={styles.emptySubtext}>You're all caught up</Text>
        </View>
      ) : (
        <FlatList
          data={Array.isArray(notifications) ? notifications : []}
          keyExtractor={(item) => item.id}
          renderItem={renderNotification}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={false} onRefresh={refetch} tintColor={Colors.white} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.primary, paddingHorizontal: 20 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 20 },
  title: { fontSize: 20, fontFamily: "Inter_700Bold", color: Colors.white },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
  emptyText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: Colors.textSecondary },
  emptySubtext: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textMuted },
  list: { gap: 8, paddingBottom: 100 },
  notifCard: { flexDirection: "row", backgroundColor: Colors.card, borderRadius: 14, padding: 16, gap: 14, borderWidth: 1, borderColor: Colors.border },
  notifUnread: { borderColor: "rgba(255,255,255,0.15)", backgroundColor: Colors.surface },
  notifIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: Colors.accent, alignItems: "center", justifyContent: "center" },
  notifIconActive: { backgroundColor: Colors.white },
  notifContent: { flex: 1, gap: 4 },
  notifHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  notifTitle: { fontSize: 14, fontFamily: "Inter_500Medium", color: Colors.textSecondary },
  notifTitleUnread: { fontFamily: "Inter_600SemiBold", color: Colors.white },
  notifTime: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.textMuted },
  notifBody: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textMuted, lineHeight: 18 },
});

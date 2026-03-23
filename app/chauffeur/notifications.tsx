import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, StyleSheet, Pressable, ScrollView,
  ActivityIndicator, Platform, RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useAuth } from "@/lib/auth-context";
import { apiRequest } from "@/lib/query-client";
import Colors from "@/constants/colors";

interface Notification {
  id: string;
  title: string;
  body: string;
  type: string;
  isRead: boolean;
  createdAt: string;
}

export default function ChauffeurNotificationsScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadNotifications = useCallback(async () => {
    if (!user) { setLoading(false); setRefreshing(false); return; }
    try {
      const res = await apiRequest("GET", `/api/notifications/user/${user.id}`);
      const data = await res.json();
      if (Array.isArray(data)) setNotifications(data);
    } catch (e) {
      console.error("Failed to load notifications", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useEffect(() => { loadNotifications(); }, [loadNotifications]);

  async function markAsRead(id: string) {
    try {
      await apiRequest("PUT", `/api/notifications/${id}/read`);
      setNotifications(prev =>
        prev.map(n => n.id === id ? { ...n, isRead: true } : n)
      );
    } catch {}
  }

  function getIcon(type: string) {
    switch (type) {
      case "ride": return "car-sport";
      case "approval": return "checkmark-circle";
      case "rejection": return "close-circle";
      case "earning": return "cash";
      case "withdrawal": return "arrow-down-circle";
      default: return "notifications";
    }
  }

  function getIconColor(type: string) {
    switch (type) {
      case "approval": return Colors.success;
      case "rejection": return Colors.error;
      case "earning": return Colors.success;
      default: return Colors.white;
    }
  }

  function timeAgo(dateStr: string) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  }

  if (loading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }, styles.center]}>
        <ActivityIndicator size="large" color={Colors.white} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 0) }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={Colors.white} />
        </Pressable>
        <Text style={styles.title}>Notifications</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); loadNotifications(); }}
            tintColor={Colors.white}
          />
        }
      >
        {notifications.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="notifications-off-outline" size={48} color={Colors.textMuted} />
            <Text style={styles.emptyTitle}>No Notifications</Text>
            <Text style={styles.emptySub}>You're all caught up! New notifications will appear here.</Text>
          </View>
        ) : (
          notifications.map(n => (
            <Pressable
              key={n.id}
              style={[styles.notifCard, !n.isRead && styles.notifUnread]}
              onPress={() => !n.isRead && markAsRead(n.id)}
            >
              <View style={[styles.notifIcon, { backgroundColor: `${getIconColor(n.type)}20` }]}>
                <Ionicons name={getIcon(n.type) as any} size={20} color={getIconColor(n.type)} />
              </View>
              <View style={styles.notifContent}>
                <View style={styles.notifHeaderRow}>
                  <Text style={styles.notifTitle}>{n.title}</Text>
                  {!n.isRead && <View style={styles.unreadDot} />}
                </View>
                <Text style={styles.notifBody}>{n.body}</Text>
                <Text style={styles.notifTime}>{timeAgo(n.createdAt)}</Text>
              </View>
            </Pressable>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.primary },
  center: { alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingVertical: 14,
  },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.accent, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 18, fontFamily: "Inter_700Bold", color: Colors.white },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 120 },
  empty: { alignItems: "center", paddingVertical: 60, gap: 12 },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold", color: Colors.white },
  emptySub: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textMuted, textAlign: "center", maxWidth: 260 },
  notifCard: {
    flexDirection: "row", gap: 12,
    backgroundColor: Colors.card, borderRadius: 14, padding: 16, marginBottom: 10,
    borderWidth: 1, borderColor: Colors.border,
  },
  notifUnread: { borderColor: "rgba(255,255,255,0.15)", backgroundColor: "rgba(255,255,255,0.04)" },
  notifIcon: { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  notifContent: { flex: 1, gap: 4 },
  notifHeaderRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  notifTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.white, flex: 1 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#3B82F6" },
  notifBody: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textSecondary, lineHeight: 18 },
  notifTime: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.textMuted },
});

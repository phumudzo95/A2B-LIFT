import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, Platform, ScrollView, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useAuth } from "@/lib/auth-context";
import { apiRequest } from "@/lib/query-client";
import Colors from "@/constants/colors";

interface ClientReview {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  reviewerName: string;
}

interface ClientProfileDetails {
  clientRating: number | null;
  totalRatings: number;
  completedTrips: number;
  ratings: ClientReview[];
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const [profileDetails, setProfileDetails] = useState<ClientProfileDetails | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);

  useEffect(() => {
    if (!user?.id) return;

    let cancelled = false;

    async function loadProfileDetails() {
      try {
        setProfileLoading(true);
        const res = await apiRequest("GET", `/api/clients/${user.id}/profile`);
        const data = await res.json();
        if (!cancelled) {
          setProfileDetails(data);
        }
      } catch {
        if (!cancelled) {
          setProfileDetails(null);
        }
      } finally {
        if (!cancelled) {
          setProfileLoading(false);
        }
      }
    }

    loadProfileDetails();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  async function handleLogout() {
    await logout();
  }

  const averageRating = profileDetails?.clientRating ?? (user?.rating != null ? Number(user.rating) : null);
  const totalRatings = profileDetails?.totalRatings ?? 0;
  const completedTrips = profileDetails?.completedTrips ?? 0;
  const recentReviews = profileDetails?.ratings?.slice(0, 3) ?? [];

  return (
    <ScrollView
      style={[styles.container, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 16) }]}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.title}>Profile</Text>

      <View style={styles.profileCard}>
        <View style={styles.avatar}>
          <Ionicons name="person" size={32} color={Colors.white} />
        </View>
        <Text style={styles.profileName}>{user?.name || "User"}</Text>
        <Text style={styles.profileUsername}>{user?.username || user?.email || ""}</Text>
        {user?.phone && <Text style={styles.profilePhone}>{user.phone}</Text>}
        {user?.createdAt && (
          <Text style={styles.profilePhone}>Member since {new Date(user.createdAt).getFullYear()}</Text>
        )}
        <View style={styles.ratingRow}>
          <Ionicons name="star" size={14} color={Colors.warning} />
          {profileLoading ? (
            <ActivityIndicator size="small" color={Colors.warning} />
          ) : (
            <Text style={styles.ratingText}>
              {averageRating !== null ? `${averageRating.toFixed(1)} • ${totalRatings} ratings` : "No ratings yet"}
            </Text>
          )}
        </View>
      </View>

      <View style={styles.statsCard}>
        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{averageRating !== null ? averageRating.toFixed(1) : "—"}</Text>
            <Text style={styles.statLabel}>Average Rating</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{totalRatings}</Text>
            <Text style={styles.statLabel}>Reviews</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{completedTrips}</Text>
            <Text style={styles.statLabel}>Trips</Text>
          </View>
        </View>
      </View>

      {recentReviews.length > 0 && (
        <View style={styles.reviewsCard}>
          <Text style={styles.reviewsTitle}>Recent Ratings</Text>
          {recentReviews.map((review) => (
            <View key={review.id} style={styles.reviewItem}>
              <View style={styles.reviewHeader}>
                <Text style={styles.reviewName}>{review.reviewerName}</Text>
                <Text style={styles.reviewMeta}>{review.rating.toFixed(1)} ★</Text>
              </View>
              {review.comment ? <Text style={styles.reviewComment}>{review.comment}</Text> : null}
            </View>
          ))}
        </View>
      )}

      <View style={styles.menuGroup}>
        <Pressable style={({ pressed }) => [styles.menuItem, pressed && { opacity: 0.7 }]} onPress={() => router.push("/client/notifications")}>
          <View style={styles.menuIconCircle}>
            <Ionicons name="notifications-outline" size={20} color={Colors.white} />
          </View>
          <Text style={styles.menuText}>Notifications</Text>
          <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
        </Pressable>

        <Pressable style={({ pressed }) => [styles.menuItem, pressed && { opacity: 0.7 }]} onPress={() => router.push("/client/safety")}>
          <View style={styles.menuIconCircle}>
            <Ionicons name="shield-checkmark-outline" size={20} color={Colors.white} />
          </View>
          <Text style={styles.menuText}>Safety</Text>
          <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
        </Pressable>

        <Pressable style={({ pressed }) => [styles.menuItem, pressed && { opacity: 0.7 }]} onPress={() => router.push("/client/help")}>
          <View style={styles.menuIconCircle}>
            <Ionicons name="help-circle-outline" size={20} color={Colors.white} />
          </View>
          <Text style={styles.menuText}>Help & Support</Text>
          <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
        </Pressable>

        <Pressable style={({ pressed }) => [styles.menuItem, pressed && { opacity: 0.7 }]} onPress={() => router.push("/client/settings")}>
          <View style={[styles.menuIconCircle, { borderBottomWidth: 0 }]}>
            <Ionicons name="settings-outline" size={20} color={Colors.white} />
          </View>
          <Text style={styles.menuText}>Settings</Text>
          <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
        </Pressable>
      </View>

      <View style={styles.menuGroup}>
        <Pressable
          style={({ pressed }) => [styles.menuItem, pressed && { opacity: 0.7 }]}
          onPress={() => router.replace("/role-select")}
        >
          <View style={styles.menuIconCircle}>
            <Ionicons name="swap-horizontal" size={20} color={Colors.white} />
          </View>
          <Text style={styles.menuText}>Switch Mode</Text>
          <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
        </Pressable>
      </View>

      <Pressable
        style={({ pressed }) => [styles.logoutBtn, pressed && { opacity: 0.8 }]}
        onPress={handleLogout}
      >
        <Ionicons name="log-out-outline" size={20} color={Colors.error} />
        <Text style={styles.logoutText}>Sign Out</Text>
      </Pressable>

      <View style={styles.brandFooter}>
        <Ionicons name="car-sport" size={14} color={Colors.textMuted} />
        <Text style={styles.brandText}>A2B LIFT v1.0</Text>
      </View>

      <View style={{ height: 100 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.primary, paddingHorizontal: 20 },
  scrollContent: { paddingBottom: 40 },
  title: { fontSize: 24, fontFamily: "Inter_700Bold", color: Colors.white, marginBottom: 20 },
  profileCard: { alignItems: "center", backgroundColor: Colors.card, borderRadius: 20, padding: 28, gap: 6, borderWidth: 1, borderColor: Colors.border, marginBottom: 24 },
  avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: Colors.accent, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  profileName: { fontSize: 20, fontFamily: "Inter_700Bold", color: Colors.white },
  profileUsername: { fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.textSecondary, marginTop: 2 },
  profilePhone: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textMuted },
  ratingRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  ratingText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.white },
  statsCard: { backgroundColor: Colors.card, borderRadius: 18, padding: 18, borderWidth: 1, borderColor: Colors.border, marginBottom: 16 },
  statsRow: { flexDirection: "row", alignItems: "center" },
  statBox: { flex: 1, alignItems: "center", gap: 4 },
  statValue: { fontSize: 20, fontFamily: "Inter_700Bold", color: Colors.white },
  statLabel: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textMuted, textAlign: "center" },
  statDivider: { width: 1, alignSelf: "stretch", backgroundColor: Colors.border },
  reviewsCard: { backgroundColor: Colors.card, borderRadius: 18, padding: 18, borderWidth: 1, borderColor: Colors.border, marginBottom: 16, gap: 12 },
  reviewsTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: Colors.white },
  reviewItem: { backgroundColor: Colors.surface, borderRadius: 14, padding: 12, gap: 6, borderWidth: 1, borderColor: Colors.border },
  reviewHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  reviewName: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: Colors.white, flex: 1 },
  reviewMeta: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: Colors.warning },
  reviewComment: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textSecondary, lineHeight: 18 },
  menuGroup: { backgroundColor: Colors.card, borderRadius: 14, overflow: "hidden", borderWidth: 1, borderColor: Colors.border, marginBottom: 16 },
  menuItem: { flexDirection: "row", alignItems: "center", padding: 16, gap: 14, borderBottomWidth: 1, borderBottomColor: Colors.border },
  menuIconCircle: { width: 36, height: 36, borderRadius: 10, backgroundColor: Colors.accent, alignItems: "center", justifyContent: "center" },
  menuText: { flex: 1, fontSize: 15, fontFamily: "Inter_500Medium", color: Colors.white },
  logoutBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 16, marginTop: 8 },
  logoutText: { fontSize: 15, fontFamily: "Inter_500Medium", color: Colors.error },
  brandFooter: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 16 },
  brandText: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textMuted },
});

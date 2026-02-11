import React from "react";
import { View, Text, StyleSheet, Pressable, Platform, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useAuth } from "@/lib/auth-context";
import Colors from "@/constants/colors";

export default function ChauffeurSettingsScreen() {
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();

  async function handleLogout() {
    await logout();
    router.replace("/");
  }

  return (
    <ScrollView
      style={[styles.container, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 16) }]}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.title}>Settings</Text>

      <View style={styles.profileCard}>
        <View style={styles.avatar}>
          <Ionicons name="person" size={28} color={Colors.white} />
        </View>
        <Text style={styles.profileName}>{user?.name || "Chauffeur"}</Text>
        <Text style={styles.profileRole}>Professional Chauffeur</Text>
      </View>

      <View style={styles.menuGroup}>
        <Pressable style={({ pressed }) => [styles.menuItem, pressed && { opacity: 0.7 }]}>
          <View style={styles.menuIconCircle}>
            <Ionicons name="car-outline" size={20} color={Colors.white} />
          </View>
          <Text style={styles.menuText}>Vehicle Details</Text>
          <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
        </Pressable>

        <Pressable style={({ pressed }) => [styles.menuItem, pressed && { opacity: 0.7 }]}>
          <View style={styles.menuIconCircle}>
            <Ionicons name="document-text-outline" size={20} color={Colors.white} />
          </View>
          <Text style={styles.menuText}>Documents</Text>
          <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
        </Pressable>

        <Pressable style={({ pressed }) => [styles.menuItem, pressed && { opacity: 0.7 }]}>
          <View style={styles.menuIconCircle}>
            <Ionicons name="notifications-outline" size={20} color={Colors.white} />
          </View>
          <Text style={styles.menuText}>Notifications</Text>
          <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
        </Pressable>

        <Pressable style={({ pressed }) => [styles.menuItem, pressed && { opacity: 0.7 }]}>
          <View style={styles.menuIconCircle}>
            <Ionicons name="help-circle-outline" size={20} color={Colors.white} />
          </View>
          <Text style={styles.menuText}>Help & Support</Text>
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
          <Text style={styles.menuText}>Switch to Client Mode</Text>
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
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: Colors.accent, alignItems: "center", justifyContent: "center", marginBottom: 6 },
  profileName: { fontSize: 20, fontFamily: "Inter_700Bold", color: Colors.white },
  profileRole: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
  menuGroup: { backgroundColor: Colors.card, borderRadius: 14, overflow: "hidden", borderWidth: 1, borderColor: Colors.border, marginBottom: 16 },
  menuItem: { flexDirection: "row", alignItems: "center", padding: 16, gap: 14, borderBottomWidth: 1, borderBottomColor: Colors.border },
  menuIconCircle: { width: 36, height: 36, borderRadius: 10, backgroundColor: Colors.accent, alignItems: "center", justifyContent: "center" },
  menuText: { flex: 1, fontSize: 15, fontFamily: "Inter_500Medium", color: Colors.white },
  logoutBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 16, marginTop: 8 },
  logoutText: { fontSize: 15, fontFamily: "Inter_500Medium", color: Colors.error },
  brandFooter: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 16 },
  brandText: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textMuted },
});

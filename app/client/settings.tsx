import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, TextInput, Platform, ScrollView, Alert, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useAuth } from "@/lib/auth-context";
import { apiRequest } from "@/lib/query-client";
import Colors from "@/constants/colors";

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { user, refreshUser, logout } = useAuth();
  const [editMode, setEditMode] = useState(false);
  const [name, setName] = useState(user?.name || "");
  const [phone, setPhone] = useState(user?.phone || "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!user) return;
    setSaving(true);
    try {
      await apiRequest("PUT", `/api/users/${user.id}`, { name: name.trim(), phone: phone.trim() });
      await refreshUser();
      setEditMode(false);
      Alert.alert("Saved", "Your profile has been updated");
    } catch {
      Alert.alert("Error", "Failed to save changes");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteAccount() {
    Alert.alert("Delete Account", "Are you sure? This action cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await logout();
        },
      },
    ]);
  }

  return (
    <ScrollView
      style={[styles.container, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 16) }]}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.navigate("/client/profile")}>
          <Ionicons name="chevron-back" size={24} color={Colors.white} />
        </Pressable>
        <Text style={styles.title}>Settings</Text>
        <Pressable onPress={() => editMode ? handleSave() : setEditMode(true)}>
          {saving ? <ActivityIndicator size="small" color={Colors.white} /> : (
            <Ionicons name={editMode ? "checkmark" : "create-outline"} size={22} color={Colors.white} />
          )}
        </Pressable>
      </View>

      <Text style={styles.sectionTitle}>Account</Text>
      <View style={styles.card}>
        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>Name</Text>
          {editMode ? (
            <TextInput style={styles.settingInput} value={name} onChangeText={setName} />
          ) : (
            <Text style={styles.settingValue}>{user?.name || "—"}</Text>
          )}
        </View>
        <View style={styles.divider} />
        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>Username</Text>
          <Text style={styles.settingValue}>@{user?.username || "—"}</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>Phone</Text>
          {editMode ? (
            <TextInput style={styles.settingInput} value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
          ) : (
            <Text style={styles.settingValue}>{user?.phone || "Not set"}</Text>
          )}
        </View>
      </View>

      <Text style={styles.sectionTitle}>Preferences</Text>
      <View style={styles.card}>
        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>Language</Text>
          <Text style={styles.settingValue}>English</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>Currency</Text>
          <Text style={styles.settingValue}>ZAR (R)</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>Distance Unit</Text>
          <Text style={styles.settingValue}>Kilometers</Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>About</Text>
      <View style={styles.card}>
        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>Version</Text>
          <Text style={styles.settingValue}>1.0.0</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>Build</Text>
          <Text style={styles.settingValue}>2026.02.11</Text>
        </View>
      </View>

      <Pressable style={styles.deleteBtn} onPress={handleDeleteAccount}>
        <Ionicons name="trash-outline" size={18} color={Colors.error} />
        <Text style={styles.deleteBtnText}>Delete Account</Text>
      </Pressable>

      <View style={{ height: 100 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.primary, paddingHorizontal: 20 },
  scrollContent: { paddingBottom: 40 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 20 },
  title: { fontSize: 20, fontFamily: "Inter_700Bold", color: Colors.white },
  sectionTitle: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8, marginTop: 20 },
  card: { backgroundColor: Colors.card, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, overflow: "hidden" },
  settingRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16 },
  settingLabel: { fontSize: 15, fontFamily: "Inter_500Medium", color: Colors.white },
  settingValue: { fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
  settingInput: { fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.white, backgroundColor: Colors.surface, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, minWidth: 140, textAlign: "right" as const },
  divider: { height: 1, backgroundColor: Colors.border },
  deleteBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 16, marginTop: 24 },
  deleteBtnText: { fontSize: 15, fontFamily: "Inter_500Medium", color: Colors.error },
});

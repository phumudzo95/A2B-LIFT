import React from "react";
import { View, Text, StyleSheet, Pressable, Platform } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeInDown } from "react-native-reanimated";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "@/lib/auth-context";
import Colors from "@/constants/colors";

export default function RoleSelectScreen() {
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();

  if (!user) return null;

  return (
    <View style={[styles.container, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 40) }]}>
      <View style={styles.topRow}>
        <View />
        <Pressable onPress={async () => { await logout(); }} style={styles.logoutBtn}>
          <Ionicons name="log-out-outline" size={20} color={Colors.textSecondary} />
        </Pressable>
      </View>

      <View style={styles.header}>
        <Text style={styles.greeting}>Welcome, {user.name}</Text>
        <Text style={styles.subtitle}>Choose how you'd like to use A2B LIFT</Text>
      </View>

      <View style={styles.cardsContainer}>
        <Animated.View entering={FadeInDown.duration(600).delay(200)}>
          <Pressable
            style={({ pressed }) => [styles.roleCard, pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] }]}
            onPress={() => { AsyncStorage.setItem("a2b_last_mode", "client"); router.push("/client"); }}
          >
            <View style={styles.roleIconCircle}>
              <Ionicons name="person" size={28} color={Colors.white} />
            </View>
            <View style={styles.roleInfo}>
              <Text style={styles.roleTitle}>Client Mode</Text>
              <Text style={styles.roleDesc}>Book premium rides with professional chauffeurs</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
          </Pressable>
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(600).delay(400)}>
          <Pressable
            style={({ pressed }) => [styles.roleCard, pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] }]}
            onPress={() => { AsyncStorage.setItem("a2b_last_mode", "chauffeur"); router.push("/chauffeur"); }}
          >
            <View style={[styles.roleIconCircle, { backgroundColor: Colors.surface }]}>
              <Ionicons name="car-sport" size={28} color={Colors.white} />
            </View>
            <View style={styles.roleInfo}>
              <Text style={styles.roleTitle}>Chauffeur Mode</Text>
              <Text style={styles.roleDesc}>Drive and earn with your luxury vehicle</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
          </Pressable>
        </Animated.View>
      </View>

      <View style={[styles.bottom, { paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 16) }]}>
        <View style={styles.brandRow}>
          <Ionicons name="car-sport" size={16} color={Colors.textMuted} />
          <Text style={styles.brandText}>A2B LIFT</Text>
          <Text style={styles.brandSlogan}>Premium Ride Experience</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.primary,
    paddingHorizontal: 24,
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  logoutBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  header: {
    marginTop: 24,
    marginBottom: 40,
  },
  greeting: {
    fontSize: 26,
    fontFamily: "Inter_700Bold",
    color: Colors.white,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
  },
  cardsContainer: {
    gap: 16,
  },
  roleCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 20,
    gap: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  roleIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  roleInfo: {
    flex: 1,
    gap: 4,
  },
  roleTitle: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
    color: Colors.white,
  },
  roleDesc: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
  },
  bottom: {
    flex: 1,
    justifyContent: "flex-end",
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  brandText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: Colors.textMuted,
    letterSpacing: 2,
  },
  brandSlogan: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
    letterSpacing: 1,
  },
});

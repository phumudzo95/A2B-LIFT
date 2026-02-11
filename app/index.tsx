import React, { useEffect } from "react";
import { View, Text, StyleSheet, Pressable, Platform } from "react-native";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeInDown, FadeInUp } from "react-native-reanimated";
import { useAuth } from "@/lib/auth-context";
import Colors from "@/constants/colors";

export default function SplashLanding() {
  const insets = useSafeAreaInsets();
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && user) {
      router.replace("/role-select");
    }
  }, [isLoading, user]);

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: Colors.primary }]}>
        <Ionicons name="car-sport" size={48} color={Colors.white} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={["#000000", "#0a0a0a", "#111111"]}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.content, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 0) }]}>
        <Animated.View entering={FadeInUp.duration(800).delay(200)} style={styles.logoArea}>
          <View style={styles.iconCircle}>
            <Ionicons name="car-sport" size={40} color={Colors.white} />
          </View>
          <Text style={styles.appName}>A2B LIFT</Text>
          <Text style={styles.slogan}>Premium Ride Experience</Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(800).delay(600)} style={styles.bottomArea}>
          <View style={styles.featureRow}>
            <View style={styles.featureItem}>
              <Ionicons name="shield-checkmark" size={20} color={Colors.textSecondary} />
              <Text style={styles.featureText}>Executive Service</Text>
            </View>
            <View style={styles.featureItem}>
              <Ionicons name="time" size={20} color={Colors.textSecondary} />
              <Text style={styles.featureText}>24/7 Available</Text>
            </View>
            <View style={styles.featureItem}>
              <Ionicons name="diamond" size={20} color={Colors.textSecondary} />
              <Text style={styles.featureText}>Luxury Fleet</Text>
            </View>
          </View>

          <Pressable
            style={({ pressed }) => [styles.primaryBtn, pressed && styles.btnPressed]}
            onPress={() => router.push("/login")}
          >
            <Text style={styles.primaryBtnText}>Get Started</Text>
            <Ionicons name="arrow-forward" size={20} color={Colors.primary} />
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.secondaryBtn, pressed && { opacity: 0.6 }]}
            onPress={() => router.push("/register")}
          >
            <Text style={styles.secondaryBtnText}>Create Account</Text>
          </Pressable>

          <View style={{ height: insets.bottom + (Platform.OS === "web" ? 34 : 16) }} />
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    flex: 1,
    width: "100%",
    justifyContent: "space-between",
    alignItems: "center",
  },
  logoArea: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.accent,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  appName: {
    fontSize: 36,
    fontFamily: "Inter_700Bold",
    color: Colors.white,
    letterSpacing: 4,
  },
  slogan: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  bottomArea: {
    width: "100%",
    paddingHorizontal: 24,
    gap: 12,
  },
  featureRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: 24,
  },
  featureItem: {
    alignItems: "center",
    gap: 6,
  },
  featureText: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
  },
  primaryBtn: {
    backgroundColor: Colors.white,
    paddingVertical: 16,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  btnPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  primaryBtnText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: Colors.primary,
  },
  secondaryBtn: {
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.accent,
  },
  secondaryBtnText: {
    fontSize: 16,
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
  },
});

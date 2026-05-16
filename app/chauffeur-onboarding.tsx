import React from "react";
import { View, Text, StyleSheet, Pressable, Platform, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import Colors from "@/constants/colors";

export default function ChauffeurOnboardingChoiceScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 24) }]}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]} showsVerticalScrollIndicator={false}>
        <Pressable style={styles.backBtn} onPress={() => router.canGoBack() ? router.back() : router.replace("/role-select")}>
          <Ionicons name="chevron-back" size={24} color={Colors.white} />
        </Pressable>

        <View style={styles.header}>
          <Text style={styles.title}>Choose your A2B LIFT account</Text>
          <Text style={styles.subtitle}>Start as a driver or register as a fleet partner. Both applications are reviewed by A2B before vehicles can go live.</Text>
        </View>

        <View style={styles.cards}>
          <Pressable style={styles.card} onPress={() => router.push("/chauffeur-register")}>
            <View style={styles.iconWrap}>
              <Ionicons name="person-circle-outline" size={30} color={Colors.white} />
            </View>
            <View style={styles.cardText}>
              <Text style={styles.cardTitle}>Register as a driver</Text>
              <Text style={styles.cardDesc}>Submit your driver profile and documents. Once approved, you can add multiple cars and choose which approved car to drive.</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
          </Pressable>

          <Pressable style={styles.card} onPress={() => router.push("/partner-register")}>
            <View style={[styles.iconWrap, styles.partnerIcon]}>
              <Ionicons name="business-outline" size={28} color={Colors.white} />
            </View>
            <View style={styles.cardText}>
              <Text style={styles.cardTitle}>Register as a partner</Text>
              <Text style={styles.cardDesc}>Register your company, add fleet vehicles after approval, and assign only A2B-approved drivers to those vehicles.</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.primary, paddingHorizontal: 24 },
  content: { flexGrow: 1 },
  backBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center", marginLeft: -8 },
  header: { marginTop: 22, marginBottom: 28, gap: 10 },
  title: { fontSize: 28, lineHeight: 34, fontFamily: "Inter_700Bold", color: Colors.white },
  subtitle: { fontSize: 14, lineHeight: 21, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
  cards: { gap: 14 },
  card: {
    minHeight: 142,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 18,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.card,
  },
  iconWrap: { width: 54, height: 54, borderRadius: 27, alignItems: "center", justifyContent: "center", backgroundColor: Colors.accent },
  partnerIcon: { backgroundColor: Colors.surface },
  cardText: { flex: 1, gap: 6 },
  cardTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: Colors.white },
  cardDesc: { fontSize: 13, lineHeight: 19, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
});

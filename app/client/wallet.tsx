import React from "react";
import { View, Text, StyleSheet, Pressable, Platform, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/lib/auth-context";
import Colors from "@/constants/colors";

const PAYMENT_METHODS = [
  { id: "visa", name: "Visa Card", icon: "card" as const, detail: "**** 4521" },
  { id: "paypal", name: "PayPal", icon: "logo-paypal" as const, detail: "Connected" },
  { id: "cash", name: "Cash", icon: "cash" as const, detail: "Pay on arrival" },
  { id: "eft", name: "EFT Transfer", icon: "swap-horizontal" as const, detail: "Bank transfer" },
];

export default function WalletScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  return (
    <ScrollView
      style={[styles.container, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 16) }]}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.title}>Wallet</Text>

      <View style={styles.balanceCard}>
        <Text style={styles.balanceLabel}>Available Balance</Text>
        <Text style={styles.balanceValue}>R {(user?.walletBalance || 0).toFixed(2)}</Text>
        <Text style={styles.balanceCurrency}>ZAR</Text>
        <View style={styles.balanceActions}>
          <Pressable style={({ pressed }) => [styles.balanceBtn, pressed && { opacity: 0.8 }]}>
            <Ionicons name="add" size={18} color={Colors.primary} />
            <Text style={styles.balanceBtnText}>Top Up</Text>
          </Pressable>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Payment Methods</Text>
      <View style={styles.methodsList}>
        {PAYMENT_METHODS.map((method) => (
          <Pressable key={method.id} style={({ pressed }) => [styles.methodCard, pressed && { opacity: 0.8 }]}>
            <View style={styles.methodIcon}>
              <Ionicons name={method.icon} size={20} color={Colors.white} />
            </View>
            <View style={styles.methodInfo}>
              <Text style={styles.methodName}>{method.name}</Text>
              <Text style={styles.methodDetail}>{method.detail}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
          </Pressable>
        ))}
      </View>

      <Pressable style={({ pressed }) => [styles.addMethodBtn, pressed && { opacity: 0.8 }]}>
        <Ionicons name="add-circle-outline" size={20} color={Colors.textSecondary} />
        <Text style={styles.addMethodText}>Add Payment Method</Text>
      </Pressable>

      <View style={{ height: 100 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.primary,
    paddingHorizontal: 20,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  title: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    color: Colors.white,
    marginBottom: 20,
  },
  balanceCard: {
    backgroundColor: Colors.card,
    borderRadius: 20,
    padding: 28,
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 28,
  },
  balanceLabel: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  balanceValue: {
    fontSize: 40,
    fontFamily: "Inter_700Bold",
    color: Colors.white,
    marginTop: 4,
  },
  balanceCurrency: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
  },
  balanceActions: {
    flexDirection: "row",
    marginTop: 16,
  },
  balanceBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.white,
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  balanceBtnText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.primary,
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: Colors.textSecondary,
    marginBottom: 12,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  methodsList: {
    gap: 8,
  },
  methodCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 16,
    gap: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  methodIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: Colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  methodInfo: {
    flex: 1,
    gap: 2,
  },
  methodName: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: Colors.white,
  },
  methodDetail: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
  },
  addMethodBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
    marginTop: 12,
  },
  addMethodText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
  },
});

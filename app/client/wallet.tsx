import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, Platform, ScrollView, Modal, TextInput, Alert, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/lib/auth-context";
import { apiRequest } from "@/lib/query-client";
import Colors from "@/constants/colors";

const PAYMENT_METHODS = [
  { id: "visa", name: "Visa Card", icon: "card" as const, detail: "**** 4521" },
  { id: "paypal", name: "PayPal", icon: "logo-paypal" as const, detail: "Connected" },
  { id: "cash", name: "Cash", icon: "cash" as const, detail: "Pay on arrival" },
  { id: "eft", name: "EFT Transfer", icon: "swap-horizontal" as const, detail: "Bank transfer" },
];

const TOPUP_AMOUNTS = [50, 100, 200, 500, 1000];

export default function WalletScreen() {
  const insets = useSafeAreaInsets();
  const { user, refreshUser } = useAuth();
  const [showTopUp, setShowTopUp] = useState(false);
  const [showAddMethod, setShowAddMethod] = useState(false);
  const [topUpAmount, setTopUpAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedMethod, setSelectedMethod] = useState("visa");

  async function handleTopUp() {
    const amount = parseFloat(topUpAmount);
    if (!amount || amount <= 0) {
      Alert.alert("Invalid Amount", "Please enter a valid amount");
      return;
    }
    if (!user) return;
    setLoading(true);
    try {
      await apiRequest("POST", `/api/users/${user.id}/topup`, { amount });
      await refreshUser();
      setShowTopUp(false);
      setTopUpAmount("");
      Alert.alert("Success", `R ${amount.toFixed(2)} added to your wallet`);
    } catch {
      Alert.alert("Error", "Top up failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

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
          <Pressable style={({ pressed }) => [styles.balanceBtn, pressed && { opacity: 0.8 }]} onPress={() => setShowTopUp(true)}>
            <Ionicons name="add" size={18} color={Colors.primary} />
            <Text style={styles.balanceBtnText}>Top Up</Text>
          </Pressable>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Payment Methods</Text>
      <View style={styles.methodsList}>
        {PAYMENT_METHODS.map((method) => (
          <Pressable
            key={method.id}
            style={({ pressed }) => [styles.methodCard, selectedMethod === method.id && styles.methodSelected, pressed && { opacity: 0.8 }]}
            onPress={() => setSelectedMethod(method.id)}
          >
            <View style={[styles.methodIcon, selectedMethod === method.id && styles.methodIconSelected]}>
              <Ionicons name={method.icon} size={20} color={Colors.white} />
            </View>
            <View style={styles.methodInfo}>
              <Text style={styles.methodName}>{method.name}</Text>
              <Text style={styles.methodDetail}>{method.detail}</Text>
            </View>
            {selectedMethod === method.id && (
              <Ionicons name="checkmark-circle" size={20} color={Colors.white} />
            )}
          </Pressable>
        ))}
      </View>

      <Pressable style={({ pressed }) => [styles.addMethodBtn, pressed && { opacity: 0.8 }]} onPress={() => setShowAddMethod(true)}>
        <Ionicons name="add-circle-outline" size={20} color={Colors.textSecondary} />
        <Text style={styles.addMethodText}>Add Payment Method</Text>
      </Pressable>

      <View style={{ height: 100 }} />

      <Modal visible={showTopUp} transparent animationType="slide" onRequestClose={() => setShowTopUp(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowTopUp(false)}>
          <View style={[styles.modalSheet, { paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 16) }]} onStartShouldSetResponder={() => true}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Top Up Wallet</Text>

            <View style={styles.quickAmounts}>
              {TOPUP_AMOUNTS.map((amt) => (
                <Pressable
                  key={amt}
                  style={[styles.amountChip, topUpAmount === String(amt) && styles.amountChipActive]}
                  onPress={() => setTopUpAmount(String(amt))}
                >
                  <Text style={[styles.amountChipText, topUpAmount === String(amt) && styles.amountChipTextActive]}>R {amt}</Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.customAmountRow}>
              <Text style={styles.currencyPrefix}>R</Text>
              <TextInput
                style={styles.amountInput}
                placeholder="Custom amount"
                placeholderTextColor={Colors.textMuted}
                value={topUpAmount}
                onChangeText={setTopUpAmount}
                keyboardType="numeric"
              />
            </View>

            <Pressable
              style={({ pressed }) => [styles.confirmBtn, pressed && { opacity: 0.9 }, loading && { opacity: 0.7 }]}
              onPress={handleTopUp}
              disabled={loading}
            >
              {loading ? <ActivityIndicator color={Colors.primary} /> : <Text style={styles.confirmBtnText}>Add Funds</Text>}
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      <Modal visible={showAddMethod} transparent animationType="slide" onRequestClose={() => setShowAddMethod(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowAddMethod(false)}>
          <View style={[styles.modalSheet, { paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 16) }]} onStartShouldSetResponder={() => true}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Add Payment Method</Text>

            <Pressable style={styles.newMethodOption} onPress={() => { setShowAddMethod(false); Alert.alert("Card Setup", "Card payment setup will be available in the next update. You can use cash, PayPal, or EFT for now."); }}>
              <View style={styles.newMethodIcon}><Ionicons name="card" size={20} color={Colors.white} /></View>
              <View style={styles.newMethodInfo}>
                <Text style={styles.newMethodName}>Credit/Debit Card</Text>
                <Text style={styles.newMethodDesc}>Add Visa, Mastercard, or AMEX</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
            </Pressable>

            <Pressable style={styles.newMethodOption} onPress={() => { setShowAddMethod(false); Alert.alert("PayPal", "Your PayPal account is already connected."); }}>
              <View style={styles.newMethodIcon}><Ionicons name="logo-paypal" size={20} color={Colors.white} /></View>
              <View style={styles.newMethodInfo}>
                <Text style={styles.newMethodName}>PayPal</Text>
                <Text style={styles.newMethodDesc}>Connect your PayPal account</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
            </Pressable>

            <Pressable style={styles.newMethodOption} onPress={() => { setShowAddMethod(false); Alert.alert("EFT", "Bank transfer details will be shown at checkout when you select EFT."); }}>
              <View style={styles.newMethodIcon}><Ionicons name="swap-horizontal" size={20} color={Colors.white} /></View>
              <View style={styles.newMethodInfo}>
                <Text style={styles.newMethodName}>EFT / Bank Transfer</Text>
                <Text style={styles.newMethodDesc}>Pay via bank transfer</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.primary, paddingHorizontal: 20 },
  scrollContent: { paddingBottom: 40 },
  title: { fontSize: 24, fontFamily: "Inter_700Bold", color: Colors.white, marginBottom: 20 },
  balanceCard: { backgroundColor: Colors.card, borderRadius: 20, padding: 28, alignItems: "center", gap: 4, borderWidth: 1, borderColor: Colors.border, marginBottom: 28 },
  balanceLabel: { fontSize: 13, fontFamily: "Inter_500Medium", color: Colors.textSecondary, textTransform: "uppercase", letterSpacing: 1 },
  balanceValue: { fontSize: 40, fontFamily: "Inter_700Bold", color: Colors.white, marginTop: 4 },
  balanceCurrency: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textMuted },
  balanceActions: { flexDirection: "row", marginTop: 16 },
  balanceBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: Colors.white, paddingVertical: 10, paddingHorizontal: 24, borderRadius: 12 },
  balanceBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.primary },
  sectionTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: Colors.textSecondary, marginBottom: 12, textTransform: "uppercase", letterSpacing: 1 },
  methodsList: { gap: 8 },
  methodCard: { flexDirection: "row", alignItems: "center", backgroundColor: Colors.card, borderRadius: 14, padding: 16, gap: 14, borderWidth: 1, borderColor: Colors.border },
  methodSelected: { borderColor: "rgba(255,255,255,0.2)" },
  methodIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: Colors.accent, alignItems: "center", justifyContent: "center" },
  methodIconSelected: { backgroundColor: Colors.white },
  methodInfo: { flex: 1, gap: 2 },
  methodName: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: Colors.white },
  methodDetail: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textMuted },
  addMethodBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 16, marginTop: 12 },
  addMethodText: { fontSize: 14, fontFamily: "Inter_500Medium", color: Colors.textSecondary },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  modalSheet: { backgroundColor: Colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, gap: 16 },
  sheetHandle: { width: 36, height: 4, backgroundColor: Colors.accent, borderRadius: 2, alignSelf: "center" },
  sheetTitle: { fontSize: 20, fontFamily: "Inter_600SemiBold", color: Colors.white },
  quickAmounts: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  amountChip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  amountChipActive: { backgroundColor: Colors.white, borderColor: Colors.white },
  amountChipText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.textSecondary },
  amountChipTextActive: { color: Colors.primary },
  customAmountRow: { flexDirection: "row", alignItems: "center", backgroundColor: Colors.surface, borderRadius: 12, paddingHorizontal: 16, borderWidth: 1, borderColor: Colors.border },
  currencyPrefix: { fontSize: 18, fontFamily: "Inter_700Bold", color: Colors.white, marginRight: 8 },
  amountInput: { flex: 1, paddingVertical: 14, fontSize: 18, fontFamily: "Inter_600SemiBold", color: Colors.white },
  confirmBtn: { backgroundColor: Colors.white, paddingVertical: 16, borderRadius: 14, alignItems: "center" },
  confirmBtnText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: Colors.primary },
  newMethodOption: { flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: Colors.surface, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: Colors.border },
  newMethodIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: Colors.accent, alignItems: "center", justifyContent: "center" },
  newMethodInfo: { flex: 1, gap: 2 },
  newMethodName: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: Colors.white },
  newMethodDesc: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textMuted },
});

import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, StyleSheet, Pressable, ScrollView,
  ActivityIndicator, Alert, Linking, Platform, Modal, TextInput,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/lib/auth-context";
import { apiRequest } from "@/lib/query-client";
import Colors from "@/constants/colors";

interface SavedCard {
  id: string;
  cardType: string;
  last4: string;
  expMonth: string;
  expYear: string;
  bank: string;
  isDefault: boolean;
}

interface WalletTx {
  id: string;
  type: string;
  amount: number;
  description: string;
  balanceAfter: number;
  createdAt: string;
  status: string;
}

const CARD_ICONS: Record<string, string> = {
  visa: "💳", mastercard: "💳", verve: "💳",
};

const TX_ICONS: Record<string, string> = {
  topup: "⬆️", ride_charge: "🚗", earning: "💰",
  withdrawal: "⬇️", refund: "↩️",
};

export default function ClientWalletScreen() {
  const insets = useSafeAreaInsets();
  const { user, refreshUser } = useAuth();

  const [cards, setCards] = useState<SavedCard[]>([]);
  const [transactions, setTransactions] = useState<WalletTx[]>([]);
  const [loading, setLoading] = useState(true);
  const [topupLoading, setTopupLoading] = useState(false);
  const [showTopup, setShowTopup] = useState(false);
  const [topupAmount, setTopupAmount] = useState("100");

  const loadData = useCallback(async () => {
    try {
      const [cardsRes, txRes] = await Promise.all([
        apiRequest("GET", "/api/payments/cards"),
        apiRequest("GET", "/api/wallet/transactions"),
      ]);
      setCards(await cardsRes.json());
      setTransactions(await txRes.json());
    } catch (e) {
      console.error("Failed to load wallet data", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, []);

  async function handleAddCard() {
    if (!user) return;
    setTopupLoading(true);
    try {
      const amount = parseFloat(topupAmount);
      if (isNaN(amount) || amount < 10) {
        Alert.alert("Invalid amount", "Minimum top-up is R10"); return;
      }

      const res = await apiRequest("POST", "/api/payments/initialize", {
        amount,
        email: user.username + "@a2blift.app",
        saveCard: true,
        rideId: null,
      });
      const { authorizationUrl, reference } = await res.json();

      // Open Paystack payment page
      setShowTopup(false);
      await Linking.openURL(authorizationUrl);

      // After user returns, verify payment
      Alert.alert(
        "Verify Payment",
        "Have you completed the payment?",
        [
          { text: "Not yet", style: "cancel" },
          {
            text: "Yes, verify",
            onPress: async () => {
              try {
                await apiRequest("POST", "/api/payments/verify", { reference });
                await refreshUser();
                loadData();
                Alert.alert("✅ Success", "Wallet topped up and card saved!");
              } catch (e) {
                Alert.alert("Error", "Could not verify payment. Please contact support.");
              }
            },
          },
        ]
      );
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to initialize payment");
    } finally {
      setTopupLoading(false);
    }
  }

  async function deleteCard(cardId: string) {
    Alert.alert("Remove Card", "Are you sure you want to remove this card?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove", style: "destructive",
        onPress: async () => {
          try {
            await apiRequest("DELETE", `/api/payments/cards/${cardId}`);
            loadData();
          } catch (e) {
            Alert.alert("Error", "Failed to remove card");
          }
        },
      },
    ]);
  }

  const balance = user?.walletBalance || 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 0) }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}>

        {/* ── Balance Card ── */}
        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Wallet Balance</Text>
          <Text style={styles.balanceAmount}>R {balance.toFixed(2)}</Text>
          <Text style={styles.balanceSub}>Available for rides</Text>
          <Pressable
            style={({ pressed }) => [styles.topupBtn, pressed && { opacity: 0.85 }]}
            onPress={() => setShowTopup(true)}
          >
            <Ionicons name="add" size={16} color={Colors.primary} />
            <Text style={styles.topupBtnText}>Add Money</Text>
          </Pressable>
        </View>

        {/* ── Payment Methods ── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Payment Methods</Text>
            <Pressable onPress={() => setShowTopup(true)}>
              <Text style={styles.sectionAction}>+ Add Card</Text>
            </Pressable>
          </View>

          {/* Cash option always shown */}
          <View style={styles.paymentRow}>
            <View style={styles.paymentIcon}>
              <Text style={{ fontSize: 20 }}>💵</Text>
            </View>
            <View style={styles.paymentInfo}>
              <Text style={styles.paymentName}>Cash</Text>
              <Text style={styles.paymentSub}>Pay driver directly after ride</Text>
            </View>
            <View style={styles.defaultBadge}>
              <Text style={styles.defaultBadgeText}>Available</Text>
            </View>
          </View>

          {/* Wallet balance if > 0 */}
          {balance > 0 && (
            <View style={styles.paymentRow}>
              <View style={styles.paymentIcon}>
                <Text style={{ fontSize: 20 }}>👛</Text>
              </View>
              <View style={styles.paymentInfo}>
                <Text style={styles.paymentName}>Wallet Balance</Text>
                <Text style={styles.paymentSub}>R {balance.toFixed(2)} available</Text>
              </View>
              <View style={styles.defaultBadge}>
                <Text style={styles.defaultBadgeText}>Ready</Text>
              </View>
            </View>
          )}

          {/* Saved cards */}
          {loading ? (
            <ActivityIndicator color={Colors.white} style={{ marginVertical: 20 }} />
          ) : cards.length === 0 ? (
            <Pressable style={styles.addCardRow} onPress={() => setShowTopup(true)}>
              <Ionicons name="card-outline" size={20} color={Colors.textMuted} />
              <Text style={styles.addCardText}>No saved cards · Tap to add one</Text>
            </Pressable>
          ) : (
            cards.map(card => (
              <View key={card.id} style={styles.paymentRow}>
                <View style={styles.paymentIcon}>
                  <Text style={{ fontSize: 20 }}>{CARD_ICONS[card.cardType?.toLowerCase()] || "💳"}</Text>
                </View>
                <View style={styles.paymentInfo}>
                  <Text style={styles.paymentName}>
                    {card.cardType?.toUpperCase()} •••• {card.last4}
                  </Text>
                  <Text style={styles.paymentSub}>{card.bank} · Expires {card.expMonth}/{card.expYear}</Text>
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  {card.isDefault && (
                    <View style={styles.defaultBadge}>
                      <Text style={styles.defaultBadgeText}>Default</Text>
                    </View>
                  )}
                  <Pressable onPress={() => deleteCard(card.id)} hitSlop={8}>
                    <Ionicons name="trash-outline" size={16} color={Colors.error} />
                  </Pressable>
                </View>
              </View>
            ))
          )}
        </View>

        {/* ── Transaction History ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Transaction History</Text>
          {transactions.length === 0 ? (
            <View style={styles.emptyTx}>
              <Text style={styles.emptyTxIcon}>📋</Text>
              <Text style={styles.emptyTxText}>No transactions yet</Text>
            </View>
          ) : (
            transactions.map(tx => (
              <View key={tx.id} style={styles.txRow}>
                <View style={styles.txIcon}>
                  <Text style={{ fontSize: 18 }}>{TX_ICONS[tx.type] || "💳"}</Text>
                </View>
                <View style={styles.txInfo}>
                  <Text style={styles.txDesc}>{tx.description || tx.type}</Text>
                  <Text style={styles.txDate}>
                    {new Date(tx.createdAt).toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" })}
                  </Text>
                </View>
                <Text style={[
                  styles.txAmount,
                  { color: ["topup", "earning", "refund"].includes(tx.type) ? Colors.success : Colors.error }
                ]}>
                  {["topup", "earning", "refund"].includes(tx.type) ? "+" : "-"}R {tx.amount.toFixed(2)}
                </Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      {/* ── Add Money Modal ── */}
      <Modal visible={showTopup} transparent animationType="slide" onRequestClose={() => setShowTopup(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowTopup(false)}>
          <View style={[styles.modalSheet, { paddingBottom: insets.bottom + 24 }]}>
            <View style={styles.sheetHandle} />
            <Text style={styles.modalTitle}>Add Money to Wallet</Text>
            <Text style={styles.modalSub}>Your card will be saved for future payments</Text>

            <View style={styles.amountRow}>
              {["50", "100", "200", "500"].map(amt => (
                <Pressable
                  key={amt}
                  style={[styles.amountChip, topupAmount === amt && styles.amountChipActive]}
                  onPress={() => setTopupAmount(amt)}
                >
                  <Text style={[styles.amountChipText, topupAmount === amt && styles.amountChipTextActive]}>
                    R{amt}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.customAmountWrap}>
              <Text style={styles.randSign}>R</Text>
              <TextInput
                style={styles.customAmountInput}
                value={topupAmount}
                onChangeText={setTopupAmount}
                keyboardType="numeric"
                placeholder="Enter amount"
                placeholderTextColor={Colors.textMuted}
              />
            </View>

            <View style={styles.paystackNote}>
              <Ionicons name="shield-checkmark-outline" size={14} color={Colors.textSecondary} />
              <Text style={styles.paystackNoteText}>Secured by Paystack · Card saved for future rides</Text>
            </View>

            <Pressable
              style={[styles.payBtn, topupLoading && { opacity: 0.7 }]}
              onPress={handleAddCard}
              disabled={topupLoading}
            >
              {topupLoading
                ? <ActivityIndicator color={Colors.primary} />
                : <Text style={styles.payBtnText}>Pay R{topupAmount} with Paystack</Text>
              }
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.primary },
  balanceCard: {
    margin: 20, padding: 24,
    backgroundColor: Colors.card, borderRadius: 20,
    borderWidth: 1, borderColor: Colors.border, alignItems: "center", gap: 6,
  },
  balanceLabel: { fontSize: 12, fontFamily: "Inter_500Medium", color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 1 },
  balanceAmount: { fontSize: 42, fontFamily: "Inter_700Bold", color: Colors.white, letterSpacing: -1 },
  balanceSub: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
  topupBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: Colors.white, paddingVertical: 10, paddingHorizontal: 24,
    borderRadius: 12, marginTop: 8,
  },
  topupBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.primary },
  section: { marginHorizontal: 20, marginBottom: 24 },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: Colors.white },
  sectionAction: { fontSize: 13, fontFamily: "Inter_500Medium", color: Colors.accent },
  paymentRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: Colors.card, borderRadius: 12, padding: 14,
    marginBottom: 8, borderWidth: 1, borderColor: Colors.border,
  },
  paymentIcon: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.surface, alignItems: "center", justifyContent: "center",
  },
  paymentInfo: { flex: 1 },
  paymentName: { fontSize: 14, fontFamily: "Inter_500Medium", color: Colors.white },
  paymentSub: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.textMuted, marginTop: 2 },
  defaultBadge: {
    backgroundColor: "rgba(34,197,94,0.12)", paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 6, borderWidth: 1, borderColor: "rgba(34,197,94,0.3)",
  },
  defaultBadgeText: { fontSize: 10, fontFamily: "Inter_600SemiBold", color: Colors.success },
  addCardRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: Colors.surface, borderRadius: 12, padding: 16,
    borderWidth: 1, borderColor: Colors.border, borderStyle: "dashed",
  },
  addCardText: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textMuted },
  txRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border },
  txIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.surface, alignItems: "center", justifyContent: "center" },
  txInfo: { flex: 1 },
  txDesc: { fontSize: 13, fontFamily: "Inter_500Medium", color: Colors.white },
  txDate: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.textMuted, marginTop: 2 },
  txAmount: { fontSize: 14, fontFamily: "Inter_700Bold" },
  emptyTx: { alignItems: "center", paddingVertical: 32, gap: 8 },
  emptyTxIcon: { fontSize: 32 },
  emptyTxText: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textMuted },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  modalSheet: { backgroundColor: Colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, gap: 16 },
  sheetHandle: { width: 36, height: 4, backgroundColor: Colors.accent, borderRadius: 2, alignSelf: "center" },
  modalTitle: { fontSize: 20, fontFamily: "Inter_700Bold", color: Colors.white },
  modalSub: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textMuted, marginTop: -8 },
  amountRow: { flexDirection: "row", gap: 10 },
  amountChip: { flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: Colors.surface, alignItems: "center", borderWidth: 1, borderColor: Colors.border },
  amountChipActive: { backgroundColor: Colors.white, borderColor: Colors.white },
  amountChipText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.textSecondary },
  amountChipTextActive: { color: Colors.primary },
  customAmountWrap: { flexDirection: "row", alignItems: "center", backgroundColor: Colors.surface, borderRadius: 12, paddingHorizontal: 16, borderWidth: 1, borderColor: Colors.border },
  randSign: { fontSize: 20, fontFamily: "Inter_700Bold", color: Colors.white, marginRight: 4 },
  customAmountInput: { flex: 1, paddingVertical: 14, fontSize: 24, fontFamily: "Inter_700Bold", color: Colors.white },
  paystackNote: { flexDirection: "row", alignItems: "center", gap: 6 },
  paystackNoteText: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
  payBtn: { backgroundColor: Colors.white, paddingVertical: 15, borderRadius: 14, alignItems: "center" },
  payBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: Colors.primary },
});

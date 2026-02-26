import React, { useState, useCallback } from "react";
import { View, Text, StyleSheet, Pressable, Platform, ScrollView, Modal, TextInput, Alert, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/lib/auth-context";
import { apiRequest } from "@/lib/query-client";
import Colors from "@/constants/colors";
import AsyncStorage from "@react-native-async-storage/async-storage";

interface PaymentMethod {
  id: string;
  name: string;
  icon: keyof typeof Ionicons.glyphMap;
  detail: string;
}

const DEFAULT_METHODS: PaymentMethod[] = [
  { id: "cash", name: "Cash", icon: "cash", detail: "Pay on arrival" },
];

const TOPUP_AMOUNTS = [50, 100, 200, 500, 1000];

export default function WalletScreen() {
  const insets = useSafeAreaInsets();
  const { user, refreshUser } = useAuth();
  const [showTopUp, setShowTopUp] = useState(false);
  const [showAddMethod, setShowAddMethod] = useState(false);
  const [showCardForm, setShowCardForm] = useState(false);
  const [topUpAmount, setTopUpAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedMethod, setSelectedMethod] = useState("cash");
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>(DEFAULT_METHODS);
  const [cardNumber, setCardNumber] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [cardCvv, setCardCvv] = useState("");
  const [cardName, setCardName] = useState("");

  const loadPaymentMethods = useCallback(async () => {
    try {
      const stored = await AsyncStorage.getItem(`payment_methods_${user?.id}`);
      if (stored) {
        setPaymentMethods(JSON.parse(stored));
      }
    } catch {}
  }, [user?.id]);

  React.useEffect(() => {
    loadPaymentMethods();
  }, [loadPaymentMethods]);

  async function savePaymentMethods(methods: PaymentMethod[]) {
    setPaymentMethods(methods);
    try {
      await AsyncStorage.setItem(`payment_methods_${user?.id}`, JSON.stringify(methods));
    } catch {}
  }

  function formatCardNumber(text: string) {
    const cleaned = text.replace(/\D/g, "").slice(0, 16);
    return cleaned.replace(/(.{4})/g, "$1 ").trim();
  }

  function formatExpiry(text: string) {
    const cleaned = text.replace(/\D/g, "").slice(0, 4);
    if (cleaned.length >= 3) return cleaned.slice(0, 2) + "/" + cleaned.slice(2);
    return cleaned;
  }

  function addCard() {
    const cleanNum = cardNumber.replace(/\s/g, "");
    if (cleanNum.length < 13) {
      Alert.alert("Invalid Card", "Please enter a valid card number");
      return;
    }
    if (cardExpiry.length < 5) {
      Alert.alert("Invalid Expiry", "Please enter a valid expiry date (MM/YY)");
      return;
    }
    if (cardCvv.length < 3) {
      Alert.alert("Invalid CVV", "Please enter a valid CVV");
      return;
    }
    if (!cardName.trim()) {
      Alert.alert("Name Required", "Please enter the cardholder name");
      return;
    }
    const last4 = cleanNum.slice(-4);
    const isVisa = cleanNum.startsWith("4");
    const isMaster = cleanNum.startsWith("5");
    const cardType = isVisa ? "Visa" : isMaster ? "Mastercard" : "Card";
    const newMethod: PaymentMethod = {
      id: `card_${Date.now()}`,
      name: `${cardType} •••• ${last4}`,
      icon: "card",
      detail: `Expires ${cardExpiry}`,
    };
    const updated = [...paymentMethods, newMethod];
    savePaymentMethods(updated);
    setSelectedMethod(newMethod.id);
    setCardNumber("");
    setCardExpiry("");
    setCardCvv("");
    setCardName("");
    setShowCardForm(false);
    Alert.alert("Card Added", `${cardType} ending in ${last4} has been saved.`);
  }

  function addEft() {
    const exists = paymentMethods.find(m => m.id === "eft");
    if (exists) {
      Alert.alert("Already Added", "EFT is already in your payment methods.");
      return;
    }
    const updated = [...paymentMethods, { id: "eft", name: "EFT Transfer", icon: "swap-horizontal" as keyof typeof Ionicons.glyphMap, detail: "Bank transfer" }];
    savePaymentMethods(updated);
    setShowAddMethod(false);
    Alert.alert("EFT Added", "Bank transfer has been added as a payment method.");
  }

  function removeMethod(id: string) {
    if (id === "cash") return;
    Alert.alert("Remove Payment Method", "Are you sure you want to remove this payment method?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove", style: "destructive", onPress: () => {
          const updated = paymentMethods.filter(m => m.id !== id);
          savePaymentMethods(updated);
          if (selectedMethod === id) setSelectedMethod("cash");
        }
      },
    ]);
  }

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
        {paymentMethods.map((method) => (
          <Pressable
            key={method.id}
            style={({ pressed }) => [styles.methodCard, selectedMethod === method.id && styles.methodSelected, pressed && { opacity: 0.8 }]}
            onPress={() => setSelectedMethod(method.id)}
            onLongPress={() => removeMethod(method.id)}
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

            <Pressable style={styles.newMethodOption} onPress={() => { setShowAddMethod(false); setShowCardForm(true); }}>
              <View style={styles.newMethodIcon}><Ionicons name="card" size={20} color={Colors.white} /></View>
              <View style={styles.newMethodInfo}>
                <Text style={styles.newMethodName}>Credit/Debit Card</Text>
                <Text style={styles.newMethodDesc}>Add Visa, Mastercard, or AMEX</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
            </Pressable>

            <Pressable style={styles.newMethodOption} onPress={addEft}>
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

      <Modal visible={showCardForm} transparent animationType="slide" onRequestClose={() => setShowCardForm(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowCardForm(false)}>
          <View style={[styles.modalSheet, { paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 16) }]} onStartShouldSetResponder={() => true}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Add Card</Text>

            <View style={styles.cardFormField}>
              <Text style={styles.cardFormLabel}>Card Number</Text>
              <TextInput
                style={styles.cardFormInput}
                placeholder="1234 5678 9012 3456"
                placeholderTextColor={Colors.textMuted}
                value={cardNumber}
                onChangeText={(t) => setCardNumber(formatCardNumber(t))}
                keyboardType="numeric"
                maxLength={19}
              />
            </View>

            <View style={styles.cardFormLabel2Row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardFormLabel}>Expiry</Text>
                <TextInput
                  style={styles.cardFormInput}
                  placeholder="MM/YY"
                  placeholderTextColor={Colors.textMuted}
                  value={cardExpiry}
                  onChangeText={(t) => setCardExpiry(formatExpiry(t))}
                  keyboardType="numeric"
                  maxLength={5}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardFormLabel}>CVV</Text>
                <TextInput
                  style={styles.cardFormInput}
                  placeholder="123"
                  placeholderTextColor={Colors.textMuted}
                  value={cardCvv}
                  onChangeText={(t) => setCardCvv(t.replace(/\D/g, "").slice(0, 4))}
                  keyboardType="numeric"
                  maxLength={4}
                  secureTextEntry
                />
              </View>
            </View>

            <View style={styles.cardFormField}>
              <Text style={styles.cardFormLabel}>Cardholder Name</Text>
              <TextInput
                style={styles.cardFormInput}
                placeholder="Name on card"
                placeholderTextColor={Colors.textMuted}
                value={cardName}
                onChangeText={setCardName}
                autoCapitalize="words"
              />
            </View>

            <Pressable
              style={({ pressed }) => [styles.confirmBtn, pressed && { opacity: 0.9 }]}
              onPress={addCard}
            >
              <Text style={styles.confirmBtnText}>Save Card</Text>
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
  cardFormField: { gap: 6 },
  cardFormLabel: { fontSize: 13, fontFamily: "Inter_500Medium", color: Colors.textSecondary },
  cardFormInput: { backgroundColor: Colors.surface, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, fontFamily: "Inter_500Medium", color: Colors.white, borderWidth: 1, borderColor: Colors.border },
  cardFormLabel2Row: { flexDirection: "row", gap: 12 },
});

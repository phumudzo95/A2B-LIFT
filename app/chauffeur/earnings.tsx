import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  ScrollView,
  ActivityIndicator,
  TextInput,
  Alert,
  FlatList,
  RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/query-client";
import Colors from "@/constants/colors";

export default function EarningsScreen() {
  const insets = useSafeAreaInsets();
  const [chauffeurId, setChauffeurId] = useState<string | null>(null);
  const [chauffeur, setChauffeur] = useState<any>(null);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [showWithdraw, setShowWithdraw] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem("a2b_chauffeur").then((stored) => {
      if (stored) {
        const c = JSON.parse(stored);
        setChauffeurId(c.id);
        setChauffeur(c);
      }
    });
  }, []);

  const { data: earningsData, isLoading, refetch } = useQuery({
    queryKey: ["/api/earnings/chauffeur", chauffeurId || ""],
    enabled: !!chauffeurId,
  });

  const { data: withdrawals } = useQuery({
    queryKey: ["/api/withdrawals/chauffeur", chauffeurId || ""],
    enabled: !!chauffeurId,
  });

  const withdrawMutation = useMutation({
    mutationFn: async (amount: number) => {
      const res = await apiRequest("POST", "/api/withdrawals", {
        chauffeurId,
        amount,
      });
      return res.json();
    },
    onSuccess: () => {
      setShowWithdraw(false);
      setWithdrawAmount("");
      queryClient.invalidateQueries({ queryKey: ["/api/withdrawals/chauffeur"] });
      Alert.alert("Success", "Withdrawal request submitted");
    },
    onError: () => {
      Alert.alert("Error", "Failed to submit withdrawal");
    },
  });

  const earningsList = Array.isArray(earningsData) ? earningsData : [];
  const totalEarnings = earningsList.reduce((sum: number, e: any) => sum + (e.amount || 0), 0);
  const totalCommission = earningsList.reduce((sum: number, e: any) => sum + (e.commission || 0), 0);
  const withdrawalsList = Array.isArray(withdrawals) ? withdrawals : [];

  return (
    <ScrollView
      style={[styles.container, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 16) }]}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={false} onRefresh={refetch} tintColor={Colors.white} />}
    >
      <Text style={styles.title}>Earnings</Text>

      <View style={styles.totalCard}>
        <Text style={styles.totalLabel}>Total Earnings</Text>
        <Text style={styles.totalValue}>R {totalEarnings.toFixed(0)}</Text>
        <Text style={styles.totalSub}>Commission paid: R {totalCommission.toFixed(0)} (20%)</Text>
        <Pressable
          style={({ pressed }) => [styles.withdrawBtn, pressed && { opacity: 0.9 }]}
          onPress={() => setShowWithdraw(!showWithdraw)}
        >
          <Ionicons name="arrow-up-circle" size={18} color={Colors.primary} />
          <Text style={styles.withdrawBtnText}>Request Withdrawal</Text>
        </Pressable>
      </View>

      {showWithdraw && (
        <View style={styles.withdrawCard}>
          <Text style={styles.withdrawTitle}>Withdrawal Amount</Text>
          <View style={styles.withdrawInputRow}>
            <Text style={styles.currencyPrefix}>R</Text>
            <TextInput
              style={styles.withdrawInput}
              placeholder="0"
              placeholderTextColor={Colors.textMuted}
              value={withdrawAmount}
              onChangeText={setWithdrawAmount}
              keyboardType="number-pad"
            />
          </View>
          <Pressable
            style={({ pressed }) => [styles.submitWithdrawBtn, pressed && { opacity: 0.9 }]}
            onPress={() => {
              const amt = parseFloat(withdrawAmount);
              if (!amt || amt <= 0) {
                Alert.alert("Invalid", "Enter a valid amount");
                return;
              }
              withdrawMutation.mutate(amt);
            }}
          >
            <Text style={styles.submitWithdrawText}>Submit</Text>
          </Pressable>
        </View>
      )}

      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Ionicons name="car-sport" size={20} color={Colors.textSecondary} />
          <Text style={styles.statValue}>{earningsList.length}</Text>
          <Text style={styles.statLabel}>Completed Trips</Text>
        </View>
        <View style={styles.statCard}>
          <Ionicons name="trending-up" size={20} color={Colors.success} />
          <Text style={styles.statValue}>R {chauffeur?.earningsTotal?.toFixed(0) || "0"}</Text>
          <Text style={styles.statLabel}>Lifetime Earnings</Text>
        </View>
      </View>

      {withdrawalsList.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Withdrawal History</Text>
          {withdrawalsList.map((w: any) => (
            <View key={w.id} style={styles.withdrawalItem}>
              <View style={styles.withdrawalInfo}>
                <Text style={styles.withdrawalAmount}>R {w.amount}</Text>
                <Text style={styles.withdrawalDate}>
                  {new Date(w.createdAt).toLocaleDateString("en-ZA")}
                </Text>
              </View>
              <View style={[styles.statusChip, {
                backgroundColor: w.status === "paid" ? `${Colors.success}20` :
                  w.status === "approved" ? `${Colors.warning}20` : `${Colors.textMuted}20`
              }]}>
                <Text style={[styles.statusChipText, {
                  color: w.status === "paid" ? Colors.success :
                    w.status === "approved" ? Colors.warning : Colors.textMuted
                }]}>
                  {w.status.charAt(0).toUpperCase() + w.status.slice(1)}
                </Text>
              </View>
            </View>
          ))}
        </>
      )}

      {earningsList.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Recent Earnings</Text>
          {earningsList.slice(0, 10).map((e: any) => (
            <View key={e.id} style={styles.earningItem}>
              <View style={styles.earningIcon}>
                <Ionicons name="checkmark-circle" size={16} color={Colors.success} />
              </View>
              <View style={styles.earningInfo}>
                <Text style={styles.earningAmount}>R {e.amount?.toFixed(0)}</Text>
                <Text style={styles.earningCommission}>Commission: R {e.commission?.toFixed(0)}</Text>
              </View>
              <Text style={styles.earningDate}>
                {new Date(e.createdAt).toLocaleDateString("en-ZA")}
              </Text>
            </View>
          ))}
        </>
      )}

      <View style={{ height: 120 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.primary, paddingHorizontal: 20 },
  scrollContent: { paddingBottom: 40 },
  title: { fontSize: 24, fontFamily: "Inter_700Bold", color: Colors.white, marginBottom: 20 },
  totalCard: { backgroundColor: Colors.card, borderRadius: 20, padding: 28, alignItems: "center", gap: 6, borderWidth: 1, borderColor: Colors.border, marginBottom: 20 },
  totalLabel: { fontSize: 13, fontFamily: "Inter_500Medium", color: Colors.textSecondary, textTransform: "uppercase" as const, letterSpacing: 1 },
  totalValue: { fontSize: 40, fontFamily: "Inter_700Bold", color: Colors.white },
  totalSub: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textMuted },
  withdrawBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: Colors.white, paddingVertical: 10, paddingHorizontal: 20, borderRadius: 12, marginTop: 12 },
  withdrawBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.primary },
  withdrawCard: { backgroundColor: Colors.card, borderRadius: 14, padding: 20, gap: 14, borderWidth: 1, borderColor: Colors.border, marginBottom: 20 },
  withdrawTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: Colors.white },
  withdrawInputRow: { flexDirection: "row", alignItems: "center", backgroundColor: Colors.surface, borderRadius: 12, paddingHorizontal: 16 },
  currencyPrefix: { fontSize: 20, fontFamily: "Inter_700Bold", color: Colors.textSecondary },
  withdrawInput: { flex: 1, paddingVertical: 14, fontSize: 24, fontFamily: "Inter_700Bold", color: Colors.white, marginLeft: 8 },
  submitWithdrawBtn: { backgroundColor: Colors.white, paddingVertical: 14, borderRadius: 12, alignItems: "center" },
  submitWithdrawText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: Colors.primary },
  statsRow: { flexDirection: "row", gap: 12, marginBottom: 24 },
  statCard: { flex: 1, backgroundColor: Colors.card, borderRadius: 14, padding: 18, alignItems: "center", gap: 6, borderWidth: 1, borderColor: Colors.border },
  statValue: { fontSize: 20, fontFamily: "Inter_700Bold", color: Colors.white },
  statLabel: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.textMuted },
  sectionTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.textSecondary, textTransform: "uppercase" as const, letterSpacing: 1, marginBottom: 12 },
  withdrawalItem: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: Colors.card, borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: Colors.border },
  withdrawalInfo: { gap: 2 },
  withdrawalAmount: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: Colors.white },
  withdrawalDate: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.textMuted },
  statusChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  statusChipText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  earningItem: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: Colors.card, borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: Colors.border },
  earningIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: `${Colors.success}20`, alignItems: "center", justifyContent: "center" },
  earningInfo: { flex: 1, gap: 2 },
  earningAmount: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: Colors.white },
  earningCommission: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.textMuted },
  earningDate: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.textMuted },
});

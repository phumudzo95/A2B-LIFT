import React, { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { apiRequest } from "@/lib/query-client";
import { useAuth } from "@/lib/auth-context";
import Colors from "@/constants/colors";

type ReferralSummary = {
  referralCode: string;
  shareUrl: string;
  rewardsBalance: number;
  referredCount: number;
  rewardedReferrals: number;
  totalRewardsEarned: number;
  pendingCashoutAmount: number;
};

type RewardTransaction = {
  id: string;
  type: string;
  amount: number;
  balanceAfter: number;
  description: string | null;
  status: string;
  createdAt: string;
};

type RewardCashout = {
  id: string;
  amount: number;
  status: string;
  bankName: string | null;
  accountHolder: string | null;
  requestedAt: string;
};

type ReferralDashboardResponse = ReferralSummary & {
  transactions?: RewardTransaction[];
  cashouts?: RewardCashout[];
};

const FALLBACK_REFERRAL_BASE_URL = "https://api-production-0783.up.railway.app";

const TX_LABELS: Record<string, string> = {
  referral_reward: "Referral reward",
  ride_cashback: "Trip cashback",
  ride_redemption: "Ride redemption",
  ride_refund: "Ride refund",
  cashout_request: "Cash-out request",
  cashout_reversal: "Cash-out reversal",
};

const REWARD_STEPS = [
  {
    number: "01",
    title: "Share your invite",
    copy: "Send your code or link to new riders.",
  },
  {
    number: "02",
    title: "Earn 5% on referrals",
    copy: "When your invited rider completes a trip, you get 5% back.",
  },
  {
    number: "03",
    title: "Earn 2.5% on your rides",
    copy: "Every completed trip you take adds 2.5% to your loyalty balance.",
  },
];

function formatCurrency(value: number) {
  return `R ${Number(value || 0).toFixed(2)}`;
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-ZA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function transactionTone(type: string) {
  if (type === "ride_redemption" || type === "cashout_request") {
    return styles.rowAmountNegative;
  }
  return styles.rowAmountPositive;
}

function transactionPrefix(type: string) {
  if (type === "ride_redemption" || type === "cashout_request") {
    return "-";
  }
  return "+";
}

function buildReferralShareUrl(referralCode?: string | null, shareUrl?: string | null) {
  if (shareUrl?.trim()) return shareUrl.trim();
  if (!referralCode?.trim()) return "";
  return `${FALLBACK_REFERRAL_BASE_URL}/r/${encodeURIComponent(referralCode.trim().toUpperCase())}`;
}

function buildFallbackSummary(referralCode?: string | null, rewardsBalance?: number | null): ReferralSummary | null {
  const normalizedCode = referralCode?.trim().toUpperCase();
  if (!normalizedCode) return null;

  return {
    referralCode: normalizedCode,
    shareUrl: buildReferralShareUrl(normalizedCode),
    rewardsBalance: Number(rewardsBalance || 0),
    referredCount: 0,
    rewardedReferrals: 0,
    totalRewardsEarned: 0,
    pendingCashoutAmount: 0,
  };
}

function getFriendlyRewardsError(error: any) {
  const message = String(error?.message || "");
  if (message.includes("404")) {
    return "Some rewards activity is not available right now, but your invite link is ready to share.";
  }
  if (message.includes("401")) {
    return "Your session expired. Please log in again to refresh rewards activity.";
  }
  return "Rewards activity could not be refreshed right now.";
}

export default function ReferralsScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { user, refreshUser } = useAuth();
  const hasLoadedOnceRef = useRef(false);
  const [summary, setSummary] = useState<ReferralSummary | null>(null);
  const [transactions, setTransactions] = useState<RewardTransaction[]>([]);
  const [cashouts, setCashouts] = useState<RewardCashout[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadNotice, setLoadNotice] = useState<string | null>(null);
  const [showCashout, setShowCashout] = useState(false);
  const [cashoutAmount, setCashoutAmount] = useState("");
  const [bankName, setBankName] = useState("");
  const [accountHolder, setAccountHolder] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [cashoutBusy, setCashoutBusy] = useState(false);

  const isWide = width >= 900;

  const loadData = useCallback(async (options?: { showLoader?: boolean }) => {
    const showLoader = options?.showLoader ?? !hasLoadedOnceRef.current;

    if (showLoader) {
      setLoading(true);
    }
    setLoadNotice(null);

    const fallbackSummary = buildFallbackSummary(user?.referralCode, user?.rewardsBalance);

    try {
      let nextSummary = fallbackSummary;
      let nextTransactions: RewardTransaction[] = [];
      let nextCashouts: RewardCashout[] = [];

      try {
        const summaryRes = await apiRequest("GET", "/api/referrals/me");
        const summaryPayload = (await summaryRes.json()) as ReferralDashboardResponse;

        nextSummary = {
          referralCode: summaryPayload.referralCode,
          shareUrl: buildReferralShareUrl(summaryPayload.referralCode, summaryPayload.shareUrl),
          rewardsBalance: Number(summaryPayload.rewardsBalance || 0),
          referredCount: Number(summaryPayload.referredCount || 0),
          rewardedReferrals: Number(summaryPayload.rewardedReferrals || 0),
          totalRewardsEarned: Number(summaryPayload.totalRewardsEarned || 0),
          pendingCashoutAmount: Number(summaryPayload.pendingCashoutAmount || 0),
        };

        if (Array.isArray(summaryPayload.transactions)) {
          nextTransactions = summaryPayload.transactions;
        }
        if (Array.isArray(summaryPayload.cashouts)) {
          nextCashouts = summaryPayload.cashouts;
        }
      } catch (error: any) {
        setLoadNotice(getFriendlyRewardsError(error));
      }

      if (nextTransactions.length === 0 || nextCashouts.length === 0) {
        const [txResult, cashoutResult] = await Promise.allSettled([
          nextTransactions.length === 0 ? apiRequest("GET", "/api/rewards/transactions") : Promise.resolve(null),
          nextCashouts.length === 0 ? apiRequest("GET", "/api/rewards/cashouts") : Promise.resolve(null),
        ]);

        if (nextTransactions.length === 0 && txResult.status === "fulfilled" && txResult.value) {
          nextTransactions = await txResult.value.json();
        } else if (nextTransactions.length === 0 && txResult.status === "rejected") {
          setLoadNotice((current) => current || getFriendlyRewardsError(txResult.reason));
        }

        if (nextCashouts.length === 0 && cashoutResult.status === "fulfilled" && cashoutResult.value) {
          nextCashouts = await cashoutResult.value.json();
        } else if (nextCashouts.length === 0 && cashoutResult.status === "rejected") {
          setLoadNotice((current) => current || getFriendlyRewardsError(cashoutResult.reason));
        }
      }

      setSummary(nextSummary);
      setTransactions(Array.isArray(nextTransactions) ? nextTransactions : []);
      setCashouts(Array.isArray(nextCashouts) ? nextCashouts : []);
      hasLoadedOnceRef.current = true;
    } finally {
      if (showLoader) {
        setLoading(false);
      }
    }
  }, [user?.referralCode, user?.rewardsBalance]);

  useFocusEffect(
    useCallback(() => {
      const refreshDashboard = async (showLoader = false) => {
        await refreshUser();
        await loadData({ showLoader });
      };

      void refreshDashboard(!hasLoadedOnceRef.current);
      const intervalId = setInterval(() => {
        void refreshDashboard(false);
      }, 15000);

      return () => clearInterval(intervalId);
    }, [loadData, refreshUser]),
  );

  async function handleShareReferral() {
    const referralCode = summary?.referralCode || user?.referralCode || "";
    const shareUrl = buildReferralShareUrl(referralCode, summary?.shareUrl);
    if (!referralCode || !shareUrl) {
      Alert.alert("Invite Unavailable", "Your referral link is still being prepared. Please try again in a moment.");
      return;
    }

    try {
      await Share.share({
        message: `Join A2B LIFT with my referral code ${referralCode}. Tap this link to open the app and start registration: ${shareUrl}`,
        url: shareUrl,
      });
    } catch (error: any) {
      Alert.alert("Share Failed", error.message || "Could not open the share sheet.");
    }
  }

  async function handleCashoutRequest() {
    const amount = Number(cashoutAmount);
    if (!amount || amount <= 0) {
      Alert.alert("Invalid Amount", "Enter a valid cash-out amount.");
      return;
    }

    setCashoutBusy(true);
    try {
      await apiRequest("POST", "/api/rewards/cashout", {
        amount,
        bankName: bankName.trim() || null,
        accountHolder: accountHolder.trim() || null,
        accountNumber: accountNumber.trim() || null,
      });
      await refreshUser();
      await loadData({ showLoader: false });
      setShowCashout(false);
      setCashoutAmount("");
      setBankName("");
      setAccountHolder("");
      setAccountNumber("");
      Alert.alert("Request Submitted", "Your rewards cash-out request has been sent for review.");
    } catch (error: any) {
      Alert.alert("Cash-Out Failed", error.message || "Could not submit your request.");
    } finally {
      setCashoutBusy(false);
    }
  }

  if (loading) {
    return (
      <View style={[styles.loadingWrap, { paddingTop: insets.top + 16 }]}> 
        <ActivityIndicator color={Colors.white} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 16) }]}> 
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.navigate("/client/profile")} hitSlop={10}>
            <Ionicons name="chevron-back" size={24} color={Colors.white} />
          </Pressable>
          <Text style={styles.title}>Referral Club</Text>
          <Pressable onPress={handleShareReferral} hitSlop={10}>
            <Ionicons name="share-social-outline" size={22} color={Colors.white} />
          </Pressable>
        </View>

        <Text style={styles.eyebrow}>INVITE. EARN. RIDE.</Text>
        <Text style={styles.pageLead}>
          Earn 2.5% back on every ride and 5% when your referral completes a trip.
        </Text>

        {loadNotice ? <Text style={styles.inlineNotice}>{loadNotice}</Text> : null}

        <View style={[styles.heroGrid, isWide && styles.heroGridWide]}>
          <View style={[styles.inviteCard, isWide && styles.heroColumn]}>
            <View style={styles.stepBadgeRow}>
              <View style={styles.stepBadgeLight}>
                <Text style={styles.stepBadgeLightText}>1</Text>
              </View>
              <Text style={styles.cardTitleDark}>Share your invite</Text>
            </View>

            <Text style={styles.cardCopyDark}>
              Share your code. Every completed referral trip pays you 5%.
            </Text>

            <View style={styles.codeBlock}>
              <Text style={styles.codeBlockLabel}>Referral code</Text>
              <Text style={styles.codeBlockValue}>{summary?.referralCode || "-"}</Text>
            </View>

            <View style={styles.linkPill}>
              <Ionicons name="link-outline" size={15} color="#181818" />
              <Text style={styles.linkPillText} numberOfLines={1}>{buildReferralShareUrl(summary?.referralCode || user?.referralCode, summary?.shareUrl) || "Link unavailable"}</Text>
            </View>

            <Pressable style={styles.primaryAction} onPress={handleShareReferral}>
              <Ionicons name="paper-plane-outline" size={16} color="#181818" />
              <Text style={styles.primaryActionText}>Invite Friends</Text>
            </Pressable>

            <Text style={styles.cardHintDark}>Your loyalty balance updates automatically after completed trips.</Text>
          </View>

          <View style={[styles.balanceCard, isWide && styles.heroColumn]}>
            <View style={styles.stepBadgeRow}>
              <View style={styles.stepBadgeDark}>
                <Text style={styles.stepBadgeDarkText}>2</Text>
              </View>
              <Text style={styles.cardTitleLight}>Rewards wallet</Text>
            </View>

            <Text style={styles.balanceAmount}>{formatCurrency(summary?.rewardsBalance || 0)}</Text>
            <Text style={styles.balanceCopy}>
              You earn 2.5% back on every completed ride. Spend it on trips or withdraw it.
            </Text>

            <View style={styles.balanceMetaRow}>
              <View style={styles.balanceMetaCard}>
                <Text style={styles.balanceMetaLabel}>Pending cash-outs</Text>
                <Text style={styles.balanceMetaValue}>{formatCurrency(summary?.pendingCashoutAmount || 0)}</Text>
              </View>
              <View style={styles.balanceMetaCard}>
                <Text style={styles.balanceMetaLabel}>Rewarded riders</Text>
                <Text style={styles.balanceMetaValue}>{summary?.rewardedReferrals || 0}</Text>
              </View>
            </View>

            <View style={styles.balanceNotice}>
              <Ionicons name="sparkles-outline" size={16} color={Colors.white} />
              <Text style={styles.balanceNoticeText}>Balances refresh after completed trips and referral rewards post automatically.</Text>
            </View>

            <View style={styles.balanceActionsRow}>
              <Pressable style={styles.secondaryAction} onPress={() => setShowCashout(true)}>
                <Text style={styles.secondaryActionText}>Withdraw</Text>
              </Pressable>
              <Pressable style={styles.outlineAction} onPress={handleShareReferral}>
                <Text style={styles.outlineActionText}>Share Link</Text>
              </Pressable>
            </View>
          </View>
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>How It Works</Text>
            <Text style={styles.sectionCaption}>Three simple steps</Text>
          </View>
          {REWARD_STEPS.map((step, index) => (
            <View key={step.number} style={[styles.stepRow, index > 0 && styles.stepRowBorder]}>
              <Text style={styles.stepRowNumber}>{step.number}</Text>
              <View style={styles.stepRowBody}>
                <Text style={styles.stepRowTitle}>{step.title}</Text>
                <Text style={styles.stepRowCopy}>{step.copy}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={[styles.metricGrid, isWide && styles.metricGridWide]}>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>People referred</Text>
            <Text style={styles.metricValue}>{summary?.referredCount || 0}</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Total earned</Text>
            <Text style={styles.metricValue}>{formatCurrency(summary?.totalRewardsEarned || 0)}</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Ready to spend</Text>
            <Text style={styles.metricValue}>{formatCurrency(summary?.rewardsBalance || 0)}</Text>
          </View>
        </View>

        <View style={[styles.detailGrid, isWide && styles.detailGridWide]}>
          <View style={[styles.sectionCard, styles.detailCard, isWide && styles.detailCardWide]}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Recent Reward Activity</Text>
              <Text style={styles.sectionCaption}>{transactions.length} entries</Text>
            </View>
            {transactions.length === 0 ? (
              <Text style={styles.emptyText}>No rewards activity yet.</Text>
            ) : (
              transactions.map((tx, index) => (
                <View key={tx.id} style={[styles.rowItem, index > 0 && styles.rowItemBorder]}>
                  <View style={styles.rowIconWrap}>
                    <Ionicons
                      name={tx.type === "ride_redemption" ? "car-outline" : tx.type === "cashout_request" ? "cash-outline" : tx.type === "ride_cashback" ? "sparkles-outline" : "gift-outline"}
                      size={18}
                      color={Colors.white}
                    />
                  </View>
                  <View style={styles.rowMain}>
                    <Text style={styles.rowTitle}>{TX_LABELS[tx.type] || tx.type}</Text>
                    <Text style={styles.rowSub}>{tx.description || "Rewards update"}</Text>
                  </View>
                  <View style={styles.rowRight}>
                    <Text style={[styles.rowAmount, transactionTone(tx.type)]}>
                      {transactionPrefix(tx.type)}{formatCurrency(tx.amount)}
                    </Text>
                    <Text style={styles.rowMeta}>Bal: {formatCurrency(tx.balanceAfter)}</Text>
                  </View>
                </View>
              ))
            )}
          </View>

          <View style={[styles.sectionCard, styles.detailCard, isWide && styles.detailCardWide]}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Withdrawal History</Text>
              <Pressable onPress={() => setShowCashout(true)}>
                <Text style={styles.sectionAction}>Request</Text>
              </Pressable>
            </View>
            {cashouts.length === 0 ? (
              <Text style={styles.emptyText}>No withdrawal requests yet.</Text>
            ) : (
              cashouts.map((cashout, index) => (
                <View key={cashout.id} style={[styles.rowItem, index > 0 && styles.rowItemBorder]}>
                  <View style={[styles.rowIconWrap, styles.cashoutIconWrap]}>
                    <Ionicons name="arrow-down-outline" size={18} color={Colors.white} />
                  </View>
                  <View style={styles.rowMain}>
                    <Text style={styles.rowTitle}>{formatCurrency(cashout.amount)}</Text>
                    <Text style={styles.rowSub}>{cashout.bankName || "Manual payout"}</Text>
                  </View>
                  <View style={styles.rowRight}>
                    <Text style={styles.cashoutStatus}>{cashout.status.toUpperCase()}</Text>
                    <Text style={styles.rowMeta}>{formatDate(cashout.requestedAt)}</Text>
                  </View>
                </View>
              ))
            )}
          </View>
        </View>
      </ScrollView>

      <Modal visible={showCashout} transparent animationType="slide" onRequestClose={() => setShowCashout(false)}>
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowCashout(false)} />
          <View style={[styles.modalSheet, { paddingBottom: insets.bottom + 16 }]}> 
            <Text style={styles.modalEyebrow}>WITHDRAW REWARDS</Text>
            <Text style={styles.modalTitle}>Request Balance Payout</Text>
            <Text style={styles.modalCopy}>
              Submit your preferred bank details and the A2B team will review the request manually.
            </Text>
            <TextInput
              value={cashoutAmount}
              onChangeText={setCashoutAmount}
              placeholder="Amount"
              placeholderTextColor={Colors.textMuted}
              keyboardType="decimal-pad"
              style={styles.input}
            />
            <TextInput
              value={bankName}
              onChangeText={setBankName}
              placeholder="Bank Name"
              placeholderTextColor={Colors.textMuted}
              style={styles.input}
            />
            <TextInput
              value={accountHolder}
              onChangeText={setAccountHolder}
              placeholder="Account Holder"
              placeholderTextColor={Colors.textMuted}
              style={styles.input}
            />
            <TextInput
              value={accountNumber}
              onChangeText={setAccountNumber}
              placeholder="Account Number"
              placeholderTextColor={Colors.textMuted}
              keyboardType="number-pad"
              style={styles.input}
            />
            <Pressable style={styles.submitBtn} onPress={handleCashoutRequest} disabled={cashoutBusy}>
              {cashoutBusy ? <ActivityIndicator color={Colors.primary} /> : <Text style={styles.submitBtnText}>Submit Withdrawal Request</Text>}
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.primary,
    paddingHorizontal: 20,
  },
  loadingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.primary,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 18,
  },
  title: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    color: Colors.white,
  },
  eyebrow: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: "#B69455",
    letterSpacing: 1.8,
    marginBottom: 10,
  },
  pageLead: {
    fontSize: 24,
    lineHeight: 32,
    color: Colors.white,
    fontFamily: "Inter_700Bold",
    marginBottom: 20,
    maxWidth: 760,
  },
  inlineNotice: {
    fontSize: 12,
    lineHeight: 18,
    color: Colors.warning,
    fontFamily: "Inter_500Medium",
    marginBottom: 6,
  },
  heroGrid: {
    gap: 14,
    marginBottom: 14,
  },
  heroGridWide: {
    flexDirection: "row",
    alignItems: "stretch",
  },
  heroColumn: {
    flex: 1,
  },
  inviteCard: {
    backgroundColor: "#F4EFE6",
    borderRadius: 26,
    padding: 22,
    minHeight: 320,
  },
  balanceCard: {
    backgroundColor: "#151515",
    borderRadius: 26,
    padding: 22,
    borderWidth: 1,
    borderColor: "#242424",
    minHeight: 320,
  },
  stepBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 16,
  },
  stepBadgeLight: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "rgba(24,24,24,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  stepBadgeLightText: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    color: "#181818",
  },
  stepBadgeDark: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.24)",
    alignItems: "center",
    justifyContent: "center",
  },
  stepBadgeDarkText: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    color: Colors.white,
  },
  cardTitleDark: {
    fontSize: 28,
    lineHeight: 34,
    fontFamily: "Inter_700Bold",
    color: "#181818",
  },
  cardTitleLight: {
    fontSize: 28,
    lineHeight: 34,
    fontFamily: "Inter_700Bold",
    color: Colors.white,
  },
  cardCopyDark: {
    fontSize: 15,
    lineHeight: 22,
    color: "#5D574D",
    fontFamily: "Inter_400Regular",
    marginBottom: 18,
    maxWidth: 420,
  },
  codeBlock: {
    backgroundColor: "rgba(24,24,24,0.08)",
    borderRadius: 20,
    padding: 16,
    marginBottom: 12,
  },
  codeBlockLabel: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: "#6B6459",
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  codeBlockValue: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    color: "#181818",
    letterSpacing: 1.4,
  },
  linkPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(255,255,255,0.7)",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 14,
  },
  linkPillText: {
    flex: 1,
    fontSize: 13,
    color: "#181818",
    fontFamily: "Inter_500Medium",
  },
  primaryAction: {
    backgroundColor: "#181818",
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  primaryActionText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: "#F4EFE6",
  },
  cardHintDark: {
    marginTop: 14,
    fontSize: 12,
    lineHeight: 18,
    color: "#6B6459",
    fontFamily: "Inter_400Regular",
  },
  balanceAmount: {
    fontSize: 34,
    lineHeight: 38,
    fontFamily: "Inter_700Bold",
    color: Colors.white,
    marginBottom: 10,
  },
  balanceCopy: {
    fontSize: 14,
    lineHeight: 21,
    color: Colors.textSecondary,
    fontFamily: "Inter_400Regular",
    marginBottom: 16,
    maxWidth: 420,
  },
  balanceMetaRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 14,
  },
  balanceMetaCard: {
    flex: 1,
    backgroundColor: "#202020",
    borderRadius: 16,
    padding: 14,
  },
  balanceMetaLabel: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    color: Colors.textMuted,
    marginBottom: 6,
  },
  balanceMetaValue: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    color: Colors.white,
  },
  balanceNotice: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 16,
    padding: 14,
    marginBottom: 16,
  },
  balanceNoticeText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    color: Colors.textSecondary,
    fontFamily: "Inter_400Regular",
  },
  balanceActionsRow: {
    flexDirection: "row",
    gap: 10,
  },
  secondaryAction: {
    flex: 1,
    backgroundColor: Colors.white,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryActionText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.primary,
  },
  outlineAction: {
    flex: 1,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  outlineActionText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.white,
  },
  sectionCard: {
    backgroundColor: Colors.card,
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: Colors.border,
    marginTop: 14,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 6,
  },
  sectionTitle: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
    color: Colors.white,
  },
  sectionCaption: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: Colors.textMuted,
  },
  sectionAction: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: "#D8B26B",
  },
  stepRow: {
    flexDirection: "row",
    gap: 14,
    paddingVertical: 14,
  },
  stepRowBorder: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  stepRowNumber: {
    width: 30,
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    color: "#D8B26B",
  },
  stepRowBody: {
    flex: 1,
  },
  stepRowTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: Colors.white,
    marginBottom: 4,
  },
  stepRowCopy: {
    fontSize: 13,
    lineHeight: 20,
    color: Colors.textSecondary,
    fontFamily: "Inter_400Regular",
  },
  metricGrid: {
    gap: 12,
    marginTop: 14,
  },
  metricGridWide: {
    flexDirection: "row",
  },
  metricCard: {
    flex: 1,
    backgroundColor: "#111111",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 18,
  },
  metricLabel: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: Colors.textMuted,
    marginBottom: 10,
  },
  metricValue: {
    fontSize: 24,
    lineHeight: 30,
    fontFamily: "Inter_700Bold",
    color: Colors.white,
  },
  detailGrid: {
    gap: 14,
  },
  detailGridWide: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  detailCard: {
    marginTop: 14,
  },
  detailCardWide: {
    flex: 1,
    minHeight: 320,
  },
  emptyText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
    marginTop: 8,
  },
  rowItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
  },
  rowItemBorder: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  rowIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1F1F1F",
  },
  cashoutIconWrap: {
    backgroundColor: "#2A2117",
  },
  rowMain: {
    flex: 1,
  },
  rowTitle: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.white,
  },
  rowSub: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
    marginTop: 3,
  },
  rowRight: {
    alignItems: "flex-end",
  },
  rowAmount: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  rowAmountPositive: {
    color: Colors.success,
  },
  rowAmountNegative: {
    color: "#D8B26B",
  },
  rowMeta: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
    marginTop: 4,
  },
  cashoutStatus: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: Colors.white,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: "#121212",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: "#252525",
  },
  modalEyebrow: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: "#B69455",
    letterSpacing: 1.6,
  },
  modalTitle: {
    fontSize: 24,
    lineHeight: 30,
    fontFamily: "Inter_700Bold",
    color: Colors.white,
  },
  modalCopy: {
    fontSize: 13,
    lineHeight: 20,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    marginBottom: 6,
  },
  input: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    color: Colors.white,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontFamily: "Inter_400Regular",
  },
  submitBtn: {
    backgroundColor: Colors.white,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 15,
    marginTop: 4,
  },
  submitBtnText: {
    color: Colors.primary,
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
});

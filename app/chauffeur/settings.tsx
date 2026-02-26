import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, Pressable, Platform, ScrollView, Modal, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useAuth } from "@/lib/auth-context";
import { apiRequest } from "@/lib/query-client";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Colors from "@/constants/colors";

export default function ChauffeurSettingsScreen() {
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const [showVehicle, setShowVehicle] = useState(false);
  const [showDocuments, setShowDocuments] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [chauffeur, setChauffeur] = useState<any>(null);

  useEffect(() => {
    loadChauffeur();
  }, []);

  async function loadChauffeur() {
    try {
      const stored = await AsyncStorage.getItem("a2b_chauffeur");
      if (stored) {
        const c = JSON.parse(stored);
        const res = await apiRequest("GET", `/api/chauffeurs/${c.id}`);
        const data = await res.json();
        setChauffeur(data);
      } else if (user) {
        const res = await apiRequest("GET", `/api/chauffeurs/user/${user.id}`);
        const data = await res.json();
        setChauffeur(data);
      }
    } catch {}
  }

  async function handleLogout() {
    await logout();
    router.replace("/");
  }

  return (
    <ScrollView
      style={[styles.container, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 16) }]}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.title}>Settings</Text>

      <View style={styles.profileCard}>
        <View style={styles.avatar}>
          <Ionicons name="person" size={28} color={Colors.white} />
        </View>
        <Text style={styles.profileName}>{user?.name || "Driver"}</Text>
        <Text style={styles.profileRole}>Professional Driver</Text>
      </View>

      <View style={styles.menuGroup}>
        <Pressable style={({ pressed }) => [styles.menuItem, pressed && { opacity: 0.7 }]} onPress={() => setShowVehicle(true)}>
          <View style={styles.menuIconCircle}>
            <Ionicons name="car-outline" size={20} color={Colors.white} />
          </View>
          <Text style={styles.menuText}>Vehicle Details</Text>
          <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
        </Pressable>

        <Pressable style={({ pressed }) => [styles.menuItem, pressed && { opacity: 0.7 }]} onPress={() => setShowDocuments(true)}>
          <View style={styles.menuIconCircle}>
            <Ionicons name="document-text-outline" size={20} color={Colors.white} />
          </View>
          <Text style={styles.menuText}>Documents</Text>
          <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
        </Pressable>

        <Pressable style={({ pressed }) => [styles.menuItem, pressed && { opacity: 0.7 }]} onPress={() => setShowNotifications(true)}>
          <View style={styles.menuIconCircle}>
            <Ionicons name="notifications-outline" size={20} color={Colors.white} />
          </View>
          <Text style={styles.menuText}>Notifications</Text>
          <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
        </Pressable>

        <Pressable style={({ pressed }) => [styles.menuItem, pressed && { opacity: 0.7 }]} onPress={() => setShowHelp(true)}>
          <View style={styles.menuIconCircle}>
            <Ionicons name="help-circle-outline" size={20} color={Colors.white} />
          </View>
          <Text style={styles.menuText}>Help & Support</Text>
          <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
        </Pressable>
      </View>

      <View style={styles.menuGroup}>
        <Pressable
          style={({ pressed }) => [styles.menuItem, pressed && { opacity: 0.7 }]}
          onPress={() => router.replace("/role-select")}
        >
          <View style={styles.menuIconCircle}>
            <Ionicons name="swap-horizontal" size={20} color={Colors.white} />
          </View>
          <Text style={styles.menuText}>Switch to Client Mode</Text>
          <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
        </Pressable>
      </View>

      <Pressable
        style={({ pressed }) => [styles.logoutBtn, pressed && { opacity: 0.8 }]}
        onPress={handleLogout}
      >
        <Ionicons name="log-out-outline" size={20} color={Colors.error} />
        <Text style={styles.logoutText}>Sign Out</Text>
      </Pressable>

      <View style={styles.brandFooter}>
        <Ionicons name="car-sport" size={14} color={Colors.textMuted} />
        <Text style={styles.brandText}>A2B LIFT v1.0</Text>
      </View>

      <View style={{ height: 100 }} />

      <Modal visible={showVehicle} transparent animationType="slide" onRequestClose={() => setShowVehicle(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowVehicle(false)}>
          <View style={[styles.modalSheet, { paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 16) }]} onStartShouldSetResponder={() => true}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Vehicle Details</Text>
            {chauffeur ? (
              <View style={styles.detailsList}>
                {chauffeur.carMake && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Make</Text>
                    <Text style={styles.detailValue}>{chauffeur.carMake}</Text>
                  </View>
                )}
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Model</Text>
                  <Text style={styles.detailValue}>{chauffeur.vehicleModel}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Plate Number</Text>
                  <Text style={styles.detailValue}>{chauffeur.plateNumber}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Category</Text>
                  <Text style={styles.detailValue}>{chauffeur.vehicleType}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Color</Text>
                  <Text style={styles.detailValue}>{chauffeur.carColor}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Passengers</Text>
                  <Text style={styles.detailValue}>{chauffeur.passengerCapacity}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Luggage</Text>
                  <Text style={styles.detailValue}>{chauffeur.luggageCapacity}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Status</Text>
                  <View style={[styles.statusChip, chauffeur.isApproved ? styles.statusApproved : styles.statusPending]}>
                    <Text style={styles.statusChipText}>{chauffeur.isApproved ? "Approved" : "Pending Approval"}</Text>
                  </View>
                </View>
              </View>
            ) : (
              <Text style={styles.noDataText}>Loading vehicle information...</Text>
            )}
          </View>
        </Pressable>
      </Modal>

      <Modal visible={showDocuments} transparent animationType="slide" onRequestClose={() => setShowDocuments(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowDocuments(false)}>
          <View style={[styles.modalSheet, { paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 16) }]} onStartShouldSetResponder={() => true}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Documents</Text>
            <View style={styles.docItem}>
              <View style={styles.docIconCircle}>
                <Ionicons name="id-card" size={20} color={Colors.white} />
              </View>
              <View style={styles.docInfo}>
                <Text style={styles.docName}>Driver's License</Text>
                <Text style={styles.docStatus}>Required for verification</Text>
              </View>
              <View style={[styles.docBadge, chauffeur?.isApproved ? styles.docVerified : styles.docPendingBadge]}>
                <Text style={styles.docBadgeText}>{chauffeur?.isApproved ? "Verified" : "Pending"}</Text>
              </View>
            </View>
            <View style={styles.docItem}>
              <View style={styles.docIconCircle}>
                <Ionicons name="car" size={20} color={Colors.white} />
              </View>
              <View style={styles.docInfo}>
                <Text style={styles.docName}>Vehicle Registration</Text>
                <Text style={styles.docStatus}>Required for verification</Text>
              </View>
              <View style={[styles.docBadge, chauffeur?.isApproved ? styles.docVerified : styles.docPendingBadge]}>
                <Text style={styles.docBadgeText}>{chauffeur?.isApproved ? "Verified" : "Pending"}</Text>
              </View>
            </View>
            <View style={styles.docItem}>
              <View style={styles.docIconCircle}>
                <Ionicons name="shield-checkmark" size={20} color={Colors.white} />
              </View>
              <View style={styles.docInfo}>
                <Text style={styles.docName}>Insurance</Text>
                <Text style={styles.docStatus}>Required for verification</Text>
              </View>
              <View style={[styles.docBadge, chauffeur?.isApproved ? styles.docVerified : styles.docPendingBadge]}>
                <Text style={styles.docBadgeText}>{chauffeur?.isApproved ? "Verified" : "Pending"}</Text>
              </View>
            </View>
            <Text style={styles.docNote}>
              Documents are reviewed by our admin team. Your driver status will be updated once all documents are verified.
            </Text>
          </View>
        </Pressable>
      </Modal>

      <Modal visible={showNotifications} transparent animationType="slide" onRequestClose={() => setShowNotifications(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowNotifications(false)}>
          <View style={[styles.modalSheet, { paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 16) }]} onStartShouldSetResponder={() => true}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Notification Preferences</Text>
            <View style={styles.notifItem}>
              <View style={styles.notifInfo}>
                <Text style={styles.notifName}>Ride Requests</Text>
                <Text style={styles.notifDesc}>Get notified about new ride requests</Text>
              </View>
              <View style={styles.notifToggleOn}>
                <Text style={styles.notifToggleText}>ON</Text>
              </View>
            </View>
            <View style={styles.notifItem}>
              <View style={styles.notifInfo}>
                <Text style={styles.notifName}>Earnings Updates</Text>
                <Text style={styles.notifDesc}>Notifications about completed trips and payments</Text>
              </View>
              <View style={styles.notifToggleOn}>
                <Text style={styles.notifToggleText}>ON</Text>
              </View>
            </View>
            <View style={styles.notifItem}>
              <View style={styles.notifInfo}>
                <Text style={styles.notifName}>Withdrawal Status</Text>
                <Text style={styles.notifDesc}>Updates on your withdrawal requests</Text>
              </View>
              <View style={styles.notifToggleOn}>
                <Text style={styles.notifToggleText}>ON</Text>
              </View>
            </View>
            <View style={styles.notifItem}>
              <View style={styles.notifInfo}>
                <Text style={styles.notifName}>System Announcements</Text>
                <Text style={styles.notifDesc}>Important updates from A2B LIFT</Text>
              </View>
              <View style={styles.notifToggleOn}>
                <Text style={styles.notifToggleText}>ON</Text>
              </View>
            </View>
          </View>
        </Pressable>
      </Modal>

      <Modal visible={showHelp} transparent animationType="slide" onRequestClose={() => setShowHelp(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowHelp(false)}>
          <View style={[styles.modalSheet, { paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 16) }]} onStartShouldSetResponder={() => true}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Help & Support</Text>
            <View style={styles.helpCard}>
              <Ionicons name="headset" size={24} color={Colors.white} />
              <View style={styles.helpInfo}>
                <Text style={styles.helpTitle}>Contact Support</Text>
                <Text style={styles.helpDesc}>Our support team is available 24/7</Text>
              </View>
            </View>
            <View style={styles.faqItem}>
              <Text style={styles.faqQ}>How do I go online?</Text>
              <Text style={styles.faqA}>Toggle the online switch on your dashboard. You must be approved by admin before you can go online.</Text>
            </View>
            <View style={styles.faqItem}>
              <Text style={styles.faqQ}>How are earnings calculated?</Text>
              <Text style={styles.faqA}>You receive 80% of each ride fare. A2B LIFT retains 20% as a commission. Earnings are credited after each completed trip.</Text>
            </View>
            <View style={styles.faqItem}>
              <Text style={styles.faqQ}>How do withdrawals work?</Text>
              <Text style={styles.faqA}>Request a withdrawal from the Earnings tab. Withdrawals are reviewed by admin and processed within 24-48 hours.</Text>
            </View>
            <View style={styles.faqItem}>
              <Text style={styles.faqQ}>What if a passenger cancels?</Text>
              <Text style={styles.faqA}>If a passenger cancels after you've been assigned, the ride status updates automatically. No charges apply.</Text>
            </View>
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
  profileCard: { alignItems: "center", backgroundColor: Colors.card, borderRadius: 20, padding: 28, gap: 6, borderWidth: 1, borderColor: Colors.border, marginBottom: 24 },
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: Colors.accent, alignItems: "center", justifyContent: "center", marginBottom: 6 },
  profileName: { fontSize: 20, fontFamily: "Inter_700Bold", color: Colors.white },
  profileRole: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
  menuGroup: { backgroundColor: Colors.card, borderRadius: 14, overflow: "hidden", borderWidth: 1, borderColor: Colors.border, marginBottom: 16 },
  menuItem: { flexDirection: "row", alignItems: "center", padding: 16, gap: 14, borderBottomWidth: 1, borderBottomColor: Colors.border },
  menuIconCircle: { width: 36, height: 36, borderRadius: 10, backgroundColor: Colors.accent, alignItems: "center", justifyContent: "center" },
  menuText: { flex: 1, fontSize: 15, fontFamily: "Inter_500Medium", color: Colors.white },
  logoutBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 16, marginTop: 8 },
  logoutText: { fontSize: 15, fontFamily: "Inter_500Medium", color: Colors.error },
  brandFooter: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 16 },
  brandText: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textMuted },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  modalSheet: { backgroundColor: Colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, gap: 14, maxHeight: "80%" },
  sheetHandle: { width: 36, height: 4, backgroundColor: Colors.accent, borderRadius: 2, alignSelf: "center" },
  sheetTitle: { fontSize: 20, fontFamily: "Inter_600SemiBold", color: Colors.white },
  detailsList: { gap: 0 },
  detailRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border },
  detailLabel: { fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
  detailValue: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.white },
  statusChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  statusApproved: { backgroundColor: "rgba(76,175,80,0.2)" },
  statusPending: { backgroundColor: "rgba(255,183,77,0.2)" },
  statusChipText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: Colors.white },
  noDataText: { fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.textMuted, textAlign: "center", padding: 20 },
  docItem: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: Colors.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: Colors.border },
  docIconCircle: { width: 40, height: 40, borderRadius: 10, backgroundColor: Colors.accent, alignItems: "center", justifyContent: "center" },
  docInfo: { flex: 1, gap: 2 },
  docName: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.white },
  docStatus: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textMuted },
  docBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  docVerified: { backgroundColor: "rgba(76,175,80,0.2)" },
  docPendingBadge: { backgroundColor: "rgba(255,183,77,0.2)" },
  docBadgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: Colors.white },
  docNote: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textMuted, textAlign: "center", paddingTop: 4 },
  notifItem: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: Colors.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: Colors.border },
  notifInfo: { flex: 1, gap: 2 },
  notifName: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.white },
  notifDesc: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textMuted },
  notifToggleOn: { backgroundColor: "rgba(76,175,80,0.3)", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  notifToggleText: { fontSize: 11, fontFamily: "Inter_700Bold", color: Colors.success },
  helpCard: { flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: Colors.surface, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: Colors.border },
  helpInfo: { flex: 1, gap: 2 },
  helpTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: Colors.white },
  helpDesc: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textMuted },
  faqItem: { backgroundColor: Colors.surface, borderRadius: 12, padding: 14, gap: 6, borderWidth: 1, borderColor: Colors.border },
  faqQ: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.white },
  faqA: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textSecondary, lineHeight: 18 },
});

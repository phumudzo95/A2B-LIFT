import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  ScrollView,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Location from "expo-location";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "@/lib/auth-context";
import { apiRequest } from "@/lib/query-client";
import { useSocket } from "@/lib/socket-context";
import Colors from "@/constants/colors";

export default function ChauffeurDashboard() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { on, off, emit } = useSocket();

  const [chauffeur, setChauffeur] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(false);
  const [incomingRide, setIncomingRide] = useState<any>(null);
  const [currentRide, setCurrentRide] = useState<any>(null);
  const [locationInterval, setLocationIntervalId] = useState<any>(null);

  useEffect(() => {
    loadChauffeur();
  }, []);

  useEffect(() => {
    const handleNewRide = (ride: any) => {
      if (isOnline && chauffeur?.isApproved && !currentRide) {
        setIncomingRide(ride);
        if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      }
    };

    on("ride:new", handleNewRide);
    return () => { off("ride:new", handleNewRide); };
  }, [isOnline, chauffeur, currentRide]);

  useEffect(() => {
    if (isOnline && chauffeur) {
      startLocationUpdates();
    } else {
      stopLocationUpdates();
    }
    return () => stopLocationUpdates();
  }, [isOnline, chauffeur]);

  async function loadChauffeur() {
    if (!user) return;
    try {
      const stored = await AsyncStorage.getItem("a2b_chauffeur");
      if (stored) {
        const c = JSON.parse(stored);
        setChauffeur(c);
        setIsOnline(c.isOnline || false);
        setLoading(false);
        refreshChauffeur(c.id);
        return;
      }
      const res = await apiRequest("GET", `/api/chauffeurs/user/${user.id}`);
      const c = await res.json();
      setChauffeur(c);
      setIsOnline(c.isOnline || false);
      await AsyncStorage.setItem("a2b_chauffeur", JSON.stringify(c));
    } catch {
      router.replace("/chauffeur-register");
    } finally {
      setLoading(false);
    }
  }

  async function refreshChauffeur(id: string) {
    try {
      const res = await apiRequest("GET", `/api/chauffeurs/${id}`);
      const c = await res.json();
      setChauffeur(c);
      setIsOnline(c.isOnline || false);
      await AsyncStorage.setItem("a2b_chauffeur", JSON.stringify(c));
    } catch {}
  }

  async function toggleOnline() {
    if (!chauffeur) return;
    try {
      const res = await apiRequest("PUT", `/api/chauffeurs/${chauffeur.id}/toggle-online`);
      const updated = await res.json();
      setChauffeur(updated);
      setIsOnline(updated.isOnline);
      await AsyncStorage.setItem("a2b_chauffeur", JSON.stringify(updated));
      if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {
      Alert.alert("Error", "Failed to update status");
    }
  }

  async function startLocationUpdates() {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;
      const interval = setInterval(async () => {
        try {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
          emit("chauffeur:location", {
            chauffeurId: chauffeur?.id,
            lat: loc.coords.latitude,
            lng: loc.coords.longitude,
          });
        } catch {}
      }, 3000);
      setLocationIntervalId(interval);
    } catch {}
  }

  function stopLocationUpdates() {
    if (locationInterval) {
      clearInterval(locationInterval);
      setLocationIntervalId(null);
    }
  }

  async function acceptRide() {
    if (!incomingRide || !chauffeur) return;
    try {
      const res = await apiRequest("PUT", `/api/rides/${incomingRide.id}/accept`, {
        chauffeurId: chauffeur.id,
      });
      const ride = await res.json();
      setCurrentRide(ride);
      setIncomingRide(null);
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert("Error", "Ride may have been taken by another chauffeur");
      setIncomingRide(null);
    }
  }

  function declineRide() {
    setIncomingRide(null);
  }

  async function updateRideStatus(status: string) {
    if (!currentRide) return;
    try {
      const res = await apiRequest("PUT", `/api/rides/${currentRide.id}/status`, { status });
      const ride = await res.json();
      if (status === "trip_completed") {
        setCurrentRide(null);
        if (chauffeur) refreshChauffeur(chauffeur.id);
        if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        setCurrentRide(ride);
      }
    } catch {
      Alert.alert("Error", "Failed to update ride status");
    }
  }

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={Colors.white} />
      </View>
    );
  }

  if (!chauffeur) return null;

  return (
    <ScrollView
      style={[styles.container, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 0) }]}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={false}
          onRefresh={() => chauffeur && refreshChauffeur(chauffeur.id)}
          tintColor={Colors.white}
        />
      }
    >
      <View style={styles.header}>
        <View>
          <Text style={styles.brandName}>A2B LIFT</Text>
          <Text style={styles.brandSlogan}>Premium Ride Experience</Text>
        </View>
        <View style={styles.avatarCircle}>
          <Ionicons name="person" size={18} color={Colors.white} />
        </View>
      </View>

      {!chauffeur.isApproved && (
        <View style={styles.pendingCard}>
          <Ionicons name="hourglass" size={24} color={Colors.warning} />
          <View style={styles.pendingInfo}>
            <Text style={styles.pendingTitle}>Pending Approval</Text>
            <Text style={styles.pendingDesc}>Your registration is under review</Text>
          </View>
        </View>
      )}

      <Pressable
        style={({ pressed }) => [
          styles.toggleCard,
          isOnline ? styles.toggleOnline : styles.toggleOffline,
          pressed && { opacity: 0.9 },
        ]}
        onPress={toggleOnline}
        disabled={!chauffeur.isApproved}
      >
        <View style={[styles.toggleDot, { backgroundColor: isOnline ? Colors.success : Colors.offline }]} />
        <View style={styles.toggleInfo}>
          <Text style={styles.toggleStatus}>{isOnline ? "Online" : "Offline"}</Text>
          <Text style={styles.toggleHint}>{isOnline ? "Receiving ride requests" : "Go online to start earning"}</Text>
        </View>
        <View style={[styles.toggleSwitch, isOnline && styles.toggleSwitchOn]}>
          <View style={[styles.toggleKnob, isOnline && styles.toggleKnobOn]} />
        </View>
      </Pressable>

      {incomingRide && (
        <View style={styles.incomingCard}>
          <View style={styles.incomingHeader}>
            <Ionicons name="notifications" size={20} color={Colors.warning} />
            <Text style={styles.incomingTitle}>New Ride Request</Text>
          </View>
          <View style={styles.incomingDetails}>
            <View style={styles.incomingRow}>
              <View style={styles.dotGreen} />
              <Text style={styles.incomingAddress} numberOfLines={1}>{incomingRide.pickupAddress || "Pickup location"}</Text>
            </View>
            <View style={styles.incomingRow}>
              <View style={styles.dotRed} />
              <Text style={styles.incomingAddress} numberOfLines={1}>{incomingRide.dropoffAddress || "Dropoff location"}</Text>
            </View>
          </View>
          {incomingRide.price && (
            <Text style={styles.incomingPrice}>Estimated: R {incomingRide.price}</Text>
          )}
          <View style={styles.incomingActions}>
            <Pressable style={styles.declineBtn} onPress={declineRide}>
              <Ionicons name="close" size={22} color={Colors.error} />
            </Pressable>
            <Pressable style={({ pressed }) => [styles.acceptBtn, pressed && { opacity: 0.9 }]} onPress={acceptRide}>
              <Ionicons name="checkmark" size={22} color={Colors.primary} />
              <Text style={styles.acceptBtnText}>Accept</Text>
            </Pressable>
          </View>
        </View>
      )}

      {currentRide && (
        <View style={styles.currentRideCard}>
          <View style={styles.currentRideHeader}>
            <View style={[styles.statusDot, { backgroundColor: Colors.success }]} />
            <Text style={styles.currentRideTitle}>
              {currentRide.status === "chauffeur_assigned" ? "Navigate to Pickup" :
               currentRide.status === "chauffeur_arriving" ? "Arriving at Pickup" :
               currentRide.status === "trip_started" ? "Trip in Progress" : "Active Ride"}
            </Text>
          </View>
          <View style={styles.currentRideRoute}>
            <View style={styles.incomingRow}>
              <View style={styles.dotGreen} />
              <Text style={styles.incomingAddress} numberOfLines={1}>{currentRide.pickupAddress || "Pickup"}</Text>
            </View>
            <View style={styles.incomingRow}>
              <View style={styles.dotRed} />
              <Text style={styles.incomingAddress} numberOfLines={1}>{currentRide.dropoffAddress || "Dropoff"}</Text>
            </View>
          </View>
          {currentRide.price && (
            <Text style={styles.currentRidePrice}>R {currentRide.price}</Text>
          )}
          <View style={styles.rideActionRow}>
            {currentRide.status === "chauffeur_assigned" && (
              <Pressable style={({ pressed }) => [styles.rideActionBtn, pressed && { opacity: 0.9 }]} onPress={() => updateRideStatus("chauffeur_arriving")}>
                <Text style={styles.rideActionBtnText}>Arriving at Pickup</Text>
              </Pressable>
            )}
            {currentRide.status === "chauffeur_arriving" && (
              <Pressable style={({ pressed }) => [styles.rideActionBtn, pressed && { opacity: 0.9 }]} onPress={() => updateRideStatus("trip_started")}>
                <Text style={styles.rideActionBtnText}>Start Trip</Text>
              </Pressable>
            )}
            {currentRide.status === "trip_started" && (
              <Pressable style={({ pressed }) => [styles.rideActionBtn, styles.completeBtn, pressed && { opacity: 0.9 }]} onPress={() => updateRideStatus("trip_completed")}>
                <Text style={styles.rideActionBtnText}>Complete Trip</Text>
              </Pressable>
            )}
          </View>
        </View>
      )}

      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>R {(chauffeur.earningsTotal || 0).toFixed(0)}</Text>
          <Text style={styles.statLabel}>Today's Earnings</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{chauffeur.rating || "5.0"}</Text>
          <Text style={styles.statLabel}>Rating</Text>
        </View>
      </View>

      <View style={styles.vehicleCard}>
        <Ionicons name="car-sport" size={24} color={Colors.white} />
        <View style={styles.vehicleInfo}>
          <Text style={styles.vehicleName}>{chauffeur.vehicleModel}</Text>
          <Text style={styles.vehiclePlate}>{chauffeur.plateNumber} | {chauffeur.carColor}</Text>
        </View>
        <Text style={styles.vehicleType}>{chauffeur.vehicleType}</Text>
      </View>

      <View style={{ height: 120 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.primary, paddingHorizontal: 20 },
  center: { alignItems: "center", justifyContent: "center" },
  scrollContent: { paddingBottom: 40 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 16 },
  brandName: { fontSize: 18, fontFamily: "Inter_700Bold", color: Colors.white, letterSpacing: 2 },
  brandSlogan: { fontSize: 10, fontFamily: "Inter_400Regular", color: Colors.textMuted, letterSpacing: 1 },
  avatarCircle: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.accent, alignItems: "center", justifyContent: "center" },
  pendingCard: { flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: "rgba(255,183,77,0.1)", borderRadius: 14, padding: 16, borderWidth: 1, borderColor: "rgba(255,183,77,0.2)", marginBottom: 16 },
  pendingInfo: { flex: 1, gap: 2 },
  pendingTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: Colors.warning },
  pendingDesc: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textMuted },
  toggleCard: { flexDirection: "row", alignItems: "center", borderRadius: 16, padding: 20, gap: 14, marginBottom: 20 },
  toggleOnline: { backgroundColor: "rgba(76,175,80,0.1)", borderWidth: 1, borderColor: "rgba(76,175,80,0.3)" },
  toggleOffline: { backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border },
  toggleDot: { width: 12, height: 12, borderRadius: 6 },
  toggleInfo: { flex: 1, gap: 2 },
  toggleStatus: { fontSize: 18, fontFamily: "Inter_700Bold", color: Colors.white },
  toggleHint: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textMuted },
  toggleSwitch: { width: 52, height: 30, borderRadius: 15, backgroundColor: Colors.accent, justifyContent: "center", paddingHorizontal: 3 },
  toggleSwitchOn: { backgroundColor: Colors.success },
  toggleKnob: { width: 24, height: 24, borderRadius: 12, backgroundColor: Colors.white },
  toggleKnobOn: { alignSelf: "flex-end" as const },
  incomingCard: { backgroundColor: Colors.card, borderRadius: 16, padding: 20, gap: 14, borderWidth: 1, borderColor: Colors.warning, marginBottom: 20 },
  incomingHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  incomingTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold", color: Colors.white },
  incomingDetails: { gap: 8 },
  incomingRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  dotGreen: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.success },
  dotRed: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.error },
  incomingAddress: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
  incomingPrice: { fontSize: 16, fontFamily: "Inter_700Bold", color: Colors.white },
  incomingActions: { flexDirection: "row", gap: 12 },
  declineBtn: { width: 52, height: 52, borderRadius: 14, backgroundColor: "rgba(255,77,77,0.1)", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(255,77,77,0.2)" },
  acceptBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: Colors.white, borderRadius: 14, paddingVertical: 14 },
  acceptBtnText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: Colors.primary },
  currentRideCard: { backgroundColor: Colors.card, borderRadius: 16, padding: 20, gap: 14, borderWidth: 1, borderColor: Colors.success, marginBottom: 20 },
  currentRideHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  currentRideTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold", color: Colors.white },
  currentRideRoute: { gap: 8 },
  currentRidePrice: { fontSize: 20, fontFamily: "Inter_700Bold", color: Colors.white },
  rideActionRow: { gap: 8 },
  rideActionBtn: { backgroundColor: Colors.white, paddingVertical: 14, borderRadius: 14, alignItems: "center" },
  completeBtn: { backgroundColor: Colors.success },
  rideActionBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: Colors.primary },
  statsRow: { flexDirection: "row", gap: 12, marginBottom: 16 },
  statCard: { flex: 1, backgroundColor: Colors.card, borderRadius: 14, padding: 20, alignItems: "center", gap: 4, borderWidth: 1, borderColor: Colors.border },
  statValue: { fontSize: 24, fontFamily: "Inter_700Bold", color: Colors.white },
  statLabel: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textMuted },
  vehicleCard: { flexDirection: "row", alignItems: "center", backgroundColor: Colors.card, borderRadius: 14, padding: 16, gap: 14, borderWidth: 1, borderColor: Colors.border },
  vehicleInfo: { flex: 1, gap: 2 },
  vehicleName: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: Colors.white },
  vehiclePlate: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textMuted },
  vehicleType: { fontSize: 11, fontFamily: "Inter_500Medium", color: Colors.textSecondary, backgroundColor: Colors.surface, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
});

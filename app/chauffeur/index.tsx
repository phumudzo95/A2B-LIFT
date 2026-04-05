import React, { useState, useEffect, useCallback, useRef } from "react";
import * as Notifications from "expo-notifications";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Linking,
  Animated,
  Dimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Location from "expo-location";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Audio } from "expo-av";
import { useAuth } from "@/lib/auth-context";
import { apiRequest } from "@/lib/query-client";
import { useSocket } from "@/lib/socket-context";
import Colors from "@/constants/colors";
import A2BMap from "@/components/A2BMap";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

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
  const [myLocation, setMyLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [routePolyline, setRoutePolyline] = useState<string | null>(null);
  const [showNavModal, setShowNavModal] = useState(false);
  const [navSteps, setNavSteps] = useState<Array<{ instruction: string; distance: string; maneuver: string; endLat: number; endLng: number }>>([]);
  const [currentStepIdx, setCurrentStepIdx] = useState(0);
  const [rideEta, setRideEta] = useState<{ distanceText: string; durationText: string; distanceKm: number; durationMin: number } | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [todayEarnings, setTodayEarnings] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);

  const soundRef = useRef<Audio.Sound | null>(null);
  const seenRideIdRef = useRef<string | null>(null);
  const menuAnim = useRef(new Animated.Value(0)).current;
  const incomingSlide = useRef(new Animated.Value(300)).current;

  // ─── Sound ───────────────────────────────────────────────────────────────
  async function playTripAlert() {
    try {
      if (Platform.OS === "web") return;
      await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
      if (soundRef.current) {
        await soundRef.current.replayAsync();
      } else {
        const { sound } = await Audio.Sound.createAsync(
          require("../../assets/trip-alert.mp3"),
          { shouldPlay: true, volume: 1.0 }
        );
        soundRef.current = sound;
      }
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {}
  }

  useEffect(() => { return () => { soundRef.current?.unloadAsync(); }; }, []);

  // ─── Menu animation ───────────────────────────────────────────────────────
  function toggleMenu() {
    const toValue = menuOpen ? 0 : 1;
    Animated.spring(menuAnim, { toValue, useNativeDriver: true, tension: 80, friction: 10 }).start();
    setMenuOpen(!menuOpen);
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  function closeMenu() {
    Animated.timing(menuAnim, { toValue: 0, useNativeDriver: true, duration: 200 }).start();
    setMenuOpen(false);
  }

  // ─── Incoming ride slide-in ───────────────────────────────────────────────
  useEffect(() => {
    if (incomingRide) {
      Animated.spring(incomingSlide, { toValue: 0, useNativeDriver: true, tension: 70, friction: 10 }).start();
    } else {
      Animated.timing(incomingSlide, { toValue: 300, useNativeDriver: true, duration: 250 }).start();
    }
  }, [incomingRide]);

  // ─── Unread notifications ────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    async function fetchUnread() {
      try {
        const res = await apiRequest("GET", `/api/notifications/user/${user!.id}`);
        const data = await res.json();
        if (Array.isArray(data)) setUnreadCount(data.filter((n: any) => !n.isRead).length);
      } catch {}
    }
    fetchUnread();
    const interval = setInterval(fetchUnread, 30000);
    return () => clearInterval(interval);
  }, [user]);

  // ─── Socket: incoming ride ────────────────────────────────────────────────
  useEffect(() => {
    const handleNewRide = (ride: any) => {
      if (isOnline && chauffeur?.isApproved && !currentRide) {
        setIncomingRide(ride);
        playTripAlert();
      }
    };
    on("ride:new", handleNewRide);
    return () => { off("ride:new", handleNewRide); };
  }, [isOnline, chauffeur, currentRide]);

  // ─── Socket: rider cancellation ───────────────────────────────────────────
  useEffect(() => {
    const handleRideUpdate = (ride: any) => {
      setCurrentRide((prev: any) => {
        if (prev && ride.id === prev.id && ride.status === "cancelled") {
          setRoutePolyline(null);
          setRideEta(null);
          setShowNavModal(false);
          setNavSteps([]);
          AsyncStorage.removeItem("a2b_current_ride").catch(() => {});
          Alert.alert("Ride Cancelled", "The rider has cancelled this trip.");
          return null;
        }
        return prev;
      });
    };
    on("ride:statusUpdate", handleRideUpdate);
    return () => off("ride:statusUpdate", handleRideUpdate);
  }, []);

  // ─── Persist current ride ─────────────────────────────────────────────────
  useEffect(() => {
    if (currentRide) {
      AsyncStorage.setItem("a2b_current_ride", JSON.stringify(currentRide)).catch(() => {});
    } else {
      AsyncStorage.removeItem("a2b_current_ride").catch(() => {});
    }
  }, [currentRide]);

  // ─── Location tracking ────────────────────────────────────────────────────
  useEffect(() => {
    if (isOnline && chauffeur) {
      startLocationUpdates();
    } else {
      stopLocationUpdates();
    }
    return () => stopLocationUpdates();
  }, [isOnline, chauffeur]);

  // ─── Poll approval status ─────────────────────────────────────────────────
  useEffect(() => {
    if (!chauffeur?.id) return;
    const interval = setInterval(() => refreshChauffeur(chauffeur.id), 10000);
    return () => clearInterval(interval);
  }, [chauffeur?.id]);

  // ─── Register chauffeur on socket ─────────────────────────────────────────
  useEffect(() => {
    if (!chauffeur?.id) return;
    emit("chauffeur:register", { chauffeurId: chauffeur.id });
  }, [chauffeur?.id]);

  // ─── Push notifications ───────────────────────────────────────────────────
  useEffect(() => {
    if (!chauffeur?.id || Platform.OS === "web") return;
    (async () => {
      try {
        if (Platform.OS === "android") {
          await Notifications.setNotificationChannelAsync("ride-alerts", {
            name: "Ride Alerts",
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 250, 250],
            sound: "default",
            bypassDnd: true,
            lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
          });
        }
        const { status } = await Notifications.requestPermissionsAsync();
        if (status !== "granted") return;
        const tokenData = await Notifications.getExpoPushTokenAsync();
        if (tokenData?.data) {
          await apiRequest("PUT", `/api/chauffeurs/${chauffeur.id}/push-token`, { pushToken: tokenData.data });
        }
      } catch (e: any) {
        console.log("[push] Registration:", e.message);
      }
    })();
  }, [chauffeur?.id]);

  useEffect(() => {
    if (Platform.OS === "web") return;
    Notifications.setNotificationHandler({
      handleNotification: async () => ({ shouldShowAlert: true, shouldPlaySound: true, shouldSetBadge: false }),
    });
    const sub = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data as any;
      if (data?.type === "ride:new") setIsOnline(true);
    });
    return () => sub.remove();
  }, []);

  // ─── Polling fallback ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOnline || !chauffeur?.isApproved || !chauffeur?.id) return;
    const poll = setInterval(async () => {
      if (currentRide || incomingRide) return;
      try {
        const res = await apiRequest("GET", `/api/rides/chauffeur-pending/${chauffeur.id}`);
        if (!res.ok) return;
        const ride = await res.json();
        if (ride?.id && ride.id !== seenRideIdRef.current) {
          seenRideIdRef.current = ride.id;
          setIncomingRide(ride);
          playTripAlert();
        }
      } catch {}
    }, 6000);
    return () => clearInterval(poll);
  }, [isOnline, chauffeur?.isApproved, chauffeur?.id, currentRide, incomingRide]);

  // ─── Auto-advance nav step ────────────────────────────────────────────────
  useEffect(() => {
    if (!myLocation || navSteps.length === 0) return;
    const step = navSteps[currentStepIdx];
    if (!step?.endLat || !step?.endLng) return;
    const R = 6371000;
    const dLat = (step.endLat - myLocation.lat) * Math.PI / 180;
    const dLng = (step.endLng - myLocation.lng) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(myLocation.lat * Math.PI / 180) * Math.cos(step.endLat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    if (dist < 30 && currentStepIdx < navSteps.length - 1) setCurrentStepIdx(i => i + 1);
  }, [myLocation?.lat, myLocation?.lng]);

  // ─── Data ─────────────────────────────────────────────────────────────────
  async function restoreActiveRide() {
    try {
      const saved = await AsyncStorage.getItem("a2b_current_ride");
      if (!saved) return;
      const ride = JSON.parse(saved);
      const rideRes = await apiRequest("GET", `/api/rides/${ride.id}`);
      if (!rideRes.ok) { await AsyncStorage.removeItem("a2b_current_ride"); return; }
      const freshRide = await rideRes.json();
      if (freshRide.status === "trip_completed" || freshRide.status === "cancelled") {
        await AsyncStorage.removeItem("a2b_current_ride");
      } else {
        setCurrentRide(freshRide);
      }
    } catch {}
  }

  async function loadChauffeur() {
    if (!user) return;
    try {
      const stored = await AsyncStorage.getItem("a2b_chauffeur");
      if (stored) {
        const cached = JSON.parse(stored);
        setChauffeur(cached);
        setIsOnline(cached.isOnline || false);
        setLoading(false);
        refreshChauffeur(cached.id);
        restoreActiveRide();
        return;
      }
      const res = await apiRequest("GET", `/api/chauffeurs/user/${user.id}`);
      if (!res.ok) throw new Error("not found");
      const c = await res.json();
      setChauffeur(c);
      setIsOnline(c.isOnline || false);
      await AsyncStorage.setItem("a2b_chauffeur", JSON.stringify(c));
      restoreActiveRide();
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
      if (typeof c.todayEarnings === "number") setTodayEarnings(c.todayEarnings);
      await AsyncStorage.setItem("a2b_chauffeur", JSON.stringify(c));
    } catch {}
  }

  useEffect(() => { loadChauffeur(); }, []);

  // ─── Actions ──────────────────────────────────────────────────────────────
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
    closeMenu();
  }

  const JHB_FALLBACK = { lat: -26.2041, lng: 28.0473 };

  async function startLocationUpdates() {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") { setMyLocation(JHB_FALLBACK); return; }
      let initialLoc: { lat: number; lng: number } | null = null;
      try {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        initialLoc = { lat: loc.coords.latitude, lng: loc.coords.longitude };
      } catch {
        try {
          const last = await Location.getLastKnownPositionAsync();
          if (last) initialLoc = { lat: last.coords.latitude, lng: last.coords.longitude };
        } catch {}
      }
      setMyLocation(initialLoc ?? JHB_FALLBACK);
      const interval = setInterval(async () => {
        try {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
          const next = { lat: loc.coords.latitude, lng: loc.coords.longitude };
          setMyLocation(next);
          emit("chauffeur:location", { chauffeurId: chauffeur?.id, lat: next.lat, lng: next.lng });
        } catch {}
      }, 5000);
      setLocationIntervalId(interval);
    } catch { setMyLocation(JHB_FALLBACK); }
  }

  function stopLocationUpdates() {
    if (locationInterval) { clearInterval(locationInterval); setLocationIntervalId(null); }
  }

  async function fetchDriverRoute(destLat: number, destLng: number) {
    if (!myLocation) return;
    try {
      const res = await apiRequest("GET",
        `/api/directions?originLat=${myLocation.lat}&originLng=${myLocation.lng}&destLat=${destLat}&destLng=${destLng}`
      );
      const data = await res.json();
      if (data.polyline) setRoutePolyline(data.polyline);
      if (data.distanceText && data.durationText) {
        setRideEta({ distanceText: data.distanceText, durationText: data.durationText, distanceKm: data.distanceKm, durationMin: data.durationMin });
      }
      if (Array.isArray(data.steps) && data.steps.length > 0) {
        setNavSteps(data.steps);
        setCurrentStepIdx(0);
      }
    } catch {}
  }

  async function acceptRide() {
    if (!incomingRide || !chauffeur) return;
    try {
      const res = await apiRequest("PUT", `/api/rides/${incomingRide.id}/accept`, { chauffeurId: chauffeur.id });
      if (res.status === 409) {
        Alert.alert("Too Late", "This ride was already taken by another driver.");
        setIncomingRide(null);
        return;
      }
      const ride = await res.json();
      setCurrentRide(ride);
      setIncomingRide(null);
      if (ride.pickupLat && ride.pickupLng) fetchDriverRoute(parseFloat(ride.pickupLat), parseFloat(ride.pickupLng));
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowNavModal(true);
    } catch {
      Alert.alert("Error", "Ride may have been taken by another chauffeur");
      setIncomingRide(null);
    }
  }

  function declineRide() { setIncomingRide(null); setRideEta(null); }

  async function updateRideStatus(status: string) {
    if (!currentRide) return;
    try {
      const res = await apiRequest("PUT", `/api/rides/${currentRide.id}/status`, { status });
      const ride = await res.json();
      if (status === "trip_completed" || status === "cancelled") {
        setCurrentRide(null);
        setRoutePolyline(null);
        setRideEta(null);
        setShowNavModal(false);
        if (chauffeur) refreshChauffeur(chauffeur.id);
        if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        setCurrentRide(ride);
        if (status === "trip_started" && ride.dropoffLat && ride.dropoffLng) {
          fetchDriverRoute(parseFloat(ride.dropoffLat), parseFloat(ride.dropoffLng));
        }
      }
    } catch { Alert.alert("Error", "Failed to update ride status"); }
  }

  function confirmCancelRide() {
    Alert.alert("Cancel Trip", "Are you sure? This may affect your rating.", [
      { text: "Keep Trip", style: "cancel" },
      { text: "Cancel Trip", style: "destructive", onPress: () => updateRideStatus("cancelled") },
    ]);
  }

  // ─── Loading ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.white} />
      </View>
    );
  }

  if (!chauffeur) return null;

  // ─── Pending approval ─────────────────────────────────────────────────────
  if (!chauffeur.isApproved) {
    return (
      <View style={[styles.pendingContainer, { paddingTop: insets.top + 20 }]}>
        <View style={[styles.floatEarnings, { top: insets.top + 16 }]}>
          <Text style={styles.earningsLabel}>Today</Text>
          <Text style={styles.earningsAmount}>R {todayEarnings}</Text>
        </View>
        <View style={styles.pendingInner}>
          <Ionicons name="hourglass" size={60} color={Colors.warning} />
          <Text style={styles.pendingTitle}>Pending Approval</Text>
          <Text style={styles.pendingDesc}>Your registration is under review. You'll be notified once approved and can start accepting rides.</Text>
          <Pressable style={styles.pendingBtn} onPress={() => refreshChauffeur(chauffeur.id)}>
            <Ionicons name="refresh" size={16} color={Colors.white} />
            <Text style={styles.pendingBtnText}>Check Status</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // ─── Menu items ───────────────────────────────────────────────────────────
  const menuItems = [
    { icon: isOnline ? "stop-circle-outline" : "play-circle-outline", label: isOnline ? "Go Offline" : "Go Online", onPress: toggleOnline, color: isOnline ? "#ff6b6b" : Colors.success },
    { icon: "car-sport-outline", label: "My Rides", onPress: () => { router.push("/chauffeur/rides"); closeMenu(); }, color: Colors.white },
    { icon: "bar-chart-outline", label: "Earnings", onPress: () => { router.push("/chauffeur/earnings"); closeMenu(); }, color: Colors.white },
    { icon: "wallet-outline", label: "Wallet", onPress: () => { router.push("/chauffeur/wallet"); closeMenu(); }, color: Colors.white },
    { icon: "settings-outline", label: "Settings", onPress: () => { router.push("/chauffeur/settings"); closeMenu(); }, color: Colors.white },
    { icon: "notifications-outline", label: unreadCount > 0 ? `Notifications (${unreadCount})` : "Notifications", onPress: () => { router.push("/chauffeur/notifications"); closeMenu(); }, color: unreadCount > 0 ? Colors.warning : Colors.white },
  ];

  const rideStatusLabel =
    currentRide?.status === "chauffeur_assigned" ? "Navigate to Pickup" :
    currentRide?.status === "chauffeur_arriving" ? "Arriving at Pickup" :
    currentRide?.status === "trip_started" ? "Trip in Progress" : "Active Ride";

  return (
    <>
      {/* ─── Turn-by-turn navigation modal ─── */}
      <Modal visible={showNavModal} animationType="slide" onRequestClose={() => setShowNavModal(false)}>
        <View style={styles.navModal}>
          <View style={[styles.navModalHeader, { paddingTop: insets.top + 16 }]}>
            <View>
              <Text style={styles.navModalTitle}>
                {currentRide?.status === "trip_started" ? "Navigating to Dropoff" : "Navigate to Pickup"}
              </Text>
              {rideEta && <Text style={styles.navModalEta}>{rideEta.durationText} · {rideEta.distanceText}</Text>}
            </View>
            <Pressable style={styles.navModalClose} onPress={() => setShowNavModal(false)}>
              <Ionicons name="chevron-down" size={22} color={Colors.white} />
            </Pressable>
          </View>
          {currentRide && (
            <View style={styles.navModalAddresses}>
              <View style={styles.addrRow}>
                <View style={styles.dotGreen} />
                <Text style={styles.addrText} numberOfLines={1}>{currentRide.pickupAddress || "Pickup"}</Text>
              </View>
              <View style={styles.addrRow}>
                <View style={styles.dotRed} />
                <Text style={styles.addrText} numberOfLines={1}>{currentRide.dropoffAddress || "Dropoff"}</Text>
              </View>
            </View>
          )}
          <View style={{ flex: 1 }}>
            <A2BMap
              pickupLocation={currentRide ? { lat: parseFloat(currentRide.pickupLat), lng: parseFloat(currentRide.pickupLng) } : myLocation}
              dropoffLocation={currentRide ? { lat: parseFloat(currentRide.dropoffLat), lng: parseFloat(currentRide.dropoffLng) } : undefined}
              driverLocation={myLocation}
              routePolyline={routePolyline}
              showDriver={true}
              followDriver={true}
              loading={!myLocation}
            />
          </View>
          {navSteps.length > 0 && (
            <View style={styles.navStepBox}>
              <View style={styles.navStepRow}>
                <Ionicons
                  name={
                    navSteps[currentStepIdx]?.maneuver?.includes("left") ? "arrow-back" :
                    navSteps[currentStepIdx]?.maneuver?.includes("right") ? "arrow-forward" :
                    navSteps[currentStepIdx]?.maneuver?.includes("uturn") ? "return-down-back" : "arrow-up"
                  }
                  size={28} color={Colors.white}
                />
                <Text style={styles.navStepInstruction} numberOfLines={2}>
                  {navSteps[currentStepIdx]?.instruction || "Follow the route"}
                </Text>
              </View>
              <View style={styles.navStepMeta}>
                <Text style={styles.navStepDist}>{navSteps[currentStepIdx]?.distance}</Text>
                <Text style={styles.navStepCount}>{currentStepIdx + 1} / {navSteps.length}</Text>
              </View>
            </View>
          )}
          <View style={[styles.navModalFooter, { paddingBottom: insets.bottom + 16 }]}>
            {(currentRide?.status === "chauffeur_assigned" || currentRide?.status === "chauffeur_arriving") && (
              <Pressable style={styles.actionBtn} onPress={() => { updateRideStatus("trip_started"); setShowNavModal(false); fetchDriverRoute(parseFloat(currentRide!.dropoffLat), parseFloat(currentRide!.dropoffLng)); }}>
                <Text style={styles.actionBtnText}>Start Trip — Rider On Board</Text>
              </Pressable>
            )}
            {currentRide?.status === "trip_started" && (
              <Pressable style={[styles.actionBtn, styles.completeBtnStyle]} onPress={() => updateRideStatus("trip_completed")}>
                <Text style={styles.actionBtnText}>Complete Trip</Text>
              </Pressable>
            )}
          </View>
        </View>
      </Modal>

      {/* ─── Full-screen map ─── */}
      <View style={StyleSheet.absoluteFill}>
        <A2BMap
          pickupLocation={myLocation || (currentRide ? { lat: parseFloat(currentRide.pickupLat), lng: parseFloat(currentRide.pickupLng) } : null)}
          dropoffLocation={currentRide ? { lat: parseFloat(currentRide.dropoffLat), lng: parseFloat(currentRide.dropoffLng) } : undefined}
          driverLocation={myLocation}
          routePolyline={routePolyline}
          showDriver={true}
          followDriver={!!currentRide}
          loading={!myLocation && isOnline}
        />
      </View>

      {/* ─── Online pill (top-left) ─── */}
      <Pressable
        style={[styles.onlinePill, { top: insets.top + 16 }, isOnline ? styles.onlinePillOn : styles.onlinePillOff]}
        onPress={toggleOnline}
      >
        <View style={[styles.pillDot, { backgroundColor: isOnline ? Colors.success : "#555" }]} />
        <Text style={styles.pillText}>{isOnline ? "Online" : "Offline"}</Text>
      </Pressable>

      {/* ─── Today's earnings (top-right) ─── */}
      <View style={[styles.floatEarnings, { top: insets.top + 16 }]}>
        <Text style={styles.earningsLabel}>Today</Text>
        <Text style={styles.earningsAmount}>R {todayEarnings}</Text>
      </View>

      {/* ─── "Finding trips" pill ─── */}
      {isOnline && !currentRide && !incomingRide && (
        <View style={[styles.findingPill, { bottom: insets.bottom + 90 }]}>
          <Text style={styles.findingPillText}>Finding trips</Text>
        </View>
      )}

      {/* ─── Active ride card ─── */}
      {currentRide && (
        <View style={[styles.bottomCard, { bottom: insets.bottom + 80 }]}>
          <View style={styles.rideCardHeader}>
            <View style={[styles.statusDot, { backgroundColor: Colors.success }]} />
            <Text style={styles.rideCardTitle}>{rideStatusLabel}</Text>
            {rideEta && <Text style={styles.etaText}>{rideEta.durationText} · {rideEta.distanceText}</Text>}
          </View>
          <View style={styles.addrRow}>
            <View style={styles.dotGreen} />
            <Text style={styles.addrText} numberOfLines={1}>{currentRide.pickupAddress || "Pickup"}</Text>
          </View>
          <View style={styles.addrRow}>
            <View style={styles.dotRed} />
            <Text style={styles.addrText} numberOfLines={1}>{currentRide.dropoffAddress || "Dropoff"}</Text>
          </View>
          {currentRide.price && <Text style={styles.priceText}>R {currentRide.price}</Text>}
          <View style={styles.rideActions}>
            <Pressable style={styles.rideSecBtn} onPress={() => router.push({ pathname: "/chauffeur/chat", params: { rideId: currentRide.id, riderName: currentRide.clientName || "Rider" } })}>
              <Ionicons name="chatbubble-outline" size={15} color={Colors.white} />
              <Text style={styles.rideSecBtnText}>Message</Text>
            </Pressable>
            <Pressable style={[styles.rideSecBtn, { backgroundColor: Colors.accent }]} onPress={() => setShowNavModal(true)}>
              <Ionicons name="navigate" size={15} color={Colors.white} />
              <Text style={styles.rideSecBtnText}>Navigate</Text>
            </Pressable>
            <Pressable style={[styles.rideSecBtn, styles.cancelStyle]} onPress={confirmCancelRide}>
              <Ionicons name="close-circle-outline" size={15} color={Colors.error} />
              <Text style={[styles.rideSecBtnText, { color: Colors.error }]}>Cancel</Text>
            </Pressable>
          </View>
          {(currentRide.status === "chauffeur_assigned" || currentRide.status === "chauffeur_arriving") && (
            <Pressable style={styles.actionBtn} onPress={() => { updateRideStatus("trip_started"); fetchDriverRoute(parseFloat(currentRide.dropoffLat), parseFloat(currentRide.dropoffLng)); }}>
              <Text style={styles.actionBtnText}>Start Trip — Rider On Board</Text>
            </Pressable>
          )}
          {currentRide.status === "trip_started" && (
            <Pressable style={[styles.actionBtn, styles.completeBtnStyle]} onPress={() => updateRideStatus("trip_completed")}>
              <Text style={styles.actionBtnText}>Complete Trip</Text>
            </Pressable>
          )}
        </View>
      )}

      {/* ─── Incoming ride card ─── */}
      <Animated.View style={[styles.incomingCard, { bottom: insets.bottom + 80, transform: [{ translateY: incomingSlide }] }]}>
        {incomingRide && (
          <>
            <View style={styles.incomingHeader}>
              <Ionicons name="flash" size={18} color={Colors.warning} />
              <Text style={styles.incomingTitle}>New Ride Request</Text>
              {incomingRide.price && <Text style={styles.incomingPrice}>R {incomingRide.price}</Text>}
            </View>
            <View style={styles.addrRow}>
              <View style={styles.dotGreen} />
              <Text style={styles.addrText} numberOfLines={1}>{incomingRide.pickupAddress || "Pickup"}</Text>
            </View>
            <View style={styles.addrRow}>
              <View style={styles.dotRed} />
              <Text style={styles.addrText} numberOfLines={1}>{incomingRide.dropoffAddress || "Dropoff"}</Text>
            </View>
            <View style={styles.incomingActions}>
              <Pressable style={styles.declineBtn} onPress={declineRide}>
                <Ionicons name="close" size={24} color={Colors.error} />
              </Pressable>
              <Pressable style={styles.acceptBtn} onPress={acceptRide}>
                <Ionicons name="checkmark" size={22} color={Colors.primary} />
                <Text style={styles.acceptBtnText}>Accept Ride</Text>
              </Pressable>
            </View>
          </>
        )}
      </Animated.View>

      {/* ─── Menu backdrop ─── */}
      {menuOpen && <Pressable style={StyleSheet.absoluteFill} onPress={closeMenu} />}

      {/* ─── Animated menu items ─── */}
      {menuItems.map((item, i) => {
        const translateY = menuAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -(i + 1) * 62] });
        const opacity = menuAnim.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0, 0, 1] });
        return (
          <Animated.View key={item.label} style={[styles.menuItem, { bottom: insets.bottom + 16, opacity, transform: [{ translateY }] }]}>
            <Pressable style={styles.menuItemInner} onPress={item.onPress}>
              <Text style={[styles.menuLabel, { color: item.color }]}>{item.label}</Text>
              <View style={[styles.menuIcon, {
                backgroundColor: item.color === Colors.success ? "rgba(76,175,80,0.15)" :
                  item.color === "#ff6b6b" ? "rgba(255,107,107,0.15)" :
                  item.color === Colors.warning ? "rgba(255,183,77,0.15)" : "rgba(255,255,255,0.1)"
              }]}>
                <Ionicons name={item.icon as any} size={22} color={item.color} />
              </View>
            </Pressable>
          </Animated.View>
        );
      })}

      {/* ─── FAB ─── */}
      <Pressable style={[styles.fab, { bottom: insets.bottom + 16 }]} onPress={toggleMenu}>
        <Animated.View style={{ transform: [{ rotate: menuAnim.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "45deg"] }) }] }}>
          <Ionicons name="menu" size={26} color={Colors.white} />
        </Animated.View>
      </Pressable>
    </>
  );
}

const GLASS = "rgba(15,15,15,0.85)";
const GLASS_BORDER = "rgba(255,255,255,0.09)";

const styles = StyleSheet.create({
  loadingContainer: { flex: 1, backgroundColor: Colors.primary, alignItems: "center", justifyContent: "center" },

  // Pending
  pendingContainer: { flex: 1, backgroundColor: Colors.primary, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 },
  pendingInner: { alignItems: "center", gap: 16 },
  pendingTitle: { fontSize: 22, fontFamily: "Inter_700Bold", color: Colors.white, marginTop: 8 },
  pendingDesc: { fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.textMuted, textAlign: "center", lineHeight: 22 },
  pendingBtn: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: Colors.accent, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 12, marginTop: 8 },
  pendingBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.white },

  // Floating overlays
  onlinePill: { position: "absolute", left: 16, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 24, borderWidth: 1, zIndex: 5 },
  onlinePillOn: { backgroundColor: "rgba(76,175,80,0.18)", borderColor: "rgba(76,175,80,0.4)" },
  onlinePillOff: { backgroundColor: GLASS, borderColor: GLASS_BORDER },
  pillDot: { width: 8, height: 8, borderRadius: 4 },
  pillText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.white },

  floatBell: { position: "absolute", right: 76, width: 44, height: 44, borderRadius: 22, backgroundColor: GLASS, borderWidth: 1, borderColor: GLASS_BORDER, alignItems: "center", justifyContent: "center", zIndex: 5 },
  bellBadge: { position: "absolute", top: -2, right: -2, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: Colors.error, alignItems: "center", justifyContent: "center", paddingHorizontal: 3 },
  bellBadgeText: { fontSize: 10, fontFamily: "Inter_700Bold", color: Colors.white },

  floatEarnings: { position: "absolute", right: 76, minWidth: 72, borderRadius: 16, backgroundColor: GLASS, borderWidth: 1, borderColor: GLASS_BORDER, alignItems: "center", justifyContent: "center", paddingHorizontal: 12, paddingVertical: 8, zIndex: 5 },
  earningsLabel: { fontSize: 10, fontFamily: "Inter_400Regular", color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 0.5 },
  earningsAmount: { fontSize: 15, fontFamily: "Inter_700Bold", color: Colors.accent },

  findingPill: { position: "absolute", alignSelf: "center", backgroundColor: GLASS, borderRadius: 24, paddingHorizontal: 20, paddingVertical: 10, borderWidth: 1, borderColor: GLASS_BORDER, zIndex: 5 },
  findingPillText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: Colors.white },

  // Bottom cards
  bottomCard: { position: "absolute", left: 16, right: 76, backgroundColor: GLASS, borderRadius: 20, padding: 16, gap: 10, borderWidth: 1, borderColor: GLASS_BORDER, zIndex: 5 },
  rideCardHeader: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  rideCardTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.white, flex: 1 },
  etaText: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textMuted },
  priceText: { fontSize: 20, fontFamily: "Inter_700Bold", color: Colors.white },

  rideActions: { flexDirection: "row", gap: 8 },
  rideSecBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, backgroundColor: "rgba(255,255,255,0.09)", borderRadius: 10, paddingVertical: 9, borderWidth: 1, borderColor: GLASS_BORDER },
  rideSecBtnText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: Colors.white },
  cancelStyle: { backgroundColor: "rgba(255,77,77,0.08)", borderColor: "rgba(255,77,77,0.2)" },

  // Incoming
  incomingCard: { position: "absolute", left: 16, right: 76, backgroundColor: GLASS, borderRadius: 20, padding: 16, gap: 10, borderWidth: 1, borderColor: "rgba(255,183,77,0.3)", zIndex: 5 },
  incomingHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  incomingTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: Colors.warning, flex: 1 },
  incomingPrice: { fontSize: 15, fontFamily: "Inter_700Bold", color: Colors.white },
  incomingActions: { flexDirection: "row", gap: 10, marginTop: 2 },
  declineBtn: { width: 52, height: 52, borderRadius: 14, backgroundColor: "rgba(255,77,77,0.1)", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(255,77,77,0.25)" },
  acceptBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: Colors.white, borderRadius: 14, paddingVertical: 14 },
  acceptBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: Colors.primary },

  // Shared
  addrRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  addrText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
  dotGreen: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.success },
  dotRed: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.error },
  actionBtn: { backgroundColor: Colors.white, paddingVertical: 14, borderRadius: 14, alignItems: "center" },
  completeBtnStyle: { backgroundColor: Colors.success },
  actionBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: Colors.primary },

  // FAB & menu
  fab: { position: "absolute", right: 16, width: 56, height: 56, borderRadius: 28, backgroundColor: Colors.accent, alignItems: "center", justifyContent: "center", zIndex: 20, elevation: 8, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 6 },
  menuItem: { position: "absolute", right: 16, zIndex: 15, alignItems: "flex-end" },
  menuItemInner: { flexDirection: "row", alignItems: "center", gap: 10 },
  menuLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold", backgroundColor: GLASS, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, overflow: "hidden", borderWidth: 1, borderColor: GLASS_BORDER },
  menuIcon: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: GLASS_BORDER },

  // Nav modal
  navModal: { flex: 1, backgroundColor: Colors.primary },
  navModalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: Colors.border },
  navModalTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: Colors.white },
  navModalEta: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textMuted, marginTop: 2 },
  navModalClose: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.surface, alignItems: "center", justifyContent: "center" },
  navModalAddresses: { paddingHorizontal: 20, paddingVertical: 14, gap: 8, borderBottomWidth: 1, borderBottomColor: Colors.border },
  navModalFooter: { paddingHorizontal: 20, paddingTop: 12, gap: 10 },
  navStepBox: { backgroundColor: Colors.primary, paddingHorizontal: 20, paddingVertical: 14, borderTopWidth: 1, borderTopColor: Colors.border },
  navStepRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  navStepInstruction: { flex: 1, fontSize: 17, fontFamily: "Inter_600SemiBold", color: Colors.white, lineHeight: 22 },
  navStepMeta: { flexDirection: "row", justifyContent: "space-between", marginTop: 8 },
  navStepDist: { fontSize: 13, fontFamily: "Inter_500Medium", color: Colors.success },
  navStepCount: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textMuted },
});

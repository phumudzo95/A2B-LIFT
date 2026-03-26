import React, { useState, useEffect, useCallback, useRef } from "react";
import * as Notifications from "expo-notifications";
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
  Image,
  Modal,
  Linking,
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

export default function ChauffeurDashboard() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { on, off, emit } = useSocket();

  const [chauffeur, setChauffeur] = useState<any>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [rideEta, setRideEta] = useState<{ distanceText: string; durationText: string; distanceKm: number; durationMin: number } | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  // Track the last seen searching ride ID so polling doesn't re-alert the same ride
  const seenRideIdRef = useRef<string | null>(null);

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
      // Strong haptic alongside sound
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {}
  }

  useEffect(() => {
    return () => { soundRef.current?.unloadAsync(); };
  }, []);

  useEffect(() => {
    if (!user) return;
    async function fetchUnread() {
      try {
        const res = await apiRequest("GET", `/api/notifications/user/${user!.id}`);
        const data = await res.json();
        if (Array.isArray(data)) {
          setUnreadCount(data.filter((n: any) => !n.isRead).length);
        }
      } catch {}
    }
    fetchUnread();
    const interval = setInterval(fetchUnread, 30000);
    return () => clearInterval(interval);
  }, [user]);
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

  useEffect(() => {
    loadChauffeur();
  }, []);

  // Register for push notifications and save token to server
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

  // Handle push notification taps (bring driver to home to see the popup)
  useEffect(() => {
    if (Platform.OS === "web") return;
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
    const sub = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data as any;
      if (data?.type === "ride:new") setIsOnline(true);
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    const handleNewRide = (ride: any) => {
      if (isOnline && chauffeur?.isApproved && !currentRide) {
        setIncomingRide(ride);
        // Play alert sound + haptic for incoming trip
        playTripAlert();
      }
    };

    on("ride:new", handleNewRide);
    return () => { off("ride:new", handleNewRide); };
  }, [isOnline, chauffeur, currentRide]);

  // Listen for rider-side cancellations so driver screen resets automatically
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

  // Persist currentRide to AsyncStorage so it survives app restarts
  useEffect(() => {
    if (currentRide) {
      AsyncStorage.setItem("a2b_current_ride", JSON.stringify(currentRide)).catch(() => {});
    } else {
      AsyncStorage.removeItem("a2b_current_ride").catch(() => {});
    }
  }, [currentRide]);

  useEffect(() => {
    if (isOnline && chauffeur) {
      startLocationUpdates();
    } else {
      stopLocationUpdates();
    }
    return () => stopLocationUpdates();
  }, [isOnline, chauffeur]);

  // Poll approval status every 10s so driver sees approval without restarting app
  useEffect(() => {
    if (!chauffeur?.id) return;
    const interval = setInterval(() => refreshChauffeur(chauffeur.id), 10000);
    return () => clearInterval(interval);
  }, [chauffeur?.id]);

  // Register chauffeurId on socket so server can target this driver for nearby trips
  useEffect(() => {
    if (!chauffeur?.id) return;
    emit("chauffeur:register", { chauffeurId: chauffeur.id });
  }, [chauffeur?.id]);

  // Polling fallback: every 6s check for a searching ride near this driver.
  // Catches rides that were dispatched before the socket connected or were missed.
  useEffect(() => {
    if (!isOnline || !chauffeur?.isApproved || !chauffeur?.id) return;
    const poll = setInterval(async () => {
      // Skip if already handling a ride
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
        // Show cached data immediately for fast render, then always fetch
        // fresh from server so isApproved reflects latest admin decision
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

  // Johannesburg CBD fallback — used on simulators that have no GPS
  const JHB_FALLBACK = { lat: -26.2041, lng: 28.0473 };

  async function startLocationUpdates() {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setMyLocation(JHB_FALLBACK);
        return;
      }

      // Try real GPS first; fall back to last-known, then to JHB CBD
      let initialLoc: { lat: number; lng: number } | null = null;
      try {
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
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
    } catch {
      setMyLocation(JHB_FALLBACK);
    }
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

  // Auto-advance nav step when driver is within 30m of the next step endpoint
  useEffect(() => {
    if (!myLocation || navSteps.length === 0) return;
    const step = navSteps[currentStepIdx];
    if (!step?.endLat || !step?.endLng) return;
    const R = 6371000;
    const dLat = (step.endLat - myLocation.lat) * Math.PI / 180;
    const dLng = (step.endLng - myLocation.lng) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(myLocation.lat * Math.PI / 180) * Math.cos(step.endLat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    if (dist < 30 && currentStepIdx < navSteps.length - 1) {
      setCurrentStepIdx(i => i + 1);
    }
  }, [myLocation?.lat, myLocation?.lng]);

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
      if (ride.pickupLat && ride.pickupLng) {
        fetchDriverRoute(parseFloat(ride.pickupLat), parseFloat(ride.pickupLng));
      }
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowNavModal(true);
    } catch {
      Alert.alert("Error", "Ride may have been taken by another chauffeur");
      setIncomingRide(null);
    }
  }

  function openNavigationApp() {
    if (!currentRide) return;
    const isToPickup = currentRide.status !== "trip_started";
    const destLat = isToPickup ? currentRide.pickupLat : currentRide.dropoffLat;
    const destLng = isToPickup ? currentRide.pickupLng : currentRide.dropoffLng;
    const label = encodeURIComponent(isToPickup ? (currentRide.pickupAddress || "Pickup") : (currentRide.dropoffAddress || "Dropoff"));
    if (Platform.OS === "ios") {
      const appleMaps = `maps://maps.apple.com/?daddr=${destLat},${destLng}&dirflg=d`;
      const googleMaps = `comgooglemaps://?daddr=${destLat},${destLng}&directionsmode=driving`;
      Linking.canOpenURL(googleMaps).then(supported => {
        Linking.openURL(supported ? googleMaps : appleMaps).catch(() =>
          Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${destLat},${destLng}&travelmode=driving`)
        );
      });
    } else {
      Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${destLat},${destLng}&travelmode=driving`).catch(() => {
        Alert.alert("Navigation", "Could not open Google Maps. Please navigate manually.");
      });
    }
  }

  function confirmCancelRide() {
    Alert.alert(
      "Cancel Trip",
      "Are you sure you want to cancel this trip? This may affect your rating.",
      [
        { text: "Keep Trip", style: "cancel" },
        { text: "Cancel Trip", style: "destructive", onPress: () => updateRideStatus("cancelled") },
      ]
    );
  }

  function declineRide() {
    setIncomingRide(null);
    setRideEta(null);
  }

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
    <>
    {/* Turn-by-turn navigation modal — shown immediately after accepting a ride */}
    <Modal
      visible={showNavModal}
      animationType="slide"
      onRequestClose={() => setShowNavModal(false)}
    >
      <View style={styles.navModal}>
        <View style={[styles.navModalHeader, { paddingTop: insets.top + 16 }]}>
          <View>
            <Text style={styles.navModalTitle}>
              {currentRide?.status === "trip_started" ? "Navigating to Dropoff" : "Navigate to Pickup"}
            </Text>
            {rideEta && (
              <Text style={styles.navModalEta}>{rideEta.durationText} · {rideEta.distanceText}</Text>
            )}
          </View>
          <Pressable style={styles.navModalClose} onPress={() => setShowNavModal(false)}>
            <Ionicons name="chevron-down" size={22} color={Colors.white} />
          </Pressable>
        </View>
        {currentRide && (
          <View style={styles.navModalAddresses}>
            <View style={styles.incomingRow}>
              <View style={styles.dotGreen} />
              <Text style={styles.incomingAddress} numberOfLines={1}>{currentRide.pickupAddress || "Pickup"}</Text>
            </View>
            <View style={styles.incomingRow}>
              <View style={styles.dotRed} />
              <Text style={styles.incomingAddress} numberOfLines={1}>{currentRide.dropoffAddress || "Dropoff"}</Text>
            </View>
          </View>
        )}
        <View style={styles.navModalMap}>
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
                  navSteps[currentStepIdx]?.maneuver?.includes("uturn") ? "return-down-back" :
                  "arrow-up"
                }
                size={28}
                color={Colors.white}
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
            <Pressable style={[styles.rideActionBtn, styles.rideActionBtnFull]} onPress={() => { updateRideStatus("trip_started"); setShowNavModal(false); fetchDriverRoute(parseFloat(currentRide!.dropoffLat), parseFloat(currentRide!.dropoffLng)); }}>
              <Text style={styles.rideActionBtnText}>Start Trip — Rider On Board</Text>
            </Pressable>
          )}
          {currentRide?.status === "trip_started" && (
            <Pressable style={[styles.rideActionBtn, styles.completeBtn, styles.rideActionBtnFull]} onPress={() => { updateRideStatus("trip_completed"); }}>
              <Text style={styles.rideActionBtnText}>Complete Trip</Text>
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
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
        <View style={styles.headerRight}>
          <Pressable style={styles.bellBtn} onPress={() => router.push("/chauffeur/notifications")}>
            <Ionicons name="notifications-outline" size={20} color={Colors.white} />
            {unreadCount > 0 && (
              <View style={styles.bellBadge}>
                <Text style={styles.bellBadgeText}>{unreadCount > 9 ? "9+" : unreadCount}</Text>
              </View>
            )}
          </Pressable>
          <Pressable style={styles.avatarCircle} onPress={() => router.push("/chauffeur/settings")}>
            {user?.profilePhoto ? (
              <Image source={{ uri: user.profilePhoto }} style={styles.avatarImage} />
            ) : (
              <Ionicons name="person" size={18} color={Colors.white} />
            )}
          </Pressable>
        </View>
      </View>
      {user?.email && (
        <Text style={styles.welcomeEmail}>Welcome, {user.name || user.email}</Text>
      )}

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

      {(isOnline || currentRide) && (
        <View style={styles.mapContainer}>
          <A2BMap
            pickupLocation={myLocation || (currentRide ? { lat: parseFloat(currentRide.pickupLat), lng: parseFloat(currentRide.pickupLng) } : null)}
            dropoffLocation={currentRide ? { lat: parseFloat(currentRide.dropoffLat), lng: parseFloat(currentRide.dropoffLng) } : undefined}
            driverLocation={myLocation}
            routePolyline={routePolyline}
            showDriver={true}
            followDriver={!!currentRide}
            loading={!myLocation}
          />
        </View>
      )}

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
          {rideEta && (
            <View style={styles.etaRow}>
              <View style={styles.etaItem}>
                <Ionicons name="time-outline" size={16} color={Colors.white} />
                <Text style={styles.etaValue}>{rideEta.durationText}</Text>
              </View>
              <View style={styles.etaDivider} />
              <View style={styles.etaItem}>
                <Ionicons name="navigate-outline" size={16} color={Colors.white} />
                <Text style={styles.etaValue}>{rideEta.distanceText}</Text>
              </View>
            </View>
          )}
          {currentRide.price && (
            <Text style={styles.currentRidePrice}>R {currentRide.price}</Text>
          )}
          <View style={styles.rideSecondaryRow}>
            <Pressable
              style={styles.chatBtn}
              onPress={() => router.push({ pathname: "/chauffeur/chat", params: { rideId: currentRide.id, riderName: currentRide.clientName || "Rider" } })}
            >
              <Ionicons name="chatbubble-outline" size={16} color={Colors.white} />
              <Text style={styles.chatBtnText}>Message</Text>
            </Pressable>
            <Pressable style={styles.navBtn} onPress={() => setShowNavModal(true)}>
              <Ionicons name="navigate" size={16} color={Colors.white} />
              <Text style={styles.chatBtnText}>Navigate</Text>
            </Pressable>
            <Pressable style={styles.cancelRideBtn} onPress={confirmCancelRide}>
              <Ionicons name="close-circle-outline" size={16} color={Colors.error} />
              <Text style={styles.cancelRideBtnText}>Cancel</Text>
            </Pressable>
          </View>
          <View style={styles.rideActionRow}>
            {(currentRide.status === "chauffeur_assigned" || currentRide.status === "chauffeur_arriving") && (
              <Pressable style={({ pressed }) => [styles.rideActionBtn, pressed && { opacity: 0.9 }]} onPress={() => {
                updateRideStatus("trip_started");
                fetchDriverRoute(parseFloat(currentRide.dropoffLat), parseFloat(currentRide.dropoffLng));
              }}>
                <Text style={styles.rideActionBtnText}>Start Trip — Rider On Board</Text>
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
          <Text style={styles.statValue}>R {(chauffeur.cardEarningsTotal || 0).toFixed(0)}</Text>
          <Text style={styles.statLabel}>Card Earnings</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>
            {chauffeur.computedRating !== null && chauffeur.computedRating !== undefined
              ? Number(chauffeur.computedRating).toFixed(1)
              : chauffeur.totalRatings === 0 || chauffeur.totalRatings === undefined
                ? "New"
                : "—"}
          </Text>
          <Text style={styles.statLabel}>
            Rating{chauffeur.totalRatings ? ` (${chauffeur.totalRatings})` : ""}
          </Text>
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
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.primary, paddingHorizontal: 20 },
  mapContainer: { height: 220, borderRadius: 16, overflow: "hidden", marginBottom: 16, borderWidth: 1, borderColor: Colors.border },
  center: { alignItems: "center", justifyContent: "center" },
  scrollContent: { paddingBottom: 40 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 16 },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 10 },
  bellBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.accent, alignItems: "center", justifyContent: "center", position: "relative" as const },
  bellBadge: { position: "absolute" as const, top: -4, right: -4, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: Colors.error, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  bellBadgeText: { fontSize: 10, fontFamily: "Inter_700Bold", color: Colors.white },
  brandName: { fontSize: 18, fontFamily: "Inter_700Bold", color: Colors.white, letterSpacing: 2 },
  brandSlogan: { fontSize: 10, fontFamily: "Inter_400Regular", color: Colors.textMuted, letterSpacing: 1 },
  welcomeEmail: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textMuted, marginBottom: 8, marginTop: -8 },
  avatarCircle: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.accent, alignItems: "center", justifyContent: "center", overflow: "hidden" as const },
  avatarImage: { width: 36, height: 36, borderRadius: 18 },
  etaRow: { flexDirection: "row", alignItems: "center", backgroundColor: Colors.surface, borderRadius: 10, padding: 12, gap: 0 },
  etaItem: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  etaValue: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.white },
  etaDivider: { width: 1, height: 20, backgroundColor: Colors.border },
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
  rideActionBtnFull: { width: "100%" as const },
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
  rideSecondaryRow: { flexDirection: "row", gap: 8, marginBottom: 4 },
  chatBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: Colors.surface, borderRadius: 10, paddingVertical: 10, borderWidth: 1, borderColor: Colors.border },
  navBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: Colors.accent, borderRadius: 10, paddingVertical: 10 },
  cancelRideBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: "rgba(255,77,77,0.08)", borderRadius: 10, paddingVertical: 10, borderWidth: 1, borderColor: "rgba(255,77,77,0.2)" },
  chatBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: Colors.white },
  cancelRideBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: Colors.error },
  navModal: { flex: 1, backgroundColor: Colors.primary },
  navModalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: Colors.border },
  navModalTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: Colors.white },
  navModalEta: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textMuted, marginTop: 2 },
  navModalClose: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.surface, alignItems: "center", justifyContent: "center" },
  navModalAddresses: { paddingHorizontal: 20, paddingVertical: 14, gap: 8, borderBottomWidth: 1, borderBottomColor: Colors.border },
  navModalMap: { flex: 1 },
  navModalFooter: { paddingHorizontal: 20, paddingTop: 12, gap: 10 },
  navStepBox: { marginHorizontal: 0, backgroundColor: Colors.primary, paddingHorizontal: 20, paddingVertical: 14, borderTopWidth: 1, borderTopColor: Colors.border },
  navStepRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  navStepInstruction: { flex: 1, fontSize: 17, fontFamily: "Inter_600SemiBold", color: Colors.white, lineHeight: 22 },
  navStepMeta: { flexDirection: "row", justifyContent: "space-between", marginTop: 8 },
  navStepDist: { fontSize: 13, fontFamily: "Inter_500Medium", color: Colors.success },
  navStepCount: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textMuted },
});

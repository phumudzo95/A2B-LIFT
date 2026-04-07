import React, { useState, useEffect, useCallback, useRef } from "react";
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
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import Constants from "expo-constants";
import * as Location from "expo-location";
import * as Haptics from "expo-haptics";
import * as Speech from "expo-speech";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Audio } from "expo-av";
import { useAuth } from "@/lib/auth-context";
import { apiRequest } from "@/lib/query-client";
import { useSocket } from "@/lib/socket-context";
import Colors from "@/constants/colors";
import A2BMap from "@/components/A2BMap";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const DRIVER_SHARE = 0.85;

interface ClientReview {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  reviewerName: string;
}

interface ClientProfile {
  id: string;
  clientName: string;
  clientPhone: string | null;
  clientRating: number | null;
  totalRatings: number;
  completedTrips: number;
  memberSince: string;
  distribution: Record<number, number>;
  ratings: ClientReview[];
}

interface ClientSummary {
  id: string;
  fullName: string;
  firstName: string;
  phone: string | null;
  rating: number | null;
  createdAt: string | null;
}

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
  const [availableTrips, setAvailableTrips] = useState<any[]>([]);
  const [acceptingTripId, setAcceptingTripId] = useState<string | null>(null);
  const [completedTrip, setCompletedTrip] = useState<any>(null);
  const [clientRatingRide, setClientRatingRide] = useState<any>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [routeAlternatives, setRouteAlternatives] = useState<any[]>([]);
  const [selectedRouteIndex, setSelectedRouteIndex] = useState(0);
  const [showClientProfile, setShowClientProfile] = useState(false);
  const [clientProfile, setClientProfile] = useState<ClientProfile | null>(null);
  const [clientProfileLoading, setClientProfileLoading] = useState(false);
  const [showClientRating, setShowClientRating] = useState(false);
  const [clientRating, setClientRating] = useState(0);
  const [clientRatingComment, setClientRatingComment] = useState("");
  const [submittingClientRating, setSubmittingClientRating] = useState(false);

  const soundRef = useRef<Audio.Sound | null>(null);
  const tripAlertTokenRef = useRef(0);
  const tripAlertEnabledRef = useRef(false);
  const seenRideIdRef = useRef<string | null>(null);
  const suppressedRideAlertIdRef = useRef<string | null>(null);
  const clientSummaryCacheRef = useRef<Record<string, ClientSummary>>({});
  const lastSpokenNavKeyRef = useRef<string | null>(null);
  const routeContextRef = useRef<string | null>(null);
  const menuAnim = useRef(new Animated.Value(0)).current;
  const incomingSlide = useRef(new Animated.Value(300)).current;
  const notificationsRef = useRef<any>(null);
  const isExpoGoAndroid = Platform.OS === "android" && Constants.appOwnership === "expo";

  function getClientFirstName(name?: string | null, fallback = "Client") {
    const cleaned = String(name || "").trim();
    if (!cleaned) return fallback;
    return cleaned.split(/\s+/)[0] || fallback;
  }

  function isPlaceholderClientName(name?: string | null) {
    const normalized = String(name || "").trim().toLowerCase();
    return !normalized || ["client", "rider", "a2b", "a2b client"].includes(normalized);
  }

  function getRouteOptionTitle(index: number, summary?: string | null) {
    const cleanedSummary = String(summary || "").trim();
    if (currentRide?.status === "trip_started" && index === 0) {
      return getRideRouteLabel(currentRide?.selectedRouteId);
    }
    if (cleanedSummary) return cleanedSummary;
    if (index === 0) return "Suggested Route";
    if (index === 1) return "Backup Route";
    return `Route ${index + 1}`;
  }

  function calculateRouteSafetyScore(route: any): number {
    const stepsCount = Array.isArray(route?.steps) ? route.steps.length : 0;
    const averageSpeed = route?.durationMin > 0 ? Number(route.distanceKm || 0) / (Number(route.durationMin || 0) / 60) : Number(route.distanceKm || 0);
    const highwayPenalty = /\b(M|N)\d+\b|highway|freeway|motorway/i.test(String(route?.summary || "")) ? 5 : 0;
    return stepsCount + averageSpeed * 1.4 + highwayPenalty;
  }

  function getClientSelectedRouteIndex(routes: any[], ride: any) {
    if (!Array.isArray(routes) || routes.length === 0 || !ride || ride.status !== "trip_started") return 0;

    if (ride.selectedRouteId === "faster_route") {
      return routes.reduce((bestIdx, route, index) => {
        const bestRoute = routes[bestIdx];
        return Number(route.durationMin || 0) < Number(bestRoute.durationMin || 0) ? index : bestIdx;
      }, 0);
    }

    if (ride.selectedRouteId === "safest_route") {
      return routes.reduce((bestIdx, route, index) => {
        const bestRoute = routes[bestIdx];
        return calculateRouteSafetyScore(route) < calculateRouteSafetyScore(bestRoute) ? index : bestIdx;
      }, 0);
    }

    const selectedDistanceKm = Number(ride.selectedRouteDistanceKm || 0);
    if (selectedDistanceKm > 0) {
      return routes.reduce((bestIdx, route, index) => {
        const bestRoute = routes[bestIdx];
        const currentGap = Math.abs(Number(route.distanceKm || 0) - selectedDistanceKm);
        const bestGap = Math.abs(Number(bestRoute.distanceKm || 0) - selectedDistanceKm);
        return currentGap < bestGap ? index : bestIdx;
      }, 0);
    }

    return 0;
  }

  function reorderRoutesForClientSelection(routes: any[], ride: any) {
    if (!Array.isArray(routes) || routes.length === 0 || !ride || ride.status !== "trip_started") return routes;
    const selectedIndex = getClientSelectedRouteIndex(routes, ride);
    if (selectedIndex === 0) return routes;
    const selectedRoute = routes[selectedIndex];
    return [selectedRoute, ...routes.filter((_, index) => index !== selectedIndex)];
  }

  function getRouteAlternatives(routes: any[], fallbackRoute?: any) {
    const sourceRoutes = Array.isArray(routes) && routes.length > 0
      ? routes
      : fallbackRoute?.polyline
        ? [fallbackRoute]
        : [];

    const seen = new Set<string>();
    const uniqueRoutes: any[] = [];

    for (const route of sourceRoutes) {
      if (!route?.polyline || seen.has(route.polyline)) continue;
      seen.add(route.polyline);
      uniqueRoutes.push(route);
      if (uniqueRoutes.length === 3) break;
    }

    return reorderRoutesForClientSelection(uniqueRoutes, currentRide);
  }

  /** Estimate the fare for a given route distance using the ride's vehicle type */
  function calcRoutePrice(distanceKm: number | undefined): string {
    if (!distanceKm || !currentRide) return "";
    if (currentRide?.status === "trip_started" && getRideFare(currentRide) > 0 && Math.abs(Number(currentRide.selectedRouteDistanceKm || 0) - Number(distanceKm || 0)) < 0.35) {
      return `R ${getRideFare(currentRide).toFixed(0)}`;
    }
    const rates: Record<string, { pricePerKm: number; baseFare: number }> = {
      budget:      { pricePerKm: 7,  baseFare: 50  },
      luxury:      { pricePerKm: 13, baseFare: 100 },
      business:    { pricePerKm: 35, baseFare: 150 },
      van:         { pricePerKm: 13, baseFare: 120 },
      luxury_van:  { pricePerKm: 35, baseFare: 200 },
    };
    const cat = rates[currentRide.vehicleType || "budget"] || rates.budget;
    const total = Math.round(cat.baseFare + distanceKm * cat.pricePerKm);
    return `R ${Math.round(total * DRIVER_SHARE)}`;
  }

  function getRideRouteLabel(routeId?: string | null) {
    if (routeId === "faster_route") return "Faster Route";
    if (routeId === "safest_route") return "Safer Route";
    return "Balanced Route";
  }

  function getRideRouteIcon(routeId?: string | null): keyof typeof Ionicons.glyphMap {
    if (routeId === "faster_route") return "flash-outline";
    if (routeId === "safest_route") return "shield-checkmark-outline";
    return "navigate-circle-outline";
  }

  function getRidePaymentLabel(method?: string | null) {
    if (method === "card") return "Card";
    if (method === "wallet") return "Wallet";
    return "Cash";
  }

  function getRidePaymentIcon(method?: string | null): keyof typeof Ionicons.glyphMap {
    if (method === "card") return "card-outline";
    if (method === "wallet") return "wallet-outline";
    return "cash-outline";
  }

  function getRideClientFare(ride: any) {
    return Number(ride?.actualFare || ride?.price || 0);
  }

  function getRideFare(ride: any) {
    const grossFare = getRideClientFare(ride);
    return grossFare > 0 ? Math.round(grossFare * DRIVER_SHARE) : 0;
  }

  async function getClientSummary(clientId?: string): Promise<ClientSummary | null> {
    if (!clientId) return null;
    const cached = clientSummaryCacheRef.current[clientId];
    if (cached) return cached;
    try {
      const res = await apiRequest("GET", `/api/users/${clientId}`);
      const user = await res.json();
      const summary: ClientSummary = {
        id: user.id,
        fullName: user.name || user.username || "Client",
        firstName: getClientFirstName(user.name || user.username, "Client"),
        phone: user.phone || null,
        rating: user.rating != null ? Number(user.rating) : null,
        createdAt: user.createdAt ? String(user.createdAt) : null,
      };
      clientSummaryCacheRef.current[clientId] = summary;
      return summary;
    } catch {
      return null;
    }
  }

  async function enrichRideClientDetails<T extends Record<string, any> | null>(ride: T, fallback = "Client"): Promise<T> {
    if (!ride) return ride;

    const seededFirstName = getClientFirstName(ride.clientFirstName || ride.clientName, fallback);
    if (!ride.clientId) {
      return {
        ...ride,
        clientFirstName: seededFirstName,
      } as T;
    }

    const summary = await getClientSummary(ride.clientId);
    if (!summary) {
      return {
        ...ride,
        clientFirstName: seededFirstName,
      } as T;
    }

    return {
      ...ride,
      clientFirstName: isPlaceholderClientName(ride.clientFirstName) ? summary.firstName : seededFirstName,
      clientName: ride.clientName || summary.fullName,
      clientPhone: ride.clientPhone || summary.phone,
    } as T;
  }

  async function buildFallbackClientProfile(clientId: string): Promise<ClientProfile | null> {
    try {
      const [userRes, ridesRes] = await Promise.all([
        apiRequest("GET", `/api/users/${clientId}`),
        apiRequest("GET", `/api/rides/client/${clientId}`),
      ]);
      const user = await userRes.json();
      const rides = await ridesRes.json();
      const completedTrips = Array.isArray(rides)
        ? rides.filter((ride: any) => ride.status === "trip_completed").length
        : 0;

      const fallbackProfile: ClientProfile = {
        id: user.id,
        clientName: user.name || user.username || "Client",
        clientPhone: user.phone || null,
        clientRating: user.rating != null ? Number(user.rating) : null,
        totalRatings: 0,
        completedTrips,
        memberSince: user.createdAt ? String(user.createdAt) : new Date().toISOString(),
        distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
        ratings: [],
      };

      clientSummaryCacheRef.current[clientId] = {
        id: fallbackProfile.id,
        fullName: fallbackProfile.clientName,
        firstName: getClientFirstName(fallbackProfile.clientName, "Client"),
        phone: fallbackProfile.clientPhone,
        rating: fallbackProfile.clientRating,
        createdAt: fallbackProfile.memberSince,
      };

      return fallbackProfile;
    } catch {
      return null;
    }
  }

  // ─── Sound ───────────────────────────────────────────────────────────────
  async function playTripAlert() {
    const alertToken = tripAlertTokenRef.current + 1;
    tripAlertTokenRef.current = alertToken;
    tripAlertEnabledRef.current = true;
    try {
      if (Platform.OS === "web") return;
      await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
      if (tripAlertTokenRef.current !== alertToken || !tripAlertEnabledRef.current) {
        return;
      }
      if (soundRef.current) {
        await soundRef.current.setIsLoopingAsync(true);
        if (tripAlertTokenRef.current !== alertToken || !tripAlertEnabledRef.current) {
          return;
        }
        await soundRef.current.replayAsync();
      } else {
        const { sound } = await Audio.Sound.createAsync(
          require("../../assets/trip-alert.wav"),
          { shouldPlay: false, volume: 1.0, isLooping: true }
        );
        if (tripAlertTokenRef.current !== alertToken || !tripAlertEnabledRef.current) {
          await sound.unloadAsync();
          return;
        }
        soundRef.current = sound;
        await sound.playAsync();
      }
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {}
  }

  async function stopTripAlert() {
    tripAlertEnabledRef.current = false;
    tripAlertTokenRef.current += 1;
    try {
      if (soundRef.current) {
        await soundRef.current.stopAsync();
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }
    } catch {}
  }

  useEffect(() => { return () => { void stopTripAlert(); }; }, []);

  useEffect(() => {
    return () => {
      Speech.stop();
    };
  }, []);

  useEffect(() => {
    if (Platform.OS === "web" || isExpoGoAndroid) return;
    try {
      // Load notifications only where supported to avoid Expo Go Android runtime errors.
      notificationsRef.current = require("expo-notifications");
    } catch {
      notificationsRef.current = null;
    }
  }, [isExpoGoAndroid]);

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
        seenRideIdRef.current = ride.id || null;
        void enrichRideClientDetails(ride, "Client").then((enrichedRide) => {
          setIncomingRide(enrichedRide);
        });
        if (ride?.id !== suppressedRideAlertIdRef.current) {
          playTripAlert();
        }
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
          setRouteAlternatives([]);
          setSelectedRouteIndex(0);
          setRideEta(null);
          setShowNavModal(false);
          setNavSteps([]);
          setCurrentStepIdx(0);
          routeContextRef.current = null;
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
    if (!chauffeur?.id || Platform.OS === "web" || isExpoGoAndroid) return;
    (async () => {
      try {
        const Notifications = notificationsRef.current;
        if (!Notifications) return;
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
  }, [chauffeur?.id, isExpoGoAndroid]);

  useEffect(() => {
    if (Platform.OS === "web" || isExpoGoAndroid) return;
    const Notifications = notificationsRef.current;
    if (!Notifications) return;
    Notifications.setNotificationHandler({
      handleNotification: async () => ({ shouldShowAlert: true, shouldPlaySound: true, shouldSetBadge: false }),
    });
    const sub = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data as any;
      if (data?.type === "ride:new") setIsOnline(true);
    });
    return () => sub.remove();
  }, [isExpoGoAndroid]);

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
          const enrichedRide = await enrichRideClientDetails(ride, "Client");
          setIncomingRide(enrichedRide);
          if (ride.id !== suppressedRideAlertIdRef.current) {
            playTripAlert();
          }
        }
      } catch {}
    }, 6000);
    return () => clearInterval(poll);
  }, [isOnline, chauffeur?.isApproved, chauffeur?.id, currentRide, incomingRide]);

  // ─── Available trips list polling ─────────────────────────────────────────
  useEffect(() => {
    if (!isOnline || !chauffeur?.isApproved || !chauffeur?.id) {
      setAvailableTrips([]);
      return;
    }
    async function fetchAvailable() {
      if (currentRide || incomingRide) { setAvailableTrips([]); return; }
      try {
        const res = await apiRequest("GET", `/api/rides/available/${chauffeur!.id}`);
        if (!res.ok) return;
        const trips = await res.json();
        if (Array.isArray(trips)) {
          const enrichedTrips = await Promise.all(trips.map((trip: any) => enrichRideClientDetails(trip, "Client")));
          setAvailableTrips(enrichedTrips);
        }
      } catch {}
    }
    fetchAvailable();
    const poll = setInterval(fetchAvailable, 8000);
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

  useEffect(() => {
    if (currentRide || !incomingRide) {
      stopTripAlert();
    }
  }, [currentRide?.id, incomingRide?.id]);

  useEffect(() => {
    if (!currentRide || navSteps.length === 0) return;
    const step = navSteps[currentStepIdx];
    const instruction = step?.instruction?.trim();
    if (!instruction) return;

    const navKey = `${currentRide.id}:${currentRide.status}:${currentStepIdx}:${instruction}`;
    if (lastSpokenNavKeyRef.current === navKey) return;
    lastSpokenNavKeyRef.current = navKey;

    if (Platform.OS !== "web") {
      Haptics.selectionAsync().catch(() => {});
      try {
        Speech.stop();
      } catch {}
      Speech.speak(instruction, {
        language: "en-ZA",
        rate: 0.95,
        pitch: 1,
      });
    }
  }, [currentRide?.id, currentRide?.status, currentStepIdx, navSteps]);

  useEffect(() => {
    if (!currentRide) {
      lastSpokenNavKeyRef.current = null;
      routeContextRef.current = null;
      Speech.stop();
    }
  }, [currentRide?.id]);

  useEffect(() => {
    if (!currentRide || !myLocation) return;
    const destination = currentRide.status === "trip_started"
      ? { lat: currentRide.dropoffLat, lng: currentRide.dropoffLng }
      : { lat: currentRide.pickupLat, lng: currentRide.pickupLng };

    if (!destination.lat || !destination.lng) return;

    fetchDriverRoute(parseFloat(destination.lat), parseFloat(destination.lng));
  }, [currentRide?.id, currentRide?.status, myLocation?.lat, myLocation?.lng]);

  // ─── Data ─────────────────────────────────────────────────────────────────
  async function restoreActiveRide() {
    try {
      const saved = await AsyncStorage.getItem("a2b_current_ride");
      if (!saved) return;
      const ride = JSON.parse(saved);
      const rideRes = await apiRequest("GET", `/api/rides/${ride.id}`);
      if (!rideRes.ok) { await AsyncStorage.removeItem("a2b_current_ride"); return; }
      const fetchedRide = await rideRes.json();
      const freshRide = await enrichRideClientDetails({
        ...fetchedRide,
        clientFirstName: fetchedRide.clientFirstName || ride.clientFirstName,
        clientName: fetchedRide.clientName || ride.clientName,
      }, "Client");
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
        const refreshed = cached?.id ? await refreshChauffeur(cached.id) : null;
        if (refreshed) {
          restoreActiveRide();
          return;
        }
        await AsyncStorage.removeItem("a2b_chauffeur");
      }
      const c = await fetchChauffeurForUser(user.id);
      if (!c) throw new Error("not found");
      restoreActiveRide();
    } catch {
      router.replace("/chauffeur-register");
    } finally {
      setLoading(false);
    }
  }

  async function fetchChauffeurForUser(userId: string) {
    try {
      const res = await apiRequest("GET", `/api/chauffeurs/user/${userId}`);
      const c = await res.json();
      setChauffeur(c);
      setIsOnline(c.isOnline || false);
      if (typeof c.todayEarnings === "number") setTodayEarnings(c.todayEarnings);
      await AsyncStorage.setItem("a2b_chauffeur", JSON.stringify(c));
      return c;
    } catch {
      return null;
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
      return c;
    } catch {
      return null;
    }
  }

  useEffect(() => {
    loadChauffeur();
    // Persist mode so app reopens to the correct screen
    AsyncStorage.setItem("a2b_last_mode", "chauffeur").catch(() => {});
  }, []);

  // ─── Actions ──────────────────────────────────────────────────────────────
  async function toggleOnline() {
    let activeChauffeur = chauffeur;
    if (!activeChauffeur?.id && user?.id) {
      activeChauffeur = await fetchChauffeurForUser(user.id);
    }
    if (!activeChauffeur?.id) {
      Alert.alert("Error", "Unable to load driver profile");
      closeMenu();
      return;
    }
    try {
      const res = await apiRequest("PUT", `/api/chauffeurs/${activeChauffeur.id}/toggle-online`);
      const updated = await res.json();
      setChauffeur(updated);
      setIsOnline(updated.isOnline);
      await AsyncStorage.setItem("a2b_chauffeur", JSON.stringify(updated));
      if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {
      const recovered = user?.id ? await fetchChauffeurForUser(user.id) : null;
      if (recovered?.id) {
        try {
          const retryRes = await apiRequest("PUT", `/api/chauffeurs/${recovered.id}/toggle-online`);
          const updated = await retryRes.json();
          setChauffeur(updated);
          setIsOnline(updated.isOnline);
          await AsyncStorage.setItem("a2b_chauffeur", JSON.stringify(updated));
          if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          closeMenu();
          return;
        } catch {}
      }
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

  async function fetchDriverRoute(destLat: number, destLng: number): Promise<boolean> {
    if (!myLocation) return false;
    try {
      const res = await apiRequest("GET",
        `/api/directions?originLat=${myLocation.lat}&originLng=${myLocation.lng}&destLat=${destLat}&destLng=${destLng}`
      );
      const data = await res.json();
      const fallbackRoute = data?.polyline
        ? {
            polyline: data.polyline,
            distanceText: data.distanceText,
            durationText: data.durationText,
            distanceKm: data.distanceKm,
            durationMin: data.durationMin,
            summary: data.summary,
            steps: Array.isArray(data.steps) ? data.steps : [],
          }
        : null;
      const alternatives = getRouteAlternatives(data.alternatives, fallbackRoute);
      const routeContextKey = [
        currentRide?.id || "route",
        currentRide?.status || "pickup",
        Number(destLat).toFixed(5),
        Number(destLng).toFixed(5),
      ].join(":");
      const hasContextChanged = routeContextRef.current !== routeContextKey;
      routeContextRef.current = routeContextKey;

      const nextSelectedIndex = hasContextChanged
        ? 0
        : Math.min(selectedRouteIndex, Math.max(alternatives.length - 1, 0));
      const activeRoute = alternatives[nextSelectedIndex] || alternatives[0] || fallbackRoute;

      setRouteAlternatives(alternatives);
      setSelectedRouteIndex(nextSelectedIndex);

      if (activeRoute?.polyline) {
        setRoutePolyline(activeRoute.polyline);
      }

      if (activeRoute?.distanceText && activeRoute?.durationText) {
        setRideEta({
          distanceText: activeRoute.distanceText,
          durationText: activeRoute.durationText,
          distanceKm: activeRoute.distanceKm,
          durationMin: activeRoute.durationMin,
        });
      }

      if (Array.isArray(activeRoute?.steps) && activeRoute.steps.length > 0) {
        setNavSteps(activeRoute.steps);
        setCurrentStepIdx((prev) => (hasContextChanged ? 0 : Math.min(prev, activeRoute.steps.length - 1)));
      } else if (hasContextChanged) {
        setNavSteps([]);
        setCurrentStepIdx(0);
      }
      return true;
    } catch { return false; }
  }

  function selectRoute(alt: any, index: number) {
    setSelectedRouteIndex(index);
    setRoutePolyline(alt.polyline);
    setRideEta({ distanceText: alt.distanceText, durationText: alt.durationText, distanceKm: alt.distanceKm, durationMin: alt.durationMin });
    if (Array.isArray(alt.steps) && alt.steps.length > 0) {
      setNavSteps(alt.steps);
      setCurrentStepIdx(0);
    }
    setShowNavModal(true);
  }

  async function startTripToDestination() {
    if (!currentRide) return;
    await updateRideStatus("trip_started");
    // Route to dropoff is fetched inside updateRideStatus after trip_started
  }

  async function openClientProfile(clientId?: string) {
    const resolvedClientId = clientId || currentRide?.clientId || incomingRide?.clientId;
    if (!resolvedClientId) return;
    setClientProfile(null);
    setClientProfileLoading(true);
    setShowClientProfile(true);
    try {
      const res = await apiRequest("GET", `/api/clients/${resolvedClientId}/profile`);
      const data = await res.json();
      setClientProfile(data);
    } catch {
      const fallbackProfile = await buildFallbackClientProfile(resolvedClientId);
      if (fallbackProfile) {
        setClientProfile(fallbackProfile);
      } else {
        Alert.alert("Error", "Could not load client profile.");
        setShowClientProfile(false);
      }
    } finally {
      setClientProfileLoading(false);
    }
  }

  function beginClientRating() {
    if (!completedTrip?.clientId) {
      setCompletedTrip(null);
      return;
    }
    setClientRatingRide(completedTrip);
    setClientRating(0);
    setClientRatingComment("");
    setCompletedTrip(null);
    setShowClientRating(true);
  }

  function closeClientRating() {
    setShowClientRating(false);
    setClientRating(0);
    setClientRatingComment("");
    setClientRatingRide(null);
  }

  async function submitClientRating() {
    if (!clientRatingRide || clientRating === 0) {
      Alert.alert("Rating Required", "Please select a rating for this client.");
      return;
    }
    try {
      setSubmittingClientRating(true);
      await apiRequest("POST", `/api/rides/${clientRatingRide.id}/rate-client`, {
        rating: clientRating,
        comment: clientRatingComment.trim() || null,
      });
      closeClientRating();
      Alert.alert("Rating Saved", "The client rating has been submitted.");
    } catch (error: any) {
      const message = String(error?.message || "");
      if (message.includes("Cannot POST") || message.includes("404:")) {
        Alert.alert("Backend Update Needed", "Client rating is not live on the server yet. The app changes are ready, but Railway still needs the updated backend route.");
      } else {
        Alert.alert("Error", error.message || "Failed to submit client rating.");
      }
    } finally {
      setSubmittingClientRating(false);
    }
  }

  async function acceptRide() {
    if (!incomingRide || !chauffeur) return;
    const pendingRide = incomingRide;
    suppressedRideAlertIdRef.current = pendingRide.id || null;
    setIncomingRide(null);
    stopTripAlert();
    try {
      const res = await apiRequest("PUT", `/api/rides/${pendingRide.id}/accept`, { chauffeurId: chauffeur.id });
      if (res.status === 409) {
        Alert.alert("Too Late", "This ride was already taken by another driver.");
        setIncomingRide(null);
        return;
      }
      const ride = await res.json();
      const enrichedRide = await enrichRideClientDetails({
        ...ride,
        clientFirstName: ride.clientFirstName || pendingRide.clientFirstName,
        clientName: ride.clientName || pendingRide.clientName,
        clientPhone: ride.clientPhone || pendingRide.clientPhone,
      }, "Client");
      setCurrentRide(enrichedRide);
      setIncomingRide(null);
      if (enrichedRide.pickupLat && enrichedRide.pickupLng) {
        await fetchDriverRoute(parseFloat(enrichedRide.pickupLat), parseFloat(enrichedRide.pickupLng));
      }
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowNavModal(true);
    } catch {
      Alert.alert("Error", "Ride may have been taken by another chauffeur");
      const restoredRide = await enrichRideClientDetails(pendingRide, "Client");
      setIncomingRide(restoredRide);
    }
  }

  function declineRide() {
    suppressedRideAlertIdRef.current = incomingRide?.id || null;
    stopTripAlert();
    setIncomingRide(null);
    setRideEta(null);
  }

  async function acceptTripFromList(trip: any) {
    if (!chauffeur || acceptingTripId) return;
    suppressedRideAlertIdRef.current = trip.id || null;
    stopTripAlert();
    setAcceptingTripId(trip.id);
    try {
      const res = await apiRequest("PUT", `/api/rides/${trip.id}/accept`, { chauffeurId: chauffeur.id });
      if (res.status === 409) {
        Alert.alert("Too Late", "This ride was already taken by another driver.");
        setAvailableTrips((prev) => prev.filter((t) => t.id !== trip.id));
        return;
      }
      const ride = await res.json();
      const enrichedRide = await enrichRideClientDetails({
        ...ride,
        clientFirstName: ride.clientFirstName || trip.clientFirstName,
        clientName: ride.clientName || trip.clientName,
        clientPhone: ride.clientPhone || trip.clientPhone,
      }, "Client");
      setCurrentRide(enrichedRide);
      setAvailableTrips([]);
      setIncomingRide(null);
      if (enrichedRide.pickupLat && enrichedRide.pickupLng) {
        await fetchDriverRoute(parseFloat(enrichedRide.pickupLat), parseFloat(enrichedRide.pickupLng));
      }
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowNavModal(true);
    } catch {
      Alert.alert("Error", "Could not accept this ride. It may have been taken.");
    } finally {
      setAcceptingTripId(null);
    }
  }

  async function updateRideStatus(status: string) {
    if (!currentRide) return;
    try {
      const res = await apiRequest("PUT", `/api/rides/${currentRide.id}/status`, { status });
      const ride = await res.json();
      const rideWithName = await enrichRideClientDetails({
        ...ride,
        clientFirstName:
          ride?.clientFirstName ||
          currentRide?.clientFirstName ||
          (currentRide?.clientName ? String(currentRide.clientName).split(" ")[0] : null) ||
          "Client",
        clientName: ride?.clientName || currentRide?.clientName,
        clientPhone: ride?.clientPhone || currentRide?.clientPhone,
      }, "Client");
      if (status === "trip_completed" || status === "cancelled") {
        if (status === "trip_completed") setCompletedTrip(rideWithName);
        setCurrentRide(null);
        setRoutePolyline(null);
        setRouteAlternatives([]);
        setSelectedRouteIndex(0);
        setRideEta(null);
        setShowNavModal(false);
        setNavSteps([]);
        setCurrentStepIdx(0);
        routeContextRef.current = null;
        if (chauffeur) refreshChauffeur(chauffeur.id);
        if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        setCurrentRide(rideWithName);
        if (status === "trip_started" && ride.dropoffLat && ride.dropoffLng) {
          await fetchDriverRoute(parseFloat(ride.dropoffLat), parseFloat(ride.dropoffLng));
          setShowNavModal(true);
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

  const clientDisplayName =
    currentRide?.clientFirstName ||
    (currentRide?.clientName ? String(currentRide.clientName).split(" ")[0] : null) ||
    "Client";
  const rideStatusLabel =
    currentRide?.status === "chauffeur_assigned" ? `On the way to pick up ${clientDisplayName}` :
    currentRide?.status === "chauffeur_arriving" ? `Arriving at ${clientDisplayName}'s pickup` :
    currentRide?.status === "trip_started" ? `Trip in progress — ${clientDisplayName}` : "Active Ride";
  const routeOptionsHeading = currentRide?.status === "trip_started" ? "Destination routes" : "Pickup routes";
  const clientRouteLabel = getRideRouteLabel(currentRide?.selectedRouteId);
  const clientPaymentLabel = getRidePaymentLabel(currentRide?.paymentMethod);

  return (
    <>
      {/* ─── Turn-by-turn navigation modal ─── */}
      <Modal visible={showNavModal} animationType="slide" onRequestClose={() => setShowNavModal(false)}>
        <View style={styles.navModal}>
          <View style={[styles.navModalHeader, { paddingTop: insets.top + 16 }]}>
            <View>
              <Text style={styles.navModalTitle}>
                {currentRide?.status === "trip_started" ? `Dropping off ${clientDisplayName}` : `Picking up ${clientDisplayName}`}
              </Text>
              {rideEta && <Text style={styles.navModalEta}>{rideEta.durationText} · {rideEta.distanceText}</Text>}
              {currentRide && (
                <Text style={styles.navModalRouteHint}>{clientRouteLabel} · {clientPaymentLabel}</Text>
              )}
            </View>
            <Pressable style={styles.navModalClose} onPress={() => setShowNavModal(false)}>
              <Ionicons name="chevron-down" size={22} color={Colors.white} />
            </Pressable>
          </View>
          {routeAlternatives.length > 0 && (
            <View style={styles.routeOptionsContainer}>
              <Text style={styles.routeOptionsTitle}>{routeOptionsHeading}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 4 }}>
                {routeAlternatives.map((alt, i) => (
                  <Pressable
                    key={i}
                    style={[styles.routeOptionCard, selectedRouteIndex === i && styles.routeOptionCardSelected]}
                    onPress={() => selectRoute(alt, i)}
                  >
                    <Ionicons name={i === 0 ? "speedometer-outline" : i === 1 ? "navigate-outline" : "analytics-outline"} size={18} color={selectedRouteIndex === i ? Colors.primary : Colors.accent} />
                    <Text style={[styles.routeOptionName, selectedRouteIndex === i && { color: Colors.primary }]}>{getRouteOptionTitle(i, alt.summary)}</Text>
                    <Text style={[styles.routeOptionDetail, selectedRouteIndex === i && { color: Colors.primary }]}>{alt.durationText} · {alt.distanceText}</Text>
                    {calcRoutePrice(alt.distanceKm) ? (
                      <Text style={[styles.routeOptionPrice, selectedRouteIndex === i && { color: Colors.primary }]}>{calcRoutePrice(alt.distanceKm)}</Text>
                    ) : null}
                  </Pressable>
                ))}
              </ScrollView>
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
                <View style={styles.navArrowCircle}>
                  <Ionicons
                    name={
                      navSteps[currentStepIdx]?.maneuver?.includes("left") ? "arrow-back" :
                      navSteps[currentStepIdx]?.maneuver?.includes("right") ? "arrow-forward" :
                      navSteps[currentStepIdx]?.maneuver?.includes("uturn") ? "return-down-back" :
                      navSteps[currentStepIdx]?.maneuver?.includes("roundabout") ? "sync" : "arrow-up"
                    }
                    size={28} color={Colors.white}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.navStepInstruction} numberOfLines={2}>
                    {navSteps[currentStepIdx]?.instruction || "Follow the route"}
                  </Text>
                  <Text style={styles.navStepStreet}>
                    {navSteps[currentStepIdx]?.distance} {navSteps[currentStepIdx + 1]?.instruction ? `· then ${navSteps[currentStepIdx + 1]?.instruction.split(' ').slice(0, 4).join(' ')}` : ""}
                  </Text>
                </View>
              </View>
              <View style={styles.navStepMeta}>
                <Text style={styles.navStepDist}>{rideEta?.durationText || ""} · {rideEta?.distanceText || ""}</Text>
                <Text style={styles.navStepCount}>Step {currentStepIdx + 1} of {navSteps.length}</Text>
              </View>
            </View>
          )}
          <View style={[styles.navModalFooter, { paddingBottom: insets.bottom + 16 }]}>
            {(currentRide?.status === "chauffeur_assigned" || currentRide?.status === "chauffeur_arriving") && (
              <Pressable style={styles.actionBtn} onPress={startTripToDestination}>
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

      {/* ─── Floating turn-by-turn nav bar ─── */}
      {currentRide && navSteps.length > 0 && !showNavModal && (
        <Pressable style={[styles.floatNavBar, { top: insets.top + 60 }]} onPress={() => setShowNavModal(true)}>
          <View style={styles.floatNavArrow}>
            <Ionicons
              name={
                navSteps[currentStepIdx]?.maneuver?.includes("left") ? "arrow-back" :
                navSteps[currentStepIdx]?.maneuver?.includes("right") ? "arrow-forward" :
                navSteps[currentStepIdx]?.maneuver?.includes("uturn") ? "return-down-back" :
                navSteps[currentStepIdx]?.maneuver?.includes("roundabout") ? "sync" : "arrow-up"
              }
              size={24} color={Colors.white}
            />
          </View>
          <View style={styles.floatNavContent}>
            <Text style={styles.floatNavInstruction} numberOfLines={1}>
              {navSteps[currentStepIdx]?.instruction || "Follow the route"}
            </Text>
            <View style={styles.floatNavMeta}>
              <Text style={styles.floatNavDist}>{navSteps[currentStepIdx]?.distance}</Text>
              <Text style={styles.floatNavStep}>{currentStepIdx + 1}/{navSteps.length}</Text>
              {rideEta && <Text style={styles.floatNavEta}>{rideEta.durationText}</Text>}
            </View>
          </View>
          <Ionicons name="expand-outline" size={18} color={Colors.textMuted} />
        </Pressable>
      )}
      <Pressable
        style={[styles.onlinePill, { top: insets.top + 16 }, isOnline ? styles.onlinePillOn : styles.onlinePillOff]}
        onPress={toggleOnline}
      >
        <View style={[styles.pillDot, { backgroundColor: isOnline ? Colors.success : "#555" }]} />
        <Text style={styles.pillText}>{isOnline ? "Online" : "Offline"}</Text>
      </Pressable>

      {/* ─── Today's earnings (top-right, taps to wallet) ─── */}
      <Pressable style={[styles.floatEarnings, { top: insets.top + 16 }]} onPress={() => router.push("/chauffeur/wallet")}>
        <Text style={styles.earningsLabel}>Today</Text>
        <Text style={styles.earningsAmount}>R {todayEarnings}</Text>
      </Pressable>

      {/* ─── Available trips panel ─── */}
      {isOnline && !currentRide && !incomingRide && (
        <View style={[styles.tripsPanel, { bottom: insets.bottom + 80 }]}>
          <View style={styles.tripsPanelHeader}>
            <Ionicons name="search" size={14} color={Colors.accent} />
            <Text style={styles.tripsPanelTitle}>
              {availableTrips.length > 0
                ? `${availableTrips.length} trip${availableTrips.length > 1 ? "s" : ""} available`
                : "Searching for trips..."}
            </Text>
            {availableTrips.length === 0 && <ActivityIndicator size="small" color={Colors.accent} style={{ marginLeft: 4 }} />}
          </View>
          {availableTrips.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tripsScroll} contentContainerStyle={styles.tripsScrollContent}>
              {availableTrips.map((trip) => (
                <View key={trip.id} style={styles.tripCard}>
                  <View style={styles.tripCardTop}>
                    <Pressable style={styles.tripClientRow} onPress={() => openClientProfile(trip.clientId)}>
                      <Ionicons name="person-circle-outline" size={16} color={Colors.accent} />
                      <Text style={styles.tripClientName}>{trip.clientFirstName || (trip.clientName ? String(trip.clientName).split(" ")[0] : "Client")}</Text>
                      <Ionicons name="chevron-forward" size={12} color={Colors.textMuted} />
                    </Pressable>
                    {getRideFare(trip) ? <Text style={styles.tripPrice}>R {getRideFare(trip)}</Text> : null}
                  </View>
                  <View style={styles.tripAddrRow}>
                    <View style={styles.dotGreen} />
                    <Text style={styles.tripAddrText} numberOfLines={1}>{trip.pickupAddress || "Pickup"}</Text>
                  </View>
                  <View style={styles.tripAddrRow}>
                    <View style={styles.dotRed} />
                    <Text style={styles.tripAddrText} numberOfLines={1}>{trip.dropoffAddress || "Dropoff"}</Text>
                  </View>
                  <View style={styles.rideInfoPills}>
                    <View style={styles.rideInfoPill}>
                      <Ionicons name={getRidePaymentIcon(trip.paymentMethod)} size={12} color={Colors.white} />
                      <Text style={styles.rideInfoPillText}>{getRidePaymentLabel(trip.paymentMethod)}</Text>
                    </View>
                    <View style={styles.rideInfoPill}>
                      <Ionicons name={getRideRouteIcon(trip.selectedRouteId)} size={12} color={Colors.white} />
                      <Text style={styles.rideInfoPillText}>{getRideRouteLabel(trip.selectedRouteId)}</Text>
                    </View>
                  </View>
                  {trip.distKm != null && (
                    <Text style={styles.tripDist}>{trip.distKm.toFixed(1)} km away</Text>
                  )}
                  <Pressable
                    style={[styles.tripAcceptBtn, acceptingTripId === trip.id && { opacity: 0.6 }]}
                    onPress={() => acceptTripFromList(trip)}
                    disabled={!!acceptingTripId}
                  >
                    {acceptingTripId === trip.id
                      ? <ActivityIndicator size="small" color={Colors.primary} />
                      : <Text style={styles.tripAcceptBtnText}>Accept</Text>
                    }
                  </Pressable>
                </View>
              ))}
            </ScrollView>
          )}
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
          <Pressable style={styles.clientInfoButton} onPress={() => openClientProfile(currentRide.clientId)}>
            <View style={styles.addrRow}>
              <Ionicons name="person-outline" size={13} color={Colors.textMuted} />
              <Text style={[styles.addrText, { color: Colors.white }]}>{clientDisplayName}</Text>
            </View>
            <Ionicons name="chevron-forward" size={14} color={Colors.textMuted} />
          </Pressable>
          <View style={styles.addrRow}>
            <View style={styles.dotGreen} />
            <Text style={styles.addrText} numberOfLines={1}>{currentRide.pickupAddress || "Pickup"}</Text>
          </View>
          <View style={styles.addrRow}>
            <View style={styles.dotRed} />
            <Text style={styles.addrText} numberOfLines={1}>{currentRide.dropoffAddress || "Dropoff"}</Text>
          </View>
          <View style={styles.rideInfoPills}>
            <View style={styles.rideInfoPill}>
              <Ionicons name={getRidePaymentIcon(currentRide.paymentMethod)} size={12} color={Colors.white} />
              <Text style={styles.rideInfoPillText}>{getRidePaymentLabel(currentRide.paymentMethod)}</Text>
            </View>
            <View style={styles.rideInfoPill}>
              <Ionicons name={getRideRouteIcon(currentRide.selectedRouteId)} size={12} color={Colors.white} />
              <Text style={styles.rideInfoPillText}>{getRideRouteLabel(currentRide.selectedRouteId)}</Text>
            </View>
            {currentRide.durationMin ? (
              <View style={styles.rideInfoPill}>
                <Ionicons name="time-outline" size={12} color={Colors.white} />
                <Text style={styles.rideInfoPillText}>{Math.round(Number(currentRide.durationMin))} min</Text>
              </View>
            ) : null}
          </View>
          {routeAlternatives.length > 0 && (
            <View style={styles.cardRouteOptionsWrap}>
              <Text style={styles.cardRouteOptionsTitle}>{routeOptionsHeading}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cardRouteOptionsScroll}>
                {routeAlternatives.map((alt, i) => (
                  <Pressable
                    key={`${alt.polyline}-${i}`}
                    style={[styles.cardRouteOptionChip, selectedRouteIndex === i && styles.cardRouteOptionChipSelected]}
                    onPress={() => selectRoute(alt, i)}
                  >
                    <Text style={[styles.cardRouteOptionTitle, selectedRouteIndex === i && styles.cardRouteOptionTitleSelected]}>
                      {getRouteOptionTitle(i, alt.summary)}
                    </Text>
                    <Text style={[styles.cardRouteOptionMeta, selectedRouteIndex === i && styles.cardRouteOptionMetaSelected]}>
                      {alt.durationText} · {alt.distanceText}
                    </Text>
                    {calcRoutePrice(alt.distanceKm) ? (
                      <Text style={[styles.cardRouteOptionPrice, selectedRouteIndex === i && styles.cardRouteOptionTitleSelected]}>
                        {calcRoutePrice(alt.distanceKm)}
                      </Text>
                    ) : null}
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          )}
          {getRideFare(currentRide) ? <Text style={styles.priceText}>R {getRideFare(currentRide)}</Text> : null}
          <View style={styles.rideActions}>
            <Pressable style={styles.rideSecBtn} onPress={() => router.push({ pathname: "/chauffeur/chat", params: { rideId: currentRide.id, riderName: currentRide.clientFirstName || currentRide.clientName || "Client" } })}>
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
            <Pressable style={styles.actionBtn} onPress={startTripToDestination}>
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
              <Pressable style={styles.incomingClientButton} onPress={() => openClientProfile(incomingRide.clientId)}>
                <Text style={styles.incomingTitle}>
                  {incomingRide.clientFirstName ? `Pickup: ${incomingRide.clientFirstName}` : "New Ride Request"}
                </Text>
                <Ionicons name="chevron-forward" size={14} color={Colors.textMuted} />
              </Pressable>
              {getRideFare(incomingRide) ? <Text style={styles.incomingPrice}>R {getRideFare(incomingRide)}</Text> : null}
            </View>
            <View style={styles.addrRow}>
              <View style={styles.dotGreen} />
              <Text style={styles.addrText} numberOfLines={1}>{incomingRide.pickupAddress || "Pickup"}</Text>
            </View>
            <View style={styles.addrRow}>
              <View style={styles.dotRed} />
              <Text style={styles.addrText} numberOfLines={1}>{incomingRide.dropoffAddress || "Dropoff"}</Text>
            </View>
            <View style={styles.rideInfoPills}>
              <View style={styles.rideInfoPill}>
                <Ionicons name={getRidePaymentIcon(incomingRide.paymentMethod)} size={12} color={Colors.white} />
                <Text style={styles.rideInfoPillText}>{getRidePaymentLabel(incomingRide.paymentMethod)}</Text>
              </View>
              <View style={styles.rideInfoPill}>
                <Ionicons name={getRideRouteIcon(incomingRide.selectedRouteId)} size={12} color={Colors.white} />
                <Text style={styles.rideInfoPillText}>{getRideRouteLabel(incomingRide.selectedRouteId)}</Text>
              </View>
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

      {/* ─── Client profile modal ─── */}
      <Modal visible={showClientProfile} transparent animationType="slide" onRequestClose={() => setShowClientProfile(false)}>
        <View style={styles.profileModalOverlay}>
          <View style={styles.profileModalCard}>
            <View style={styles.profileHeader}>
              <Text style={styles.profileTitle}>Client Profile</Text>
              <Pressable onPress={() => setShowClientProfile(false)} style={styles.profileCloseBtn}>
                <Ionicons name="close" size={22} color={Colors.white} />
              </Pressable>
            </View>

            {clientProfileLoading ? (
              <View style={styles.profileLoadingWrap}>
                <ActivityIndicator size="large" color={Colors.accent} />
              </View>
            ) : clientProfile ? (
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.profileScrollContent}>
                <View style={styles.profileHero}>
                  <View style={styles.profileAvatar}>
                    <Text style={styles.profileAvatarText}>{clientProfile.clientName.charAt(0).toUpperCase()}</Text>
                  </View>
                  <Text style={styles.profilePersonName}>{clientProfile.clientName}</Text>
                  <Text style={styles.profileSubtext}>{clientProfile.clientPhone || "Phone not available"}</Text>
                  <Text style={styles.profileSubtext}>
                    Member since {new Date(clientProfile.memberSince).toLocaleDateString("en-ZA", { year: "numeric", month: "short" })}
                  </Text>
                </View>

                <View style={styles.profileStatsRow}>
                  <View style={styles.profileStatBox}>
                    <Text style={styles.profileStatValue}>
                      {clientProfile.clientRating !== null ? clientProfile.clientRating.toFixed(1) : "—"}
                    </Text>
                    <View style={styles.profileStarsRow}>
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Ionicons
                          key={star}
                          name={star <= Math.round(clientProfile.clientRating ?? 0) ? "star" : "star-outline"}
                          size={11}
                          color={Colors.warning}
                        />
                      ))}
                    </View>
                    <Text style={styles.profileStatLabel}>{clientProfile.totalRatings} ratings</Text>
                  </View>
                  <View style={styles.profileStatDivider} />
                  <View style={styles.profileStatBox}>
                    <Text style={styles.profileStatValue}>{clientProfile.completedTrips}</Text>
                    <Text style={styles.profileStatLabel}>Trips Completed</Text>
                  </View>
                </View>

                {clientProfile.totalRatings > 0 && (
                  <View style={styles.profileDistribution}>
                    <Text style={styles.profileSectionTitle}>Rating Breakdown</Text>
                    {[5, 4, 3, 2, 1].map((star) => {
                      const count = clientProfile.distribution[star] || 0;
                      const pct = clientProfile.totalRatings > 0 ? count / clientProfile.totalRatings : 0;
                      return (
                        <View key={star} style={styles.distRow}>
                          <Text style={styles.distLabel}>{star}</Text>
                          <Ionicons name="star" size={10} color={Colors.warning} />
                          <View style={styles.distBarBg}>
                            <View style={[styles.distBarFill, { flex: pct }]} />
                            <View style={{ flex: 1 - pct }} />
                          </View>
                          <Text style={styles.distCount}>{count}</Text>
                        </View>
                      );
                    })}
                  </View>
                )}

                {clientProfile.ratings.length > 0 ? (
                  <View style={styles.profileReviews}>
                    <Text style={styles.profileSectionTitle}>Recent Reviews</Text>
                    {clientProfile.ratings.map((review) => (
                      <View key={review.id} style={styles.reviewCard}>
                        <View style={styles.reviewHeader}>
                          <View style={styles.reviewAvatar}>
                            <Text style={styles.reviewAvatarText}>{review.reviewerName.charAt(0).toUpperCase()}</Text>
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.reviewerName}>{review.reviewerName}</Text>
                            <Text style={styles.reviewDate}>
                              {new Date(review.createdAt).toLocaleDateString("en-ZA", { year: "numeric", month: "short", day: "numeric" })}
                            </Text>
                          </View>
                          <View style={styles.reviewStars}>
                            {[1, 2, 3, 4, 5].map((star) => (
                              <Ionicons key={star} name={star <= review.rating ? "star" : "star-outline"} size={12} color={Colors.warning} />
                            ))}
                          </View>
                        </View>
                        {review.comment ? <Text style={styles.reviewComment}>{review.comment}</Text> : null}
                      </View>
                    ))}
                  </View>
                ) : (
                  <View style={styles.noReviewsContainer}>
                    <Ionicons name="chatbubble-outline" size={32} color={Colors.textMuted} />
                    <Text style={styles.noReviewsText}>No reviews yet</Text>
                  </View>
                )}
              </ScrollView>
            ) : null}
          </View>
        </View>
      </Modal>

      {/* ─── Post-trip payment popup ─── */}
      <Modal visible={!!completedTrip} transparent animationType="fade" onRequestClose={() => setCompletedTrip(null)}>
        <View style={styles.payPopupOverlay}>
          <View style={styles.payPopupCard}>
            {completedTrip?.paymentMethod === "cash" ? (
              <>
                <View style={styles.payPopupIconWrap}>
                  <Ionicons name="cash-outline" size={40} color={Colors.success} />
                </View>
                <Text style={styles.payPopupTitle}>Collect Cash Payment</Text>
                <Text style={styles.payPopupAmount}>R {getRideClientFare(completedTrip).toFixed(0)}</Text>
                <Text style={styles.payPopupBody}>
                  Please collect R {getRideClientFare(completedTrip).toFixed(0)} from {completedTrip?.clientFirstName || (completedTrip?.clientName ? String(completedTrip.clientName).split(" ")[0] : "the client")} before they exit the vehicle. Your net after 15% commission is R {getRideFare(completedTrip).toFixed(0)}.
                </Text>
              </>
            ) : (
              <>
                <View style={styles.payPopupIconWrap}>
                  <Text style={{ fontSize: 40 }}>💳</Text>
                </View>
                <Text style={styles.payPopupTitle}>Card Payment</Text>
                <Text style={styles.payPopupAmount}>R {getRideFare(completedTrip).toFixed(0)}</Text>
                <Text style={styles.payPopupBody}>
                  Your net after 15% commission is R {getRideFare(completedTrip).toFixed(0)}, which will reflect in your wallet shortly.
                </Text>
              </>
            )}
            <Pressable style={styles.payPopupBtn} onPress={beginClientRating}>
              <Text style={styles.payPopupBtnText}>Continue</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* ─── Post-trip client rating modal ─── */}
      <Modal visible={showClientRating} transparent animationType="fade" onRequestClose={closeClientRating}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={Platform.OS === "ios" ? 16 : 0}
          style={styles.ratingModalOverlay}
        >
          <ScrollView
            bounces={false}
            contentContainerStyle={styles.ratingModalScrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.ratingModalCard}>
              <Text style={styles.ratingModalTitle}>
                Rate {clientRatingRide?.clientFirstName || (clientRatingRide?.clientName ? String(clientRatingRide.clientName).split(" ")[0] : "Client")}
              </Text>
              <Text style={styles.ratingModalSubtitle}>This rating updates the client's profile and overall score.</Text>

              <View style={styles.ratingStarsRow}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <Pressable key={star} onPress={() => setClientRating(star)} hitSlop={8}>
                    <Ionicons name={star <= clientRating ? "star" : "star-outline"} size={34} color={Colors.warning} />
                  </Pressable>
                ))}
              </View>

              <TextInput
                value={clientRatingComment}
                onChangeText={setClientRatingComment}
                placeholder="Optional feedback"
                placeholderTextColor={Colors.textMuted}
                multiline
                style={styles.ratingCommentInput}
              />

              <View style={styles.ratingActionsRow}>
                <Pressable style={styles.ratingSecondaryBtn} onPress={closeClientRating} disabled={submittingClientRating}>
                  <Text style={styles.ratingSecondaryBtnText}>Skip</Text>
                </Pressable>
                <Pressable
                  style={[styles.ratingPrimaryBtn, (clientRating === 0 || submittingClientRating) && { opacity: 0.6 }]}
                  onPress={submitClientRating}
                  disabled={clientRating === 0 || submittingClientRating}
                >
                  {submittingClientRating ? (
                    <ActivityIndicator size="small" color={Colors.primary} />
                  ) : (
                    <Text style={styles.ratingPrimaryBtnText}>Submit</Text>
                  )}
                </Pressable>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

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

  floatEarnings: { position: "absolute", right: 16, minWidth: 86, borderRadius: 16, backgroundColor: GLASS, borderWidth: 1, borderColor: GLASS_BORDER, alignItems: "center", justifyContent: "center", paddingHorizontal: 12, paddingVertical: 8, zIndex: 5 },
  earningsLabel: { fontSize: 10, fontFamily: "Inter_400Regular", color: Colors.white, textTransform: "uppercase", letterSpacing: 0.5 },
  earningsAmount: { fontSize: 15, fontFamily: "Inter_700Bold", color: Colors.white },

  findingPill: { position: "absolute", alignSelf: "center", backgroundColor: GLASS, borderRadius: 24, paddingHorizontal: 20, paddingVertical: 10, borderWidth: 1, borderColor: GLASS_BORDER, zIndex: 5 },
  findingPillText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: Colors.white },

  // Available trips panel
  tripsPanel: { position: "absolute", left: 16, right: 16, backgroundColor: GLASS, borderRadius: 20, borderWidth: 1, borderColor: GLASS_BORDER, overflow: "hidden", zIndex: 5 },
  tripsPanelHeader: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: GLASS_BORDER },
  tripsPanelTitle: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: Colors.white, flex: 1 },
  tripsScroll: { maxHeight: 170 },
  tripsScrollContent: { flexDirection: "row", gap: 10, paddingHorizontal: 12, paddingVertical: 10 },
  tripCard: { width: 176, backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 14, padding: 12, gap: 8, borderWidth: 1, borderColor: GLASS_BORDER },
  tripCardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  tripClientRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  tripClientName: { fontSize: 14, fontFamily: "Inter_700Bold", color: Colors.white },
  tripPrice: { fontSize: 13, fontFamily: "Inter_700Bold", color: Colors.accent },
  tripAddrRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  tripAddrText: { flex: 1, fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.textMuted },
  rideInfoPills: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  rideInfoPill: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
  rideInfoPillText: { color: Colors.white, fontFamily: "Inter_600SemiBold", fontSize: 11 },
  tripDist: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.textMuted },
  tripAcceptBtn: { marginTop: 4, backgroundColor: Colors.white, borderRadius: 10, paddingVertical: 9, alignItems: "center" },
  tripAcceptBtnText: { fontSize: 13, fontFamily: "Inter_700Bold", color: Colors.primary },

  // Bottom cards
  bottomCard: { position: "absolute", left: 16, right: 16, backgroundColor: GLASS, borderRadius: 20, padding: 16, gap: 10, borderWidth: 1, borderColor: GLASS_BORDER, zIndex: 5 },
  rideCardHeader: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  rideCardTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.white, flex: 1 },
  etaText: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textMuted },
  priceText: { fontSize: 20, fontFamily: "Inter_700Bold", color: Colors.white },
  clientInfoButton: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },

  rideActions: { flexDirection: "row", gap: 8 },
  rideSecBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, backgroundColor: "rgba(255,255,255,0.09)", borderRadius: 10, paddingVertical: 9, borderWidth: 1, borderColor: GLASS_BORDER },
  rideSecBtnText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: Colors.white },
  cancelStyle: { backgroundColor: "rgba(255,77,77,0.08)", borderColor: "rgba(255,77,77,0.2)" },

  // Incoming
  incomingCard: { position: "absolute", left: 16, right: 16, backgroundColor: GLASS, borderRadius: 20, padding: 16, gap: 10, borderWidth: 1, borderColor: "rgba(255,183,77,0.3)", zIndex: 5 },
  incomingHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  incomingClientButton: { flex: 1, flexDirection: "row", alignItems: "center", gap: 4 },
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
  navModalRouteHint: { fontSize: 12, fontFamily: "Inter_500Medium", color: Colors.accent, marginTop: 4 },
  navModalClose: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.surface, alignItems: "center", justifyContent: "center" },
  navModalFooter: { paddingHorizontal: 20, paddingTop: 12, gap: 10 },
  navStepBox: { backgroundColor: Colors.primary, paddingHorizontal: 20, paddingVertical: 14, borderTopWidth: 1, borderTopColor: Colors.border },
  navStepRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  navArrowCircle: { width: 48, height: 48, borderRadius: 24, backgroundColor: Colors.accent, alignItems: "center", justifyContent: "center" },
  navStepInstruction: { fontSize: 17, fontFamily: "Inter_600SemiBold", color: Colors.white, lineHeight: 22 },
  navStepStreet: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textMuted, marginTop: 2 },
  navStepMeta: { flexDirection: "row", justifyContent: "space-between", marginTop: 8 },
  navStepDist: { fontSize: 13, fontFamily: "Inter_500Medium", color: Colors.success },
  navStepCount: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textMuted },

  // Floating nav bar (main map overlay)
  floatNavBar: { position: "absolute", left: 16, right: 16, backgroundColor: GLASS, borderRadius: 16, borderWidth: 1, borderColor: GLASS_BORDER, flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 10, gap: 10, zIndex: 10 },
  floatNavArrow: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.accent, alignItems: "center", justifyContent: "center" },
  floatNavContent: { flex: 1 },
  floatNavInstruction: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.white },
  floatNavMeta: { flexDirection: "row", gap: 8, marginTop: 2 },
  floatNavDist: { fontSize: 12, fontFamily: "Inter_500Medium", color: Colors.success },
  floatNavStep: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.textMuted },
  floatNavEta: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.accent },

  // Profile modal
  profileModalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  profileModalCard: { backgroundColor: Colors.primary, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 28, minHeight: "76%", maxHeight: "88%" },
  profileHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  profileTitle: { fontSize: 20, fontFamily: "Inter_700Bold", color: Colors.white },
  profileCloseBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.surface, alignItems: "center", justifyContent: "center" },
  profileLoadingWrap: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 32 },
  profileScrollContent: { paddingBottom: 24 },
  profileHero: { alignItems: "center", paddingVertical: 10 },
  profileAvatar: { width: 82, height: 82, borderRadius: 41, backgroundColor: Colors.accent, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  profileAvatarText: { fontSize: 30, fontFamily: "Inter_700Bold", color: Colors.white },
  profilePersonName: { fontSize: 22, fontFamily: "Inter_700Bold", color: Colors.white, textAlign: "center" },
  profileSubtext: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textMuted, textAlign: "center", marginTop: 4 },
  profileStatsRow: { flexDirection: "row", alignItems: "stretch", backgroundColor: Colors.surface, borderRadius: 18, paddingVertical: 18, paddingHorizontal: 12, marginTop: 18 },
  profileStatBox: { flex: 1, alignItems: "center", justifyContent: "center" },
  profileStatValue: { fontSize: 22, fontFamily: "Inter_700Bold", color: Colors.white },
  profileStatLabel: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textMuted, marginTop: 4, textAlign: "center" },
  profileStatDivider: { width: 1, backgroundColor: Colors.border, marginHorizontal: 12 },
  profileStarsRow: { flexDirection: "row", gap: 2, justifyContent: "center", marginTop: 4 },
  profileDistribution: { marginTop: 24, gap: 10 },
  profileSectionTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: Colors.white, marginBottom: 4 },
  distRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  distLabel: { width: 10, fontSize: 12, fontFamily: "Inter_500Medium", color: Colors.textMuted },
  distBarBg: { flex: 1, height: 8, borderRadius: 999, backgroundColor: Colors.surface, overflow: "hidden", flexDirection: "row" },
  distBarFill: { backgroundColor: Colors.warning, borderRadius: 999 },
  distCount: { width: 22, fontSize: 12, fontFamily: "Inter_500Medium", color: Colors.textMuted, textAlign: "right" },
  profileReviews: { marginTop: 24, gap: 12 },
  reviewCard: { backgroundColor: Colors.surface, borderRadius: 16, padding: 14, gap: 10 },
  reviewHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  reviewAvatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: Colors.accent, alignItems: "center", justifyContent: "center" },
  reviewAvatarText: { fontSize: 14, fontFamily: "Inter_700Bold", color: Colors.white },
  reviewerName: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.white },
  reviewDate: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.textMuted, marginTop: 2 },
  reviewStars: { flexDirection: "row", gap: 2 },
  reviewComment: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textSecondary, lineHeight: 20, paddingLeft: 44 },
  noReviewsContainer: { paddingVertical: 32, alignItems: "center", gap: 8 },
  noReviewsText: { fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.textMuted },

  // Post-trip payment popup
  payPopupOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.75)", alignItems: "center", justifyContent: "center", paddingHorizontal: 24 },
  payPopupCard: { width: "100%", backgroundColor: "#1a1a2e", borderRadius: 24, padding: 28, alignItems: "center", gap: 12, borderWidth: 1, borderColor: GLASS_BORDER },
  payPopupIconWrap: { width: 72, height: 72, borderRadius: 36, backgroundColor: "rgba(255,255,255,0.07)", alignItems: "center", justifyContent: "center", marginBottom: 4 },
  payPopupTitle: { fontSize: 20, fontFamily: "Inter_700Bold", color: Colors.white, textAlign: "center" },
  payPopupAmount: { fontSize: 36, fontFamily: "Inter_700Bold", color: Colors.white, textAlign: "center" },
  payPopupBody: { fontSize: 15, fontFamily: "Inter_400Regular", color: Colors.textMuted, textAlign: "center", lineHeight: 22 },
  payPopupBtn: { marginTop: 8, backgroundColor: Colors.white, borderRadius: 14, paddingHorizontal: 40, paddingVertical: 14, width: "100%", alignItems: "center" },
  payPopupBtnText: { fontSize: 16, fontFamily: "Inter_700Bold", color: Colors.primary },

  // Rating modal
  ratingModalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.75)" },
  ratingModalScrollContent: { flexGrow: 1, justifyContent: "center", paddingHorizontal: 20, paddingVertical: 24 },
  ratingModalCard: { width: "100%", backgroundColor: "#1a1a2e", borderRadius: 24, padding: 24, borderWidth: 1, borderColor: GLASS_BORDER, gap: 16 },
  ratingModalTitle: { fontSize: 20, fontFamily: "Inter_700Bold", color: Colors.white, textAlign: "center" },
  ratingModalSubtitle: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textMuted, textAlign: "center", lineHeight: 19 },
  ratingStarsRow: { flexDirection: "row", justifyContent: "center", gap: 10 },
  ratingCommentInput: { minHeight: 96, borderRadius: 16, backgroundColor: Colors.surface, color: Colors.white, fontFamily: "Inter_400Regular", paddingHorizontal: 14, paddingVertical: 12, textAlignVertical: "top", borderWidth: 1, borderColor: Colors.border },
  ratingActionsRow: { flexDirection: "row", gap: 10 },
  ratingSecondaryBtn: { flex: 1, borderRadius: 14, paddingVertical: 14, alignItems: "center", backgroundColor: "rgba(255,255,255,0.08)", borderWidth: 1, borderColor: GLASS_BORDER },
  ratingSecondaryBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: Colors.white },
  ratingPrimaryBtn: { flex: 1, borderRadius: 14, paddingVertical: 14, alignItems: "center", backgroundColor: Colors.white },
  ratingPrimaryBtnText: { fontSize: 15, fontFamily: "Inter_700Bold", color: Colors.primary },

  // Route options
  routeOptionsContainer: { paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border },
  routeOptionsTitle: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: Colors.textMuted, marginBottom: 8 },
  routeOptionCard: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, alignItems: "center", gap: 4, minWidth: 120 },
  routeOptionCardSelected: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  routeOptionName: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: Colors.white, textAlign: "center" },
  routeOptionDetail: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.textMuted, textAlign: "center" },
  routeOptionPrice: { fontSize: 13, fontFamily: "Inter_700Bold", color: Colors.accent, textAlign: "center", marginTop: 2 },
  cardRouteOptionsWrap: { gap: 8 },
  cardRouteOptionsTitle: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: Colors.textMuted },
  cardRouteOptionsScroll: { gap: 8 },
  cardRouteOptionChip: { minWidth: 118, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.07)", borderWidth: 1, borderColor: GLASS_BORDER, gap: 2 },
  cardRouteOptionChipSelected: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  cardRouteOptionTitle: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: Colors.white },
  cardRouteOptionTitleSelected: { color: Colors.primary },
  cardRouteOptionMeta: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.textMuted },
  cardRouteOptionMetaSelected: { color: Colors.primary },
  cardRouteOptionPrice: { fontSize: 13, fontFamily: "Inter_700Bold", color: Colors.accent, marginTop: 2 },
});

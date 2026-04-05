import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ActivityIndicator,
  Platform,
  Modal,
  FlatList,
  Alert,
  Linking,
  ScrollView,
  Image,
  KeyboardAvoidingView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Location from "expo-location";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import Animated, { FadeInDown, FadeInUp } from "react-native-reanimated";
import { useAuth } from "@/lib/auth-context";
import { apiRequest, queryClient } from "@/lib/query-client";
import { useSocket } from "@/lib/socket-context";
import { uploadDocument } from "@/lib/supabase-storage";
import Colors from "@/constants/colors";
import A2BMap from "@/components/A2BMap";

const VEHICLE_TYPES = [
  { id: "budget", name: "Budget", desc: "Toyota Corolla, Toyota Quest", icon: "car-outline" as const, pricePerKm: 7, baseFare: 50 },
  { id: "luxury", name: "Luxury", desc: "BMW 3 Series, Mercedes C Class", icon: "car-sport" as const, pricePerKm: 13, baseFare: 100 },
  { id: "business", name: "Business Class", desc: "BMW 5 Series, Mercedes E Class", icon: "briefcase" as const, pricePerKm: 35, baseFare: 150 },
  { id: "van", name: "Van", desc: "Hyundai H1, Mercedes Vito, Staria", icon: "bus" as const, pricePerKm: 35, baseFare: 120 },
  { id: "luxury_van", name: "Luxury Van", desc: "Mercedes V Class", icon: "car" as const, pricePerKm: 50, baseFare: 200 },
];

type RideStatus = "idle" | "selecting" | "confirming" | "requested" | "assigned" | "arriving" | "in_trip" | "completed" | "no_drivers";

interface ChauffeurDetails {
  id?: string;
  driverName: string;
  driverPhone: string | null;
  driverRating: number | null;
  totalRatings?: number;
  vehicleModel: string;
  plateNumber: string;
  carColor: string;
  carMake: string | null;
  vehicleType: string;
  profilePhoto: string | null;
}

interface DriverReview {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  reviewerName: string;
}

interface DriverProfile {
  id: string;
  driverName: string;
  driverRating: number | null;
  totalRatings: number;
  completedTrips: number;
  distribution: Record<number, number>;
  profilePhoto: string | null;
  carMake: string | null;
  vehicleModel: string;
  carColor: string;
  plateNumber: string;
  vehicleCategory: string;
  ratings: DriverReview[];
}

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function carColorToHex(color: string): string {
  const map: Record<string, string> = {
    Black: "#000000", White: "#FFFFFF", Silver: "#C0C0C0", Grey: "#808080",
    Gray: "#808080", Navy: "#1B2A4A", Burgundy: "#6B1C2A",
    "Midnight Blue": "#191970", Champagne: "#F7E7CE", Red: "#CC0000",
    Blue: "#1A56A0", Green: "#1A6B3C", Gold: "#C5A028",
  };
  return map[color] || "#888888";
}

export default function ClientHomeScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { on, off } = useSocket();

  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationLoading, setLocationLoading] = useState(true);
  const [pickupAddress, setPickupAddress] = useState("Current Location");
  const [dropoffAddress, setDropoffAddress] = useState("");
  const [dropoffCoords, setDropoffCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [selectedVehicle, setSelectedVehicle] = useState(VEHICLE_TYPES[0]);
  const [rideStatus, setRideStatus] = useState<RideStatus>("idle");
  const [estimatedPrice, setEstimatedPrice] = useState<number | null>(null);
  const [estimatedDistance, setEstimatedDistance] = useState<number | null>(null);
  const [lateNightPremium, setLateNightPremium] = useState<number>(0);
  const [currentRide, setCurrentRide] = useState<any>(null);
  const [showVehicleSheet, setShowVehicleSheet] = useState(false);
  const [chauffeurDetails, setChauffeurDetails] = useState<ChauffeurDetails | null>(null);
  const [routePolyline, setRoutePolyline] = useState<string | null>(null);
  const [tripDurationText, setTripDurationText] = useState<string | null>(null);
  const [tripDurationMin, setTripDurationMin] = useState<number | null>(null);
  const [driverLocation, setDriverLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [etaText, setEtaText] = useState<string | null>(null);
  const [showRating, setShowRating] = useState(false);
  const [rating, setRating] = useState<number>(0);
  const [ratingComment, setRatingComment] = useState<string>("");
  const [submittingRating, setSubmittingRating] = useState(false);
  const [onlineDrivers, setOnlineDrivers] = useState<{ id: string; lat: number; lng: number }[]>([]);
  const [showPaymentPicker, setShowPaymentPicker] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card" | "wallet">("cash");
  const [savedCards, setSavedCards] = useState<{ id: string; last4: string; cardType: string; isDefault: boolean }[]>([]);

  // Cash liveness flow
  const [showCashLiveness, setShowCashLiveness] = useState(false);
  const [livenessSessionId, setLivenessSessionId] = useState<string | null>(null);
  const [livenessChallenge, setLivenessChallenge] = useState<string>("");
  const [livenessAttempts, setLivenessAttempts] = useState(0);
  const [livenessMaxAttempts, setLivenessMaxAttempts] = useState(3);
  const [livenessSelfieLocalUri, setLivenessSelfieLocalUri] = useState<string | null>(null);
  const [livenessSelfieUrl, setLivenessSelfieUrl] = useState<string | null>(null);
  const [livenessPassed, setLivenessPassed] = useState(false);
  const [livenessBusy, setLivenessBusy] = useState(false);
  const [livenessMessage, setLivenessMessage] = useState<string>("");

  // Driver profile modal
  const [showDriverProfile, setShowDriverProfile] = useState(false);
  const [driverProfile, setDriverProfile] = useState<DriverProfile | null>(null);
  const [driverProfileLoading, setDriverProfileLoading] = useState(false);

  // Notification badge
  const [unreadCount, setUnreadCount] = useState(0);

  // Live driver ETA notification state
  const [liveEtaMin, setLiveEtaMin] = useState<number | null>(null);
  const [initialEtaMin, setInitialEtaMin] = useState<number | null>(null);

  // ETA to nearest available driver (shown on map in idle/selecting state)
  const [nearestDriverEta, setNearestDriverEta] = useState<string | null>(null);

  // Location picker modal
  const [locationPickerVisible, setLocationPickerVisible] = useState(false);
  const [locationPickerTarget, setLocationPickerTarget] = useState<"pickup" | "dropoff">("dropoff");
  const [locationPickerQuery, setLocationPickerQuery] = useState("");
  const [locationSuggestions, setLocationSuggestions] = useState<{ placeId: string; description: string; mainText: string; secondaryText: string; lat: number; lng: number }[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const autocompleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep a ref so socket callbacks always see the latest ride without stale closure
  const currentRideRef = useRef<any>(null);
  useEffect(() => {
    currentRideRef.current = currentRide;
  }, [currentRide]);

  useEffect(() => {
    requestLocation();
  }, []);

  // Poll unread notification count for badge
  useEffect(() => {
    if (!user?.id) return;
    async function fetchUnread() {
      try {
        const res = await apiRequest("GET", `/api/notifications/user/${user!.id}`);
        const data = await res.json();
        const count = Array.isArray(data) ? data.filter((n: any) => !n.isRead).length : 0;
        setUnreadCount(count);
      } catch {}
    }
    fetchUnread();
    const interval = setInterval(fetchUnread, 20000);
    return () => clearInterval(interval);
  }, [user?.id]);

  // Fetch online drivers periodically to show on map and compute nearest ETA
  useEffect(() => {
    async function fetchOnlineDrivers() {
      try {
        const res = await apiRequest("GET", "/api/chauffeurs");
        const all = await res.json();
        const online = (all as any[])
          .filter((c: any) => c.isOnline && c.isApproved && c.lat && c.lng)
          .map((c: any) => ({ id: String(c.id), lat: Number(c.lat), lng: Number(c.lng) }));
        setOnlineDrivers(online);

        // Compute ETA to nearest driver using haversine distance
        if (online.length > 0 && location) {
          let minDist = Infinity;
          for (const d of online) {
            const dist = haversineDistance(location.lat, location.lng, d.lat, d.lng);
            if (dist < minDist) minDist = dist;
          }
          // Assume ~30 km/h average speed in city
          const etaMin = Math.max(1, Math.round((minDist / 30) * 60));
          setNearestDriverEta(etaMin <= 1 ? "< 1 min away" : `~${etaMin} min away`);
        } else {
          setNearestDriverEta(null);
        }
      } catch {}
    }
    fetchOnlineDrivers();
    const interval = setInterval(fetchOnlineDrivers, 20000);
    return () => clearInterval(interval);
  }, [location]);

  // Draw route line as soon as pickup + dropoff are both known
  useEffect(() => {
    if (location && dropoffCoords) {
      fetchRoute(location, dropoffCoords);
    } else {
      setRoutePolyline(null);
    }
  }, [dropoffCoords?.lat, dropoffCoords?.lng]);

  // Cancel ride and show "no drivers" if no driver accepts within 45 seconds
  useEffect(() => {
    if (rideStatus !== "requested") return;
    const timeout = setTimeout(async () => {
      if (currentRideRef.current) {
        try {
          await apiRequest("PUT", `/api/rides/${currentRideRef.current.id}/status`, { status: "cancelled" });
        } catch {}
      }
      setCurrentRide(null);
      setRoutePolyline(null);
      setDriverLocation(null);
      setRideStatus("no_drivers");
      queryClient.invalidateQueries({ queryKey: ["/api/rides/client"] });
    }, 120000);
    return () => clearTimeout(timeout);
  }, [rideStatus]);

  async function fetchChauffeurDetails(chauffeurId: string) {
    try {
      const res = await apiRequest("GET", `/api/chauffeurs/${chauffeurId}/details`);
      const details = await res.json();
      setChauffeurDetails(details);
    } catch {}
  }

  async function openDriverProfile() {
    const chauffeurId = chauffeurDetails?.id;
    if (!chauffeurId) return;
    setDriverProfileLoading(true);
    setShowDriverProfile(true);
    try {
      const res = await apiRequest("GET", `/api/chauffeurs/${chauffeurId}/profile`);
      const data = await res.json();
      setDriverProfile(data);
    } catch {
      Alert.alert("Error", "Could not load driver profile.");
      setShowDriverProfile(false);
    } finally {
      setDriverProfileLoading(false);
    }
  }

  function openLocationPicker(target: "pickup" | "dropoff") {
    const current = target === "pickup" ? pickupAddress : dropoffAddress;
    setLocationPickerTarget(target);
    setLocationPickerQuery(current === "Current Location" ? "" : current);
    setLocationSuggestions([]);
    setLocationPickerVisible(true);
  }

  function onLocationQueryChange(text: string) {
    setLocationPickerQuery(text);
    // Clear previously resolved coords when user edits the query
    if (locationPickerTarget === "dropoff") setDropoffCoords(null);
    if (locationPickerTarget === "pickup") setLocation(null);
    if (autocompleteTimerRef.current) clearTimeout(autocompleteTimerRef.current);
    if (text.trim().length < 2) {
      setLocationSuggestions([]);
      return;
    }
    autocompleteTimerRef.current = setTimeout(async () => {
      setSuggestionsLoading(true);
      try {
        const res = await apiRequest("GET", `/api/places/autocomplete?input=${encodeURIComponent(text)}`);
        const data = await res.json();
        setLocationSuggestions(data.predictions || []);
      } catch {
        setLocationSuggestions([]);
      } finally {
        setSuggestionsLoading(false);
      }
    }, 350);
  }

  async function selectSuggestion(suggestion: { placeId: string; description: string; mainText: string; secondaryText: string; lat: number | null; lng: number | null }) {
    try {
      setSuggestionsLoading(true);
      let coords = (suggestion.lat && suggestion.lng) ? { lat: suggestion.lat, lng: suggestion.lng } : null;

      if (!coords) {
        // Try API details endpoint first
        try {
          const res = await apiRequest("GET", `/api/places/details?placeId=${encodeURIComponent(suggestion.placeId)}`);
          const data = await res.json();
          if (data.lat && data.lng) {
            coords = { lat: data.lat, lng: data.lng };
          }
        } catch {}
      }

      // Fallback: geocode the description text directly
      if (!coords) {
        try {
          const res = await apiRequest("GET", `/api/geocode?address=${encodeURIComponent(suggestion.description)}`);
          const data = await res.json();
          if (data.lat && data.lng) {
            coords = { lat: data.lat, lng: data.lng };
          }
        } catch {}
      }

      // Last resort: expo-location geocoder (native only)
      if (!coords && Platform.OS !== "web") {
        try {
          const results = await Location.geocodeAsync(suggestion.description);
          if (results.length > 0) {
            coords = { lat: results[0].latitude, lng: results[0].longitude };
          }
        } catch {}
      }

      if (!coords) {
        Alert.alert("Location not found", "Could not resolve this address. Please try a different search.");
        return;
      }

      const address = suggestion.description;
      if (locationPickerTarget === "pickup") {
        setLocation(coords);
        setPickupAddress(address);
      } else {
        setDropoffCoords(coords);
        setDropoffAddress(address);
      }
      setLocationPickerVisible(false);
      setLocationSuggestions([]);
    } catch {
      Alert.alert("Error", "Could not load location details. Try again.");
    } finally {
      setSuggestionsLoading(false);
    }
  }

  async function useCurrentLocationForPickup() {
    setLocationPickerVisible(false);
    setLocationLoading(true);
    await requestLocation();
  }

  // Apply a ride status update received from socket or polling
  const applyRideUpdate = useCallback((ride: any) => {
    if (ride.status === "cancelled") return;
    setCurrentRide(ride);
    if (ride.status === "chauffeur_assigned") {
      setRideStatus("assigned");
      setLiveEtaMin(null);
      setInitialEtaMin(null);
      if (ride.chauffeurId) {
        fetchChauffeurDetails(ride.chauffeurId);
        // Fetch driver's current location to show route from driver → pickup
        apiRequest("GET", `/api/chauffeurs/${ride.chauffeurId}`).then(r => r.json()).then((c: any) => {
          if (c.lat && c.lng && ride.pickupLat && ride.pickupLng) {
            const driverLoc = { lat: c.lat, lng: c.lng };
            setDriverLocation(driverLoc);
            fetchRoute(driverLoc, { lat: ride.pickupLat, lng: ride.pickupLng });
            // Set initial ETA from haversine distance (will be refined by route API)
            const dist = haversineDistance(c.lat, c.lng, parseFloat(ride.pickupLat), parseFloat(ride.pickupLng));
            const eta = Math.max(1, Math.round((dist / 30) * 60));
            setInitialEtaMin(eta);
            setLiveEtaMin(eta);
          }
        }).catch(() => {});
      }
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else if (ride.status === "chauffeur_arriving") {
      setRideStatus("arriving");
    } else if (ride.status === "trip_started") {
      setRideStatus("in_trip");
      // Switch route to driver → dropoff
      if (ride.dropoffLat && ride.dropoffLng) {
        setDriverLocation((prev) => {
          if (prev) fetchRoute(prev, { lat: ride.dropoffLat, lng: ride.dropoffLng });
          return prev;
        });
      }
    } else if (ride.status === "trip_completed") {
      setRideStatus("completed");
      setTimeout(() => setShowRating(true), 1000);
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["/api/rides/client"] });
    }
  }, []);

  useEffect(() => {
    // Use ref so the callback always sees the latest ride id without re-registering
    const handleStatusUpdate = (ride: any) => {
      const active = currentRideRef.current;
      if (active && ride.id === active.id) {
        applyRideUpdate(ride);
      }
    };

    on("ride:statusUpdate", handleStatusUpdate);
    on("ride:accepted", handleStatusUpdate);

    return () => {
      off("ride:statusUpdate", handleStatusUpdate);
      off("ride:accepted", handleStatusUpdate);
    };
  }, []); // register once — uses ref internally

  // Polling fallback: while searching, poll every 4s in case socket event is missed
  useEffect(() => {
    if (rideStatus !== "requested" || !currentRide?.id) return;

    const pollId = setInterval(async () => {
      try {
        const res = await apiRequest("GET", `/api/rides/${currentRideRef.current?.id}`);
        const ride = await res.json();
        if (ride.status && ride.status !== "searching" && ride.status !== "requested") {
          applyRideUpdate(ride);
        }
      } catch {}
    }, 2000);

    return () => clearInterval(pollId);
  }, [rideStatus, currentRide?.id]);

  useEffect(() => {
    const handleDriverLocation = (data: any) => {
      if (currentRide && data.chauffeurId === currentRide.chauffeurId) {
        const driverLoc = { lat: data.lat, lng: data.lng };
        setDriverLocation(driverLoc);

        // Recompute live ETA from driver to client (assigned/arriving) or to dropoff (in_trip)
        const destLat = rideStatus === "in_trip"
          ? parseFloat(currentRide.dropoffLat)
          : location?.lat ?? parseFloat(currentRide.pickupLat);
        const destLng = rideStatus === "in_trip"
          ? parseFloat(currentRide.dropoffLng)
          : location?.lng ?? parseFloat(currentRide.pickupLng);

        const distKm = haversineDistance(driverLoc.lat, driverLoc.lng, destLat, destLng);
        const etaMin = Math.max(1, Math.round((distKm / 30) * 60));
        setEtaText(etaMin <= 1 ? "Arriving now" : `${etaMin} min away`);
        // Update live ETA for notification banner
        setLiveEtaMin(etaMin);
        setInitialEtaMin(prev => prev ?? etaMin);
      }
    };
    on("location:update", handleDriverLocation);
    return () => { off("location:update", handleDriverLocation); };
  }, [currentRide, rideStatus, location]);

  // Fallback: decrease ETA by 1 every 60s when no location updates come in
  useEffect(() => {
    if (rideStatus !== "assigned" && rideStatus !== "arriving") return;
    const timer = setInterval(() => {
      setLiveEtaMin(prev => prev !== null && prev > 0 ? prev - 1 : prev);
    }, 60000);
    return () => clearInterval(timer);
  }, [rideStatus]);

  // Reset ETA state when trip starts or ends
  useEffect(() => {
    if (rideStatus === "in_trip" || rideStatus === "completed" || rideStatus === "idle") {
      setLiveEtaMin(null);
      setInitialEtaMin(null);
    }
  }, [rideStatus]);

  async function fetchRoute(origin: { lat: number; lng: number }, dest: { lat: number; lng: number }) {
    try {
      const res = await apiRequest("GET",
        `/api/directions?originLat=${origin.lat}&originLng=${origin.lng}&destLat=${dest.lat}&destLng=${dest.lng}`
      );
      const data = await res.json();
      if (data.polyline) {
        setRoutePolyline(data.polyline);
        if (data.durationText) setTripDurationText(data.durationText);
        if (data.durationMin) {
          setTripDurationMin(data.durationMin);
          // Refine live ETA from accurate route calculation
          setLiveEtaMin(data.durationMin);
          setInitialEtaMin(prev => prev ?? data.durationMin);
        }
        if (data.distanceKm) setEstimatedDistance(Math.round(data.distanceKm * 10) / 10);
        setEtaText(`ETA: ${data.durationText}`);
      }
    } catch {}
  }

  async function requestLocation() {
    try {
      if (Platform.OS === "web") {
        try {
          const position = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 });
          });
          setLocation({ lat: position.coords.latitude, lng: position.coords.longitude });
          try {
            const res = await apiRequest("GET", `/api/places/reverse?lat=${position.coords.latitude}&lng=${position.coords.longitude}`);
            const data = await res.json();
            setPickupAddress(data.description || "Current Location");
          } catch {
            setPickupAddress("Current Location");
          }
        } catch {
          setLocation({ lat: -26.2041, lng: 28.0473 });
          setPickupAddress("Johannesburg, South Africa");
        }
        setLocationLoading(false);
        return;
      }
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === "granted") {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        setLocation({ lat: loc.coords.latitude, lng: loc.coords.longitude });
        try {
          const res = await apiRequest("GET", `/api/places/reverse?lat=${loc.coords.latitude}&lng=${loc.coords.longitude}`);
          const data = await res.json();
          if (data.description) setPickupAddress(data.description);
        } catch {}
      } else {
        setLocation({ lat: -26.2041, lng: 28.0473 });
        setPickupAddress("Johannesburg, South Africa");
      }
    } catch (e) {
      setLocation({ lat: -26.2041, lng: 28.0473 });
      setPickupAddress("Johannesburg, South Africa");
    } finally {
      setLocationLoading(false);
    }
  }

  async function geocodeDestination(): Promise<{ lat: number; lng: number } | null> {
    if (!dropoffAddress.trim()) return null;
    if (Platform.OS !== "web") {
      try {
        const results = await Location.geocodeAsync(dropoffAddress);
        if (results.length > 0) {
          return { lat: results[0].latitude, lng: results[0].longitude };
        }
      } catch {}
    }
    try {
      const res = await apiRequest("GET", `/api/geocode?address=${encodeURIComponent(dropoffAddress)}`);
      const data = await res.json();
      if (data.lat && data.lng) {
        return { lat: data.lat, lng: data.lng };
      }
    } catch {}
    return null;
  }

  async function getEstimate() {
    if (!dropoffAddress.trim()) {
      Alert.alert("Enter Destination", "Please enter your dropoff location");
      return;
    }
    if (!location) {
      Alert.alert("Location Error", "Unable to determine your location");
      return;
    }
    try {
      // Use already-resolved coords from autocomplete selection, or geocode the typed address
      const dest = dropoffCoords ?? await geocodeDestination();
      if (!dest) {
        Alert.alert("Error", "Could not determine destination. Please select from the suggestions.");
        return;
      }
      setDropoffCoords(dest);
      const distanceKm = haversineDistance(location.lat, location.lng, dest.lat, dest.lng) * 1.3;
      const finalDistance = Math.max(distanceKm, 2);
      setEstimatedDistance(Math.round(finalDistance * 10) / 10);

      const res = await apiRequest("POST", "/api/pricing/estimate", {
        distanceKm: finalDistance,
        categoryId: selectedVehicle.id,
        isLateNight: new Date().getHours() >= 22 || new Date().getHours() < 5,
      });
      const data = await res.json();
      setEstimatedPrice(data.totalPrice);
      setLateNightPremium(data.lateNightPremium || 0);
      setRideStatus("confirming");
      if (location && dest) {
        fetchRoute(location, dest);
      }
    } catch (e) {
      Alert.alert("Error", "Failed to get estimate");
    }
  }

  async function requestRide() {
    if (!user || !location || !dropoffCoords) return;
    try {
      const res = await apiRequest("GET", "/api/payments/cards");
      const cards = await res.json();
      setSavedCards(Array.isArray(cards) ? cards : []);
    } catch {
      setSavedCards([]);
    }
    setShowPaymentPicker(true);
  }

  async function createRideRecord(
    method: "cash" | "card" | "wallet",
    extras: Record<string, unknown> = {},
  ) {
    if (!user || !location || !dropoffCoords) return null;
    const distanceKm = estimatedDistance || 10;
    const res = await apiRequest("POST", "/api/rides", {
      clientId: user.id,
      pickupLat: location.lat,
      pickupLng: location.lng,
      pickupAddress,
      dropoffLat: dropoffCoords.lat,
      dropoffLng: dropoffCoords.lng,
      dropoffAddress,
      vehicleType: selectedVehicle.id,
      distanceKm,
      paymentMethod: method,
      paymentStatus: method === "cash" ? "unpaid" : "pending",
      isLateNight: new Date().getHours() >= 22 || new Date().getHours() < 5,
      ...extras,
    });
    const payload = await res.json();
    return payload.ride ?? payload;
  }

  function resetCashLiveness(closeModal = false) {
    if (closeModal) setShowCashLiveness(false);
    setLivenessSessionId(null);
    setLivenessChallenge("");
    setLivenessAttempts(0);
    setLivenessMaxAttempts(3);
    setLivenessSelfieLocalUri(null);
    setLivenessSelfieUrl(null);
    setLivenessPassed(false);
    setLivenessBusy(false);
    setLivenessMessage("");
  }

  async function openCashLivenessFlow() {
    if (!user) return;
    setShowCashLiveness(true);
    setLivenessBusy(true);
    setLivenessMessage("Creating secure liveness session...");
    try {
      const res = await apiRequest("POST", "/api/liveness/session", {});
      const data = await res.json();
      setLivenessSessionId(data.sessionId || null);
      setLivenessChallenge(data.challenge || "Blink and smile");
      setLivenessAttempts(Number(data.attempts || 0));
      setLivenessMaxAttempts(Number(data.maxAttempts || 3));
      setLivenessMessage("Session ready. Capture your selfie to continue.");
    } catch (error: any) {
      setLivenessMessage(error?.message || "Could not start liveness verification.");
    } finally {
      setLivenessBusy(false);
    }
  }

  async function captureAndVerifyLiveness() {
    if (!user || !livenessSessionId) return;
    setLivenessBusy(true);
    setLivenessMessage("Opening camera...");
    try {
      if (Platform.OS !== "web") {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== "granted") {
          Alert.alert("Permission needed", "Please allow camera access to continue cash verification.");
          setLivenessBusy(false);
          return;
        }
      }

      const result = await ImagePicker.launchCameraAsync({
        quality: 0.7,
        allowsEditing: true,
        aspect: [1, 1],
        cameraType: ImagePicker.CameraType.front,
      });

      if (result.canceled || !result.assets?.[0]) {
        setLivenessMessage("Capture cancelled.");
        setLivenessBusy(false);
        return;
      }

      const selfieUri = result.assets[0].uri;
      setLivenessSelfieLocalUri(selfieUri);
      setLivenessMessage("Uploading selfie securely...");
      const uploadedUrl = await uploadDocument(selfieUri, user.id, "cash_liveness_selfie");
      setLivenessSelfieUrl(uploadedUrl);

      setLivenessMessage("Verifying liveness...");
      const verifyRes = await apiRequest("POST", "/api/liveness/verify", {
        sessionId: livenessSessionId,
        selfieUrl: uploadedUrl,
      });
      const verifyData = await verifyRes.json();

      const passed = Boolean(verifyData?.passed);
      setLivenessPassed(passed);
      setLivenessAttempts((prev) => prev + 1);
      setLivenessMessage(
        passed
          ? "Verification passed. You can now continue with cash booking."
          : "Verification failed. Please retake your selfie.",
      );
    } catch (error: any) {
      setLivenessMessage(error?.message || "Liveness verification failed. Please try again.");
    } finally {
      setLivenessBusy(false);
    }
  }

  async function continueWithVerifiedCashRide() {
    if (!livenessPassed || !livenessSessionId || !livenessSelfieUrl) {
      Alert.alert("Verification Required", "Please complete liveness verification first.");
      return;
    }
    try {
      const ride = await createRideRecord("cash", {
        livenessSessionId,
        livenessStatus: "passed",
        livenessProvider: "mock",
        livenessVerifiedAt: new Date().toISOString(),
        cashSelfieUrl: livenessSelfieUrl,
      });
      if (!ride) return;

      setCurrentRide(ride);
      setRideStatus("requested");
      resetCashLiveness(true);
      queryClient.invalidateQueries({ queryKey: ["/api/rides/client", user?.id] });
      if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {
      Alert.alert("Error", "Failed to request cash ride. Please try again.");
    }
  }

  async function handlePayAndRide(method: "cash" | "card" | "wallet") {
    if (!user || !location || !dropoffCoords) return;
    setShowPaymentPicker(false);

    if (method === "cash") {
      setPaymentMethod("cash");
      openCashLivenessFlow();
      return;
    }

    try {
      const ride = await createRideRecord(method);
      if (!ride) return;

      if (method === "wallet") {
        const payRes = await apiRequest("POST", "/api/payments/pay-wallet", { rideId: ride.id });
        const payData = await payRes.json();
        if (!payData.success) {
          await apiRequest("PUT", `/api/rides/${ride.id}/status`, { status: "cancelled" }).catch(() => {});
          Alert.alert("Payment Failed", payData.message || "Insufficient wallet balance.");
          return;
        }
        setCurrentRide(ride);
        setRideStatus("requested");
        queryClient.invalidateQueries({ queryKey: ["/api/rides/client", user.id] });
        if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        return;
      }

      if (method === "card") {
        try {
          const chargeRes = await apiRequest("POST", "/api/payments/charge-ride", { rideId: ride.id });
          const chargeData = await chargeRes.json();
          if (!chargeData.success) {
            await apiRequest("PUT", `/api/rides/${ride.id}/status`, { status: "cancelled" }).catch(() => {});
            if (chargeData.needsCard) {
              Alert.alert(
                "No Card Saved",
                "Please add a card in your wallet to pay by card.",
                [
                  { text: "Go to Wallet", onPress: () => router.push("/client/wallet") },
                  { text: "Pay Cash Instead", onPress: () => handlePayAndRide("cash") },
                  { text: "Cancel", style: "cancel" },
                ]
              );
            } else {
              Alert.alert(
                "Payment Failed",
                chargeData.message || "Card could not be charged.",
                [
                  { text: "Pay Cash", onPress: () => handlePayAndRide("cash") },
                  { text: "Cancel", style: "cancel" },
                ]
              );
            }
            return;
          }
          setCurrentRide(ride);
          setRideStatus("requested");
          queryClient.invalidateQueries({ queryKey: ["/api/rides/client", user.id] });
          if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        } catch {
          await apiRequest("PUT", `/api/rides/${ride.id}/status`, { status: "cancelled" }).catch(() => {});
          Alert.alert(
            "Payment Error",
            "Could not process card. Please try again or pay cash.",
            [
              { text: "Pay Cash", onPress: () => handlePayAndRide("cash") },
              { text: "Cancel", style: "cancel" },
            ]
          );
        }
      }
    } catch {
      Alert.alert("Error", "Failed to request ride. Please try again.");
    }
  }

  function cancelRide() {
    if (currentRide) {
      apiRequest("PUT", `/api/rides/${currentRide.id}/status`, { status: "cancelled" }).catch(() => {});
    }
    if (user?.id) queryClient.invalidateQueries({ queryKey: ["/api/rides/client", user.id] });
    setRideStatus("idle");
    setCurrentRide(null);
    setEstimatedPrice(null);
    setEstimatedDistance(null);
    setDropoffAddress("");
    setDropoffCoords(null);
    setRoutePolyline(null);
    setTripDurationText(null);
    setTripDurationMin(null);
    setDriverLocation(null);
    setEtaText(null);
  }

  async function submitRating() {
    if (!currentRide || rating === 0) {
      Alert.alert("Rating Required", "Please select a rating");
      return;
    }
    try {
      setSubmittingRating(true);
      await apiRequest("POST", `/api/rides/${currentRide.id}/rate`, {
        rating,
        comment: ratingComment.trim() || null,
      });
      setShowRating(false);
      resetAfterComplete();
      Alert.alert("Thank You", "Your rating has been submitted!");
    } catch (error: any) {
      Alert.alert("Error", error.message || "Failed to submit rating");
    } finally {
      setSubmittingRating(false);
    }
  }

  function resetAfterComplete() {
    setRideStatus("idle");
    setCurrentRide(null);
    setEstimatedPrice(null);
    setEstimatedDistance(null);
    setDropoffAddress("");
    setDropoffCoords(null);
    setChauffeurDetails(null);
    setRoutePolyline(null);
    setDriverLocation(null);
    setEtaText(null);
    setShowRating(false);
    setRating(0);
    setRatingComment("");
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 0) }]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.brandName}>A2B LIFT</Text>
          <Text style={styles.brandSlogan}>Premium Ride Experience</Text>
        </View>
        <View style={styles.headerRight}>
          {/* Notification bell */}
          <Pressable style={styles.bellBtn} onPress={() => router.push("/client/notifications")} hitSlop={8}>
            <Ionicons name="notifications-outline" size={22} color={Colors.white} />
            {unreadCount > 0 && (
              <View style={styles.notifBadge}>
                <Text style={styles.notifBadgeText}>{unreadCount > 9 ? "9+" : unreadCount}</Text>
              </View>
            )}
          </Pressable>
          {/* Profile icon */}
          <Pressable style={styles.avatarCircle} onPress={() => router.push("/client/profile")} hitSlop={8}>
            <Ionicons name="person" size={18} color={Colors.white} />
          </Pressable>
        </View>
      </View>

      <View style={styles.mapArea}>
        <A2BMap
          pickupLocation={location}
          dropoffLocation={dropoffCoords}
          driverLocation={driverLocation}
          nearbyDrivers={onlineDrivers}
          routePolyline={routePolyline}
          showDriver={rideStatus === "assigned" || rideStatus === "arriving" || rideStatus === "in_trip"}
          followDriver={rideStatus === "arriving" || rideStatus === "in_trip"}
          loading={locationLoading}
          etaText={etaText || undefined}
          statusText={
            rideStatus === "in_trip" ? "Trip In Progress" : undefined
          }
        />

        {/* Nearest driver ETA pill — shown when idle and drivers are nearby */}
        {(rideStatus === "idle" || rideStatus === "selecting") && nearestDriverEta && onlineDrivers.length > 0 && (
          <View style={styles.nearbyEtaPill}>
            <View style={styles.nearbyEtaDot} />
            <Text style={styles.nearbyEtaText}>
              {onlineDrivers.length} driver{onlineDrivers.length > 1 ? "s" : ""} nearby · {nearestDriverEta}
            </Text>
          </View>
        )}

        {/* Route info overlay — shows arrival time and distance on map when route is drawn */}
        {routePolyline && (rideStatus === "selecting" || rideStatus === "confirming") && (estimatedDistance || tripDurationText) && (() => {
          const arrivalTime = tripDurationMin
            ? new Date(Date.now() + tripDurationMin * 60 * 1000)
            : null;
          const arrivalStr = arrivalTime
            ? arrivalTime.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit", hour12: false })
            : null;
          return (
            <View style={styles.routeInfoOverlay}>
              {arrivalStr && (
                <View style={styles.arrivalPill}>
                  <Ionicons name="time-outline" size={13} color="#fff" />
                  <Text style={styles.arrivalPillText}>Arrive by {arrivalStr}</Text>
                </View>
              )}
              {(estimatedDistance || tripDurationText) && (
                <View style={styles.routeMetaPill}>
                  {estimatedDistance && <Text style={styles.routeMetaText}>{estimatedDistance} km</Text>}
                  {estimatedDistance && tripDurationText && <Text style={styles.routeMetaSep}> · </Text>}
                  {tripDurationText && <Text style={styles.routeMetaText}>{tripDurationText}</Text>}
                </View>
              )}
            </View>
          );
        })()}

        {/* Searching for driver overlay — shows on map like Uber/Taxify */}
        {rideStatus === "requested" && (
          <View style={styles.searchingMapOverlay}>
            <View style={styles.searchingPulseRing} />
            <View style={styles.searchingPulseRing2} />
            <View style={styles.searchingMapCard}>
              <ActivityIndicator size="small" color={Colors.primary} />
              <View>
                <Text style={styles.searchingMapTitle}>Finding your chauffeur</Text>
                <Text style={styles.searchingMapSub}>{selectedVehicle.name} · {selectedVehicle.desc?.split(",")[0]}</Text>
              </View>
            </View>
          </View>
        )}

        {/* Live driver notification banner — floats above map when driver is on the way */}
        {(rideStatus === "assigned" || rideStatus === "arriving") && chauffeurDetails && (
          <Animated.View entering={FadeInDown.duration(500)} style={styles.liveNotifBanner}>
            <View style={styles.liveNotifRow}>
              <View style={styles.liveCarIconWrap}>
                <Ionicons name="car" size={20} color={Colors.white} />
              </View>
              <View style={styles.liveNotifInfo}>
                <Text style={styles.liveNotifTitle} numberOfLines={1}>
                  {rideStatus === "arriving" ? "Driver arriving now" : "Driver on the way"}
                </Text>
                <Text style={styles.liveNotifVehicle} numberOfLines={1}>
                  {[chauffeurDetails.carMake, chauffeurDetails.vehicleModel].filter(Boolean).join(" ") || "Your Vehicle"}
                  {"  ·  "}
                  <Text style={styles.liveNotifPlate}>{chauffeurDetails.plateNumber}</Text>
                </Text>
              </View>
              <View style={styles.liveEtaBox}>
                <Text style={styles.liveEtaNum}>
                  {liveEtaMin !== null ? (liveEtaMin <= 1 ? "<1" : String(liveEtaMin)) : "—"}
                </Text>
                <Text style={styles.liveEtaUnit}>min</Text>
              </View>
            </View>
            {/* Progress bar track */}
            <View style={styles.liveProgressTrack}>
              <View style={[
                styles.liveProgressFill,
                {
                  width: `${initialEtaMin && liveEtaMin !== null
                    ? Math.max(4, Math.round((liveEtaMin / initialEtaMin) * 100))
                    : 100}%` as any,
                  backgroundColor: (liveEtaMin !== null && liveEtaMin <= 2)
                    ? Colors.warning
                    : Colors.success,
                }
              ]} />
            </View>
          </Animated.View>
        )}
      </View>

      {rideStatus === "idle" && (
        <Animated.View entering={FadeInDown.duration(400)} style={styles.bottomSheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Where to?</Text>

          {/* Location inputs */}
          <View style={styles.locationInputsCard}>
            <Pressable style={styles.locationInputRow} onPress={() => openLocationPicker("pickup")}>
              <View style={styles.dotGreen} />
              <View style={styles.locationInputInner}>
                <Text style={styles.locationInputLabel}>Pickup</Text>
                <Text style={styles.locationInputValue} numberOfLines={1}>
                  {pickupAddress || "Set pickup location"}
                </Text>
              </View>
              <Ionicons name="pencil-outline" size={15} color={Colors.textMuted} />
            </Pressable>

            <View style={styles.locationDivider} />

            <Pressable style={styles.locationInputRow} onPress={() => openLocationPicker("dropoff")}>
              <View style={styles.dotRed} />
              <View style={styles.locationInputInner}>
                <Text style={styles.locationInputLabel}>Dropoff</Text>
                <Text
                  style={[styles.locationInputValue, !dropoffAddress && { color: Colors.textMuted }]}
                  numberOfLines={1}
                >
                  {dropoffAddress || "Where are you going?"}
                </Text>
              </View>
              <Ionicons name="pencil-outline" size={15} color={Colors.textMuted} />
            </Pressable>
          </View>

          <Pressable
            style={styles.vehicleSelector}
            onPress={() => setShowVehicleSheet(true)}
          >
            <Ionicons name={selectedVehicle.icon} size={20} color={Colors.white} />
            <View style={{ flex: 1 }}>
              <Text style={styles.vehicleName}>{selectedVehicle.name}</Text>
              <Text style={styles.vehiclePrice}>R{selectedVehicle.baseFare} base + R{selectedVehicle.pricePerKm}/km</Text>
            </View>
            <Ionicons name="chevron-down" size={16} color={Colors.textMuted} />
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.confirmBtn, pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] }]}
            onPress={getEstimate}
          >
            <Text style={styles.confirmBtnText}>Get Estimated Fare</Text>
          </Pressable>
        </Animated.View>
      )}

      {rideStatus === "confirming" && (
        <Animated.View entering={FadeInDown.duration(400)} style={styles.confirmingSheet}>
          <View style={styles.sheetHandle} />

          {/* Header row with dismiss button */}
          <View style={styles.confirmingHeader}>
            <Text style={styles.sheetTitle}>Fare Estimate</Text>
            <Pressable style={styles.dismissBtn} onPress={cancelRide} hitSlop={12}>
              <Ionicons name="close" size={20} color={Colors.textSecondary} />
            </Pressable>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[
              styles.confirmingScroll,
              { paddingBottom: insets.bottom + 100 },
            ]}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.priceCard}>
              <Text style={styles.priceLabel}>{selectedVehicle.name}</Text>
              <Text style={styles.priceValue}>R {estimatedPrice}</Text>
              <Text style={styles.priceCurrency}>ZAR</Text>
              {(estimatedDistance || tripDurationText) && (
                <View style={styles.tripInfoPill}>
                  {estimatedDistance && (
                    <Text style={styles.tripInfoText}>{estimatedDistance} km</Text>
                  )}
                  {estimatedDistance && tripDurationText && (
                    <Text style={styles.tripInfoSep}>·</Text>
                  )}
                  {tripDurationText && (
                    <Text style={styles.tripInfoText}>{tripDurationText}</Text>
                  )}
                </View>
              )}
            </View>

            <View style={styles.fareBreakdown}>
              <View style={styles.fareRow}>
                <Text style={styles.fareLabel}>Base fare</Text>
                <Text style={styles.fareValue}>R {selectedVehicle.baseFare}</Text>
              </View>
              <View style={styles.fareRow}>
                <Text style={styles.fareLabel}>Distance ({estimatedDistance} km × R{selectedVehicle.pricePerKm})</Text>
                <Text style={styles.fareValue}>R {Math.round((estimatedDistance || 0) * selectedVehicle.pricePerKm)}</Text>
              </View>
              {lateNightPremium > 0 && (
                <View style={styles.fareRow}>
                  <Text style={styles.fareLabel}>Late night surcharge (30%)</Text>
                  <Text style={styles.fareValue}>R {lateNightPremium}</Text>
                </View>
              )}
            </View>

            <View style={styles.routeSummary}>
              <View style={styles.routeRow}>
                <View style={styles.dotGreen} />
                <Text style={styles.routeText} numberOfLines={2}>{pickupAddress}</Text>
              </View>
              <View style={styles.routeLine} />
              <View style={styles.routeRow}>
                <View style={styles.dotRed} />
                <Text style={styles.routeText} numberOfLines={2}>{dropoffAddress}</Text>
              </View>
            </View>

            <Pressable
              style={({ pressed }) => [styles.requestBtn, pressed && { opacity: 0.9 }]}
              onPress={requestRide}
            >
              <Text style={styles.requestBtnText}>Request Ride</Text>
            </Pressable>

            <Pressable style={styles.cancelFullBtn} onPress={cancelRide}>
              <Text style={styles.cancelFullBtnText}>Cancel</Text>
            </Pressable>
          </ScrollView>
        </Animated.View>
      )}

      {rideStatus === "requested" && (
        <Animated.View entering={FadeInDown.duration(400)} style={styles.searchingBottomSheet}>
          <View style={styles.sheetHandle} />
          <View style={styles.searchingContainer}>
            <ActivityIndicator size="small" color={Colors.white} />
            <View style={{ flex: 1 }}>
              <Text style={styles.searchingText}>Searching for {selectedVehicle.name}...</Text>
              <Text style={styles.searchingSubtext}>{selectedVehicle.desc?.split(",")[0]} nearby</Text>
            </View>
          </View>
          <Pressable style={styles.cancelFullBtn} onPress={cancelRide}>
            <Text style={styles.cancelFullBtnText}>Cancel Request</Text>
          </Pressable>
        </Animated.View>
      )}

      {rideStatus === "no_drivers" && (
        <Animated.View entering={FadeInDown.duration(400)} style={styles.bottomSheet}>
          <View style={styles.sheetHandle} />
          <View style={styles.noDriversContainer}>
            <Ionicons name="car-outline" size={48} color={Colors.textSecondary} />
            <Text style={styles.noDriversTitle}>No Cars Available</Text>
            <Text style={styles.noDriversSubtext}>
              There are no {selectedVehicle.name} drivers available in your area right now. Please try again shortly.
            </Text>
          </View>
          <Pressable style={styles.retryBtn} onPress={() => { setRideStatus("idle"); setDropoffCoords(null); setDropoffAddress(""); setRoutePolyline(null); }}>
            <Text style={styles.retryBtnText}>Back to Home</Text>
          </Pressable>
        </Animated.View>
      )}

      {(rideStatus === "assigned" || rideStatus === "arriving" || rideStatus === "in_trip") && (
        <Animated.View entering={FadeInDown.duration(400)} style={styles.bottomSheet}>
          <View style={styles.sheetHandle} />
          <View style={styles.statusBadge}>
            <View style={[styles.statusDot, { backgroundColor: Colors.success }]} />
            <Text style={styles.statusText}>
              {rideStatus === "assigned" ? "Driver Assigned" : rideStatus === "arriving" ? "Driver Arriving" : "Trip In Progress"}
            </Text>
          </View>

          <View style={styles.chauffeurCard}>
            <Pressable style={styles.chauffeurAvatarBtn} onPress={openDriverProfile}>
              <View style={styles.chauffeurAvatar}>
                {chauffeurDetails?.profilePhoto ? (
                  <Image
                    source={{ uri: chauffeurDetails.profilePhoto }}
                    style={{ width: 48, height: 48, borderRadius: 24 }}
                    resizeMode="cover"
                  />
                ) : (
                  <Ionicons name="person" size={24} color={Colors.white} />
                )}
              </View>
              <View style={styles.viewProfileBadge}>
                <Ionicons name="eye" size={9} color={Colors.white} />
              </View>
            </Pressable>
            <View style={styles.chauffeurInfo}>
              <Text style={styles.chauffeurName}>{chauffeurDetails?.driverName || "Your Driver"}</Text>
              {/* Show exact vehicle — make + model */}
              <Text style={styles.chauffeurVehicle}>
                {[chauffeurDetails?.carMake, chauffeurDetails?.vehicleModel].filter(Boolean).join(" ") || selectedVehicle.name}
              </Text>
              {chauffeurDetails && (
                <View style={styles.driverMeta}>
                  <View style={styles.ratingChip}>
                    <Ionicons name="star" size={11} color={Colors.warning} />
                    <Text style={styles.ratingChipText}>
                      {chauffeurDetails.driverRating !== null && chauffeurDetails.driverRating !== undefined
                        ? chauffeurDetails.driverRating.toFixed(1)
                        : "New"}
                    </Text>
                  </View>
                  {/* Plate number chip */}
                  <View style={styles.plateChip}>
                    <Text style={styles.plateText}>{chauffeurDetails.plateNumber}</Text>
                  </View>
                  {/* Car color dot */}
                  {chauffeurDetails.carColor ? (
                    <View style={styles.colorBadge}>
                      <View style={[styles.colorDotCircle, { backgroundColor: carColorToHex(chauffeurDetails.carColor) }]} />
                      <Text style={styles.colorDot}>{chauffeurDetails.carColor}</Text>
                    </View>
                  ) : null}
                </View>
              )}
            </View>
            <View style={styles.chauffeurActions}>
              <Pressable
                style={styles.actionBtn}
                onPress={() => {
                  if (currentRide?.id) {
                    router.push({ pathname: "/client/chat", params: { rideId: currentRide.id, driverName: chauffeurDetails?.driverName || "Driver" } });
                  }
                }}
              >
                <Ionicons name="chatbubble" size={18} color={Colors.white} />
              </Pressable>
              <Pressable
                style={styles.actionBtn}
                onPress={() => {
                  if (chauffeurDetails?.driverPhone) {
                    Linking.openURL(`tel:${chauffeurDetails.driverPhone}`);
                  } else {
                    Alert.alert("Call", "Phone number not available. Use chat instead.");
                  }
                }}
              >
                <Ionicons name="call" size={18} color={Colors.white} />
              </Pressable>
            </View>
          </View>

          {currentRide?.price && (
            <View style={styles.tripPriceRow}>
              <Text style={styles.tripPriceLabel}>Ride Price</Text>
              <Text style={styles.tripPriceValue}>R {currentRide.price}</Text>
            </View>
          )}
          {(rideStatus === "assigned" || rideStatus === "arriving" || rideStatus === "in_trip") && (
            <Pressable
              style={styles.cancelRideActiveBtn}
              onPress={() => {
                if (Platform.OS === "web") {
                  if ((global as any).confirm?.("Are you sure you want to cancel this ride?") !== false) {
                    cancelRide();
                  }
                } else {
                  Alert.alert("Cancel Ride", "Are you sure you want to cancel?", [
                    { text: "Keep Ride", style: "cancel" },
                    { text: "Cancel Ride", style: "destructive", onPress: cancelRide },
                  ]);
                }
              }}
            >
              <Text style={styles.cancelRideActiveBtnText}>Cancel Ride</Text>
            </Pressable>
          )}
        </Animated.View>
      )}

      {rideStatus === "completed" && !showRating && (
        <Animated.View entering={FadeInDown.duration(400)} style={styles.bottomSheet}>
          <View style={styles.sheetHandle} />
          <View style={styles.completedContainer}>
            <View style={styles.checkCircle}>
              <Ionicons name="checkmark" size={32} color={Colors.white} />
            </View>
            <Text style={styles.completedTitle}>Trip Completed</Text>
            <Text style={styles.completedPrice}>R {currentRide?.price || estimatedPrice}</Text>
            <Text style={styles.completedLabel}>Thank you for riding with A2B LIFT</Text>
          </View>
          <Pressable
            style={({ pressed }) => [styles.confirmBtn, pressed && { opacity: 0.9 }]}
            onPress={() => setShowRating(true)}
          >
            <Text style={styles.confirmBtnText}>Rate Your Driver</Text>
          </Pressable>
        </Animated.View>
      )}

      {showRating && (
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "position" : undefined}
          style={{ position: "absolute", bottom: 0, left: 0, right: 0 }}
        >
          <Animated.View entering={FadeInDown.duration(400)} style={styles.bottomSheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Rate Your Driver</Text>

            <View style={styles.ratingContainer}>
              <Text style={styles.ratingLabel}>How was your ride?</Text>
              <View style={styles.starsContainer}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <Pressable
                    key={star}
                    onPress={() => setRating(star)}
                    style={({ pressed }) => [styles.starButton, pressed && { opacity: 0.7 }]}
                  >
                    <Ionicons
                      name={star <= rating ? "star" : "star-outline"}
                      size={40}
                      color={star <= rating ? Colors.warning : Colors.textMuted}
                    />
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.commentContainer}>
              <Text style={styles.commentLabel}>Optional: Add a comment</Text>
              <TextInput
                style={styles.commentInput}
                placeholder="Share your experience..."
                placeholderTextColor={Colors.textMuted}
                value={ratingComment}
                onChangeText={setRatingComment}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
                scrollEnabled={false}
              />
            </View>

            <View style={[styles.ratingActions, { paddingBottom: insets.bottom + 8 }]}>
              <Pressable
                style={({ pressed }) => [styles.skipButton, pressed && { opacity: 0.8 }]}
                onPress={() => {
                  setShowRating(false);
                  resetAfterComplete();
                }}
              >
                <Text style={styles.skipButtonText}>Skip</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.submitRatingButton,
                  rating === 0 && styles.submitRatingButtonDisabled,
                  pressed && { opacity: 0.9 },
                ]}
                onPress={submitRating}
                disabled={rating === 0 || submittingRating}
              >
                {submittingRating ? (
                  <ActivityIndicator size="small" color={Colors.white} />
                ) : (
                  <Text style={styles.submitRatingButtonText}>Submit</Text>
                )}
              </Pressable>
            </View>
          </Animated.View>
        </KeyboardAvoidingView>
      )}

      {/* Driver Profile Modal */}
      <Modal visible={showDriverProfile} transparent animationType="slide" onRequestClose={() => setShowDriverProfile(false)}>
        <View style={styles.profileModalOverlay}>
          <View style={[styles.profileModalSheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.profileModalHeader}>
              <Text style={styles.profileModalTitle}>Driver Profile</Text>
              <Pressable onPress={() => setShowDriverProfile(false)} style={styles.profileCloseBtn}>
                <Ionicons name="close" size={20} color={Colors.textMuted} />
              </Pressable>
            </View>

            {driverProfileLoading ? (
              <View style={styles.profileLoadingContainer}>
                <ActivityIndicator size="large" color={Colors.primary} />
                <Text style={styles.profileLoadingText}>Loading profile...</Text>
              </View>
            ) : driverProfile ? (
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
                {/* Profile Header */}
                <View style={styles.profileHero}>
                  <View style={styles.profileAvatarLarge}>
                    {driverProfile.profilePhoto ? (
                      <Image source={{ uri: driverProfile.profilePhoto }} style={styles.profileAvatarImg} resizeMode="cover" />
                    ) : (
                      <Ionicons name="person" size={44} color={Colors.white} />
                    )}
                  </View>
                  <Text style={styles.profileDriverName}>{driverProfile.driverName}</Text>
                  <Text style={styles.profileVehicle}>
                    {[driverProfile.carMake, driverProfile.vehicleModel].filter(Boolean).join(" ")}
                  </Text>
                  {driverProfile.plateNumber ? (
                    <View style={styles.profilePlateChip}>
                      <Text style={styles.profilePlateText}>{driverProfile.plateNumber}</Text>
                    </View>
                  ) : null}
                </View>

                {/* Stats Row */}
                <View style={styles.profileStatsRow}>
                  <View style={styles.profileStatBox}>
                    <Text style={styles.profileStatValue}>
                      {driverProfile.driverRating !== null ? driverProfile.driverRating.toFixed(1) : "—"}
                    </Text>
                    <View style={{ flexDirection: "row", gap: 2, justifyContent: "center", marginBottom: 2 }}>
                      {[1, 2, 3, 4, 5].map((s) => (
                        <Ionicons
                          key={s}
                          name={s <= Math.round(driverProfile.driverRating ?? 0) ? "star" : "star-outline"}
                          size={11}
                          color={Colors.warning}
                        />
                      ))}
                    </View>
                    <Text style={styles.profileStatLabel}>{driverProfile.totalRatings} ratings</Text>
                  </View>
                  <View style={styles.profileStatDivider} />
                  <View style={styles.profileStatBox}>
                    <Text style={styles.profileStatValue}>{driverProfile.completedTrips}</Text>
                    <Text style={styles.profileStatLabel}>Trips Completed</Text>
                  </View>
                </View>

                {/* Rating Distribution */}
                {driverProfile.totalRatings > 0 && (
                  <View style={styles.profileDistribution}>
                    <Text style={styles.profileSectionTitle}>Rating Breakdown</Text>
                    {[5, 4, 3, 2, 1].map((star) => {
                      const count = driverProfile.distribution[star] || 0;
                      const pct = driverProfile.totalRatings > 0 ? count / driverProfile.totalRatings : 0;
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

                {/* Reviews */}
                {driverProfile.ratings.length > 0 ? (
                  <View style={styles.profileReviews}>
                    <Text style={styles.profileSectionTitle}>Recent Reviews</Text>
                    {driverProfile.ratings.map((review) => (
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
                            {[1, 2, 3, 4, 5].map((s) => (
                              <Ionicons key={s} name={s <= review.rating ? "star" : "star-outline"} size={12} color={Colors.warning} />
                            ))}
                          </View>
                        </View>
                        {review.comment ? (
                          <Text style={styles.reviewComment}>{review.comment}</Text>
                        ) : null}
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

      {/* Payment Method Picker */}
      <Modal visible={showPaymentPicker} transparent animationType="slide" onRequestClose={() => setShowPaymentPicker(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowPaymentPicker(false)}>
          <View style={[styles.modalSheet, { paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 16) }]}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>How would you like to pay?</Text>
            <Text style={{ fontSize: 13, color: Colors.textMuted, fontFamily: "Inter_400Regular", marginBottom: 8 }}>
              Fare: R {estimatedPrice}
            </Text>
            {(() => {
              const defaultCard = savedCards.find(c => c.isDefault) || savedCards[0];
              return (
                <Pressable
                  style={styles.payMethodRow}
                  onPress={() => {
                    if (!defaultCard) {
                      setShowPaymentPicker(false);
                      router.push("/client/wallet");
                    } else {
                      handlePayAndRide("card");
                    }
                  }}
                >
                  <View style={[styles.payMethodIcon, { backgroundColor: "#1434CB" }]}>
                    <Ionicons name="card" size={20} color="#fff" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.payMethodName}>
                      {defaultCard ? `${defaultCard.cardType?.toUpperCase()} •••• ${defaultCard.last4}` : "Pay by Card"}
                    </Text>
                    <Text style={styles.payMethodSub}>
                      {defaultCard ? "Charged immediately to saved card" : "No card saved — tap to add one in wallet"}
                    </Text>
                  </View>
                  <Ionicons name={defaultCard ? "chevron-forward" : "add-circle-outline"} size={16} color={Colors.textMuted} />
                </Pressable>
              );
            })()}
            {(user?.walletBalance || 0) >= (estimatedPrice || 0) && (estimatedPrice || 0) > 0 && (
              <Pressable style={styles.payMethodRow} onPress={() => handlePayAndRide("wallet")}>
                <View style={[styles.payMethodIcon, { backgroundColor: Colors.success }]}>
                  <Ionicons name="wallet" size={20} color="#fff" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.payMethodName}>Wallet Balance</Text>
                  <Text style={styles.payMethodSub}>R {(user?.walletBalance || 0).toFixed(2)} available</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
              </Pressable>
            )}
            <Pressable style={styles.payMethodRow} onPress={() => handlePayAndRide("cash")}>
              <View style={[styles.payMethodIcon, { backgroundColor: Colors.accent }]}>
                <Ionicons name="cash" size={20} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.payMethodName}>Cash</Text>
                <Text style={styles.payMethodSub}>Pay driver directly after ride</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      {/* Cash Liveness Screen */}
      <Modal
        visible={showCashLiveness}
        animationType="slide"
        onRequestClose={() => resetCashLiveness(true)}
      >
        <ScrollView style={{ flex: 1, backgroundColor: Colors.primary }} contentContainerStyle={[styles.livenessContainer, { paddingTop: insets.top + 8, flexGrow: 1 }]} keyboardShouldPersistTaps="handled">
          <View style={styles.livenessHeader}>
            <Pressable onPress={() => resetCashLiveness(true)} hitSlop={12}>
              <Ionicons name="arrow-back" size={24} color={Colors.white} />
            </Pressable>
            <Text style={styles.livenessTitle}>Cash Verification</Text>
            <View style={{ width: 24 }} />
          </View>

          <View style={styles.livenessCard}>
            <Text style={styles.livenessHeadline}>Liveness Check Required</Text>
            <Text style={styles.livenessBodyText}>
              Before requesting a cash trip, take a live selfie. This helps prevent fraud and secures cash collections.
            </Text>
            <Text style={styles.livenessFareNote}>
              Fare reminder: route choice affects the final fare. Confirm route with your driver before trip starts.
            </Text>
            <View style={styles.livenessMetaRow}>
              <Text style={styles.livenessMetaText}>Attempts: {livenessAttempts}/{livenessMaxAttempts}</Text>
            </View>
            {!!livenessChallenge && (
              <View style={styles.challengeBox}>
                <Ionicons name="sparkles-outline" size={16} color={Colors.accent} />
                <Text style={styles.challengeText}>Action: {livenessChallenge}</Text>
              </View>
            )}
          </View>

          <View style={styles.livenessPreviewWrap}>
            {livenessSelfieLocalUri ? (
              <Image source={{ uri: livenessSelfieLocalUri }} style={styles.livenessPreviewImg} />
            ) : (
              <View style={styles.livenessPlaceholder}>
                <Ionicons name="person-circle-outline" size={82} color={Colors.textMuted} />
                <Text style={styles.livenessPlaceholderText}>No selfie captured yet</Text>
              </View>
            )}
          </View>

          {!!livenessMessage && (
            <Text style={styles.livenessStatusText}>{livenessMessage}</Text>
          )}

          <View style={styles.livenessActions}>
            <Pressable
              style={[styles.livenessBtnSecondary, livenessBusy && { opacity: 0.6 }]}
              disabled={livenessBusy}
              onPress={captureAndVerifyLiveness}
            >
              {livenessBusy ? (
                <ActivityIndicator size="small" color={Colors.white} />
              ) : (
                <Text style={styles.livenessBtnSecondaryText}>
                  {livenessSelfieLocalUri ? "Retake Selfie" : "Start Liveness"}
                </Text>
              )}
            </Pressable>

            <Pressable
              style={[styles.livenessBtnPrimary, !livenessPassed && styles.livenessBtnDisabled]}
              disabled={!livenessPassed || livenessBusy}
              onPress={continueWithVerifiedCashRide}
            >
              <Text style={styles.livenessBtnPrimaryText}>Continue With Cash Ride</Text>
            </Pressable>
          </View>
        </ScrollView>
      </Modal>

      {/* Location Picker Modal */}
      <Modal
        visible={locationPickerVisible}
        animationType="slide"
        onRequestClose={() => setLocationPickerVisible(false)}
      >
        <View style={[styles.locationPickerContainer, { paddingTop: insets.top }]}>
          {/* Header */}
          <View style={styles.locationPickerHeader}>
            <Pressable onPress={() => setLocationPickerVisible(false)} hitSlop={12}>
              <Ionicons name="arrow-back" size={24} color={Colors.white} />
            </Pressable>
            <Text style={styles.locationPickerTitle}>
              {locationPickerTarget === "pickup" ? "Set Pickup" : "Set Destination"}
            </Text>
            <View style={{ width: 24 }} />
          </View>

          {/* Search input */}
          <View style={styles.locationPickerInputRow}>
            <View style={locationPickerTarget === "pickup" ? styles.dotGreen : styles.dotRed} />
            <TextInput
              style={styles.locationPickerInput}
              placeholder={locationPickerTarget === "pickup" ? "Search pickup location..." : "Search destination..."}
              placeholderTextColor={Colors.textMuted}
              value={locationPickerQuery}
              onChangeText={onLocationQueryChange}
              autoFocus
              returnKeyType="search"
              clearButtonMode="while-editing"
            />
            {suggestionsLoading && <ActivityIndicator size="small" color={Colors.textMuted} />}
          </View>

          {/* Use current location (pickup only) */}
          {locationPickerTarget === "pickup" && (
            <Pressable style={styles.currentLocationBtn} onPress={useCurrentLocationForPickup}>
              <Ionicons name="locate" size={18} color={Colors.white} />
              <Text style={styles.currentLocationText}>Use my current location</Text>
            </Pressable>
          )}

          {/* Suggestions list */}
          <FlatList
            data={locationSuggestions}
            keyExtractor={(item) => item.placeId}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
            ItemSeparatorComponent={() => <View style={styles.suggestionDivider} />}
            ListEmptyComponent={
              locationPickerQuery.length >= 2 && !suggestionsLoading ? (
                <View style={styles.noSuggestionsContainer}>
                  <Text style={styles.noSuggestionsText}>No results found</Text>
                </View>
              ) : null
            }
            renderItem={({ item }) => (
              <Pressable
                style={({ pressed }) => [styles.suggestionRow, pressed && { backgroundColor: Colors.surface }]}
                onPress={() => selectSuggestion(item)}
              >
                <View style={styles.suggestionIcon}>
                  <Ionicons name="location-outline" size={18} color={Colors.textSecondary} />
                </View>
                <View style={styles.suggestionText}>
                  <Text style={styles.suggestionMain} numberOfLines={1}>{item.mainText}</Text>
                  {item.secondaryText ? (
                    <Text style={styles.suggestionSecondary} numberOfLines={1}>{item.secondaryText}</Text>
                  ) : null}
                </View>
              </Pressable>
            )}
          />
        </View>
      </Modal>

      <Modal visible={showVehicleSheet} transparent animationType="slide" onRequestClose={() => setShowVehicleSheet(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowVehicleSheet(false)}>
          <View style={[styles.modalSheet, { paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 16) }]}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Select Vehicle Category</Text>
            {VEHICLE_TYPES.map((vt) => (
              <Pressable
                key={vt.id}
                style={({ pressed }) => [
                  styles.vehicleOption,
                  selectedVehicle.id === vt.id && styles.vehicleOptionSelected,
                  pressed && { opacity: 0.8 },
                ]}
                onPress={() => {
                  setSelectedVehicle(vt);
                  setShowVehicleSheet(false);
                }}
              >
                <Ionicons name={vt.icon} size={22} color={Colors.white} />
                <View style={styles.vehicleOptionInfo}>
                  <Text style={styles.vehicleOptionName}>{vt.name}</Text>
                  <Text style={styles.vehicleOptionDesc}>{vt.desc}</Text>
                  <Text style={styles.vehicleOptionPrice}>R{vt.baseFare} + R{vt.pricePerKm}/km</Text>
                </View>
                {selectedVehicle.id === vt.id && (
                  <Ionicons name="checkmark-circle" size={22} color={Colors.white} />
                )}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.primary,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
    zIndex: 10,
  },
  brandName: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    color: Colors.white,
    letterSpacing: 2,
  },
  brandSlogan: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
    letterSpacing: 1,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  bellBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  notifBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#FF3B30",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: Colors.primary,
  },
  notifBadgeText: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    color: "#fff",
    lineHeight: 12,
  },
  mapArea: {
    flex: 1,
    overflow: "hidden",
  },
  bottomSheet: {
    backgroundColor: Colors.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    paddingBottom: 90,
    gap: 12,
  },
  searchingBottomSheet: {
    backgroundColor: Colors.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    paddingBottom: 90,
    gap: 10,
  },
  confirmingSheet: {
    backgroundColor: Colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    // Cap height so map stays visible, but allow scroll for all content
    maxHeight: "75%",
    paddingTop: 20,
    paddingHorizontal: 20,
  },
  confirmingHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  dismissBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  confirmingScroll: {
    rowGap: 16,
    paddingTop: 12,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    backgroundColor: Colors.accent,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 4,
  },
  sheetTitle: {
    fontSize: 20,
    fontFamily: "Inter_600SemiBold",
    color: Colors.white,
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 4,
  },
  dotGreen: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.success,
  },
  dotRed: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.error,
  },
  locationText: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: Colors.white,
  },
  locationInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: Colors.white,
    backgroundColor: Colors.surface,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  // Tappable location card on idle sheet
  locationInputsCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    overflow: "hidden",
  },
  locationInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  locationInputInner: {
    flex: 1,
  },
  locationInputLabel: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    color: Colors.textMuted,
    marginBottom: 2,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  locationInputValue: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: Colors.white,
  },
  locationDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginLeft: 38,
  },
  // Full-screen location picker modal
  locationPickerContainer: {
    flex: 1,
    backgroundColor: Colors.primary,
  },
  locationPickerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  locationPickerTitle: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
    color: Colors.white,
  },
  locationPickerInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    margin: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: Colors.surface,
    borderRadius: 14,
  },
  locationPickerInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: Colors.white,
  },
  currentLocationBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  currentLocationText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: Colors.white,
  },
  suggestionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
    gap: 14,
  },
  suggestionIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  suggestionText: {
    flex: 1,
  },
  suggestionMain: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: Colors.white,
  },
  suggestionSecondary: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
    marginTop: 2,
  },
  suggestionDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginLeft: 70,
  },
  noSuggestionsContainer: {
    paddingVertical: 40,
    alignItems: "center",
  },
  noSuggestionsText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
  },
  vehicleSelector: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: Colors.surface,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  vehicleName: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    color: Colors.white,
  },
  vehiclePrice: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
    marginTop: 1,
  },
  confirmBtn: {
    backgroundColor: Colors.white,
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: "center",
  },
  confirmBtnText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.primary,
  },
  priceCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    gap: 4,
  },
  priceLabel: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
  },
  priceValue: {
    fontSize: 36,
    fontFamily: "Inter_700Bold",
    color: Colors.white,
  },
  priceCurrency: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
  },
  distanceInfo: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    marginTop: 4,
  },
  tripInfoPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(39,110,241,0.15)",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginTop: 8,
    gap: 6,
  },
  tripInfoText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: "#276EF1",
  },
  tripInfoSep: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: "#276EF1",
    opacity: 0.6,
  },
  fareBreakdown: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    gap: 8,
  },
  fareRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  fareLabel: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
  },
  fareValue: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: Colors.white,
  },
  routeSummary: {
    gap: 4,
    paddingLeft: 4,
  },
  routeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  routeLine: {
    width: 2,
    height: 16,
    backgroundColor: Colors.accent,
    marginLeft: 4,
  },
  routeText: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
  },
  btnRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
  },
  cancelBtn: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: Colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  requestBtn: {
    backgroundColor: Colors.white,
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: "center",
  },
  requestBtnText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.primary,
  },
  searchingContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 4,
  },
  searchingText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.white,
  },
  searchingSubtext: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
    marginTop: 1,
  },
  nearbyEtaPill: {
    position: "absolute",
    bottom: 16,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(0,0,0,0.82)",
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  nearbyEtaDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#22c55e",
  },
  nearbyEtaText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: Colors.white,
  },
  routeInfoOverlay: {
    position: "absolute",
    top: 16,
    right: 16,
    alignItems: "flex-end",
    gap: 6,
    pointerEvents: "none",
  },
  arrivalPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#1a1a1a",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  arrivalPillText: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    color: "#FFFFFF",
  },
  routeMetaPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.75)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  routeMetaText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: "rgba(255,255,255,0.85)",
  },
  routeMetaSep: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.5)",
  },
  // Map overlay while searching — like Uber's pulsing animation
  searchingMapOverlay: {
    position: "absolute",
    top: "30%",
    left: 0,
    right: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  searchingPulseRing: {
    position: "absolute",
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },
  searchingPulseRing2: {
    position: "absolute",
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  searchingMapCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: Colors.white,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  searchingMapTitle: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: Colors.primary,
  },
  searchingMapSub: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    marginTop: 1,
  },
  // Live driver notification banner
  liveNotifBanner: {
    position: "absolute",
    top: 12,
    left: 12,
    right: 12,
    backgroundColor: "rgba(0,0,0,0.92)",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    zIndex: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 12,
    gap: 10,
  },
  liveNotifRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  liveCarIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.success,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  liveNotifInfo: {
    flex: 1,
    gap: 2,
  },
  liveNotifTitle: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.white,
  },
  liveNotifVehicle: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
  },
  liveNotifPlate: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    color: Colors.white,
    letterSpacing: 0.5,
  },
  liveEtaBox: {
    alignItems: "center",
    minWidth: 44,
    flexShrink: 0,
  },
  liveEtaNum: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    color: Colors.white,
    lineHeight: 28,
  },
  liveEtaUnit: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
    marginTop: -2,
  },
  liveProgressTrack: {
    height: 4,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 2,
    overflow: "hidden",
  },
  liveProgressFill: {
    height: 4,
    borderRadius: 2,
  },
  // Vehicle color badge
  plateChip: {
    backgroundColor: Colors.surface,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  colorBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  colorDotCircle: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  cancelRideActiveBtn: {
    marginTop: 12,
    paddingVertical: 13,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.error,
    alignItems: "center",
  },
  cancelRideActiveBtnText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: Colors.error,
  },
  cancelFullBtn: {
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cancelFullBtnText: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
  },
  noDriversContainer: {
    alignItems: "center",
    paddingVertical: 24,
    gap: 12,
  },
  noDriversTitle: {
    fontSize: 20,
    fontFamily: "Inter_600SemiBold",
    color: Colors.white,
  },
  noDriversSubtext: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 20,
    paddingHorizontal: 8,
  },
  retryBtn: {
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    backgroundColor: Colors.white,
    marginTop: 8,
  },
  retryBtnText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: Colors.primary,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: Colors.white,
  },
  chauffeurCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 16,
    gap: 12,
  },
  chauffeurAvatarBtn: {
    position: "relative",
  },
  chauffeurAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  viewProfileBadge: {
    position: "absolute",
    bottom: -2,
    right: -2,
    backgroundColor: Colors.primary,
    borderRadius: 8,
    width: 16,
    height: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: Colors.surface,
  },
  profileModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  profileModalSheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    maxHeight: "90%",
  },
  profileModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  profileModalTitle: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
    color: Colors.white,
  },
  profileCloseBtn: {
    padding: 4,
  },
  profileLoadingContainer: {
    paddingVertical: 40,
    alignItems: "center",
    gap: 12,
  },
  profileLoadingText: {
    color: Colors.textMuted,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  profileHero: {
    alignItems: "center",
    paddingVertical: 16,
    gap: 8,
  },
  profileAvatarLarge: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: Colors.accent,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  profileAvatarImg: {
    width: 90,
    height: 90,
    borderRadius: 45,
  },
  profileDriverName: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    color: Colors.white,
  },
  profileVehicle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
  },
  profilePlateChip: {
    backgroundColor: Colors.background,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginTop: 4,
  },
  profilePlateText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: Colors.white,
    letterSpacing: 1,
  },
  profileStatsRow: {
    flexDirection: "row",
    backgroundColor: Colors.background,
    borderRadius: 16,
    marginBottom: 20,
    overflow: "hidden",
  },
  profileStatBox: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 16,
    gap: 4,
  },
  profileStatDivider: {
    width: 1,
    backgroundColor: Colors.surface,
    marginVertical: 12,
  },
  profileStatValue: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    color: Colors.white,
  },
  profileStatLabel: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
  },
  profileDistribution: {
    marginBottom: 24,
    gap: 8,
  },
  profileSectionTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: Colors.white,
    marginBottom: 8,
  },
  distRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  distLabel: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: Colors.textMuted,
    width: 12,
    textAlign: "right",
  },
  distBarBg: {
    flex: 1,
    height: 8,
    backgroundColor: Colors.background,
    borderRadius: 4,
    flexDirection: "row",
    overflow: "hidden",
  },
  distBarFill: {
    backgroundColor: Colors.warning,
    borderRadius: 4,
  },
  distCount: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
    width: 20,
    textAlign: "right",
  },
  profileReviews: {
    gap: 12,
  },
  reviewCard: {
    backgroundColor: Colors.background,
    borderRadius: 12,
    padding: 14,
    gap: 8,
  },
  reviewHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  reviewAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  reviewAvatarText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.white,
  },
  reviewerName: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.white,
  },
  reviewDate: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
    marginTop: 1,
  },
  reviewStars: {
    flexDirection: "row",
    gap: 2,
  },
  reviewComment: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    lineHeight: 20,
    paddingLeft: 44,
  },
  noReviewsContainer: {
    paddingVertical: 32,
    alignItems: "center",
    gap: 8,
  },
  noReviewsText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
  },
  chauffeurInfo: {
    flex: 1,
    gap: 2,
  },
  chauffeurName: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: Colors.white,
  },
  chauffeurVehicle: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
  },
  driverMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  ratingChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "rgba(255,183,77,0.15)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  ratingChipText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: Colors.warning,
  },
  plateText: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    color: Colors.textMuted,
  },
  colorDot: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
  },
  chauffeurActions: {
    flexDirection: "row",
    gap: 8,
  },
  actionBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  tripPriceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
  },
  tripPriceLabel: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
  },
  tripPriceValue: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    color: Colors.white,
  },
  completedContainer: {
    alignItems: "center",
    gap: 8,
    paddingVertical: 16,
  },
  checkCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.success,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  completedTitle: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    color: Colors.white,
  },
  completedPrice: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    color: Colors.white,
  },
  completedLabel: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: Colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    gap: 12,
  },
  vehicleOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: "transparent",
  },
  vehicleOptionSelected: {
    borderColor: Colors.white,
  },
  vehicleOptionInfo: {
    flex: 1,
    gap: 2,
  },
  vehicleOptionName: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: Colors.white,
  },
  vehicleOptionDesc: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
  },
  vehicleOptionPrice: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
    marginTop: 2,
  },
  ratingContainer: {
    alignItems: "center",
    gap: 16,
    paddingVertical: 8,
  },
  ratingLabel: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: Colors.white,
  },
  starsContainer: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
  },
  starButton: {
    padding: 4,
  },
  commentContainer: {
    gap: 8,
  },
  commentLabel: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
  },
  commentInput: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.white,
    minHeight: 80,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  ratingActions: {
    flexDirection: "row",
    gap: 12,
  },
  skipButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  skipButtonText: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
  },
  submitRatingButton: {
    flex: 1,
    backgroundColor: Colors.white,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
  },
  submitRatingButtonDisabled: {
    opacity: 0.5,
  },
  submitRatingButtonText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: Colors.primary,
  },
  payMethodRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 8,
  },
  payMethodIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  payMethodName: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: Colors.white,
  },
  payMethodSub: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
    marginTop: 2,
  },
  livenessContainer: {
    flex: 1,
    backgroundColor: Colors.primary,
    paddingHorizontal: 18,
  },
  livenessHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
  },
  livenessTitle: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
    color: Colors.white,
  },
  livenessCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    gap: 10,
  },
  livenessHeadline: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    color: Colors.white,
  },
  livenessBodyText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  livenessFareNote: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: Colors.warning,
  },
  livenessMetaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  livenessMetaText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: Colors.textMuted,
  },
  challengeBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  challengeText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: Colors.white,
  },
  livenessPreviewWrap: {
    marginTop: 14,
    backgroundColor: Colors.surface,
    borderRadius: 18,
    overflow: "hidden",
    height: 220,
    alignItems: "center",
    justifyContent: "center",
  },
  livenessPreviewImg: {
    width: "100%",
    height: 220,
  },
  livenessPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  livenessPlaceholderText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: Colors.textMuted,
  },
  livenessStatusText: {
    marginTop: 12,
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
  },
  livenessActions: {
    marginTop: 16,
    gap: 10,
    paddingBottom: 24,
    paddingTop: 4,
  },
  livenessBtnSecondary: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  livenessBtnSecondaryText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.white,
  },
  livenessBtnPrimary: {
    backgroundColor: Colors.white,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 50,
  },
  livenessBtnDisabled: {
    opacity: 0.5,
  },
  livenessBtnPrimaryText: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    color: Colors.primary,
  },
});

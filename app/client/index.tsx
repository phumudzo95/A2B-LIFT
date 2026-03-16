import React, { useState, useEffect } from "react";
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
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Location from "expo-location";
import * as Haptics from "expo-haptics";
import Animated, { FadeInDown, FadeInUp } from "react-native-reanimated";
import { useAuth } from "@/lib/auth-context";
import { apiRequest } from "@/lib/query-client";
import { useSocket } from "@/lib/socket-context";
import Colors from "@/constants/colors";
import A2BMap from "@/components/A2BMap";

const VEHICLE_TYPES = [
  { id: "budget", name: "Budget", desc: "Toyota Corolla, Toyota Quest", icon: "car-outline" as const, pricePerKm: 7, baseFare: 50 },
  { id: "luxury", name: "Luxury", desc: "BMW 3 Series, Mercedes C Class", icon: "car-sport" as const, pricePerKm: 13, baseFare: 100 },
  { id: "business", name: "Business Class", desc: "BMW 5 Series, Mercedes E Class", icon: "briefcase" as const, pricePerKm: 40, baseFare: 150 },
  { id: "van", name: "Van", desc: "Hyundai H1, Mercedes Vito, Staria", icon: "bus" as const, pricePerKm: 13, baseFare: 120 },
  { id: "luxury_van", name: "Luxury Van", desc: "Mercedes V Class", icon: "car" as const, pricePerKm: 50, baseFare: 200 },
];

type RideStatus = "idle" | "selecting" | "confirming" | "requested" | "assigned" | "arriving" | "in_trip" | "completed";

interface ChauffeurDetails {
  driverName: string;
  driverPhone: string | null;
  driverRating: number;
  vehicleModel: string;
  plateNumber: string;
  carColor: string;
  carMake: string | null;
  vehicleType: string;
}

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
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
  const [driverLocation, setDriverLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [etaText, setEtaText] = useState<string | null>(null);
  const [showRating, setShowRating] = useState(false);
  const [rating, setRating] = useState<number>(0);
  const [ratingComment, setRatingComment] = useState<string>("");
  const [submittingRating, setSubmittingRating] = useState(false);

  useEffect(() => {
    requestLocation();
  }, []);

  async function fetchChauffeurDetails(chauffeurId: string) {
    try {
      const res = await apiRequest("GET", `/api/chauffeurs/${chauffeurId}/details`);
      const details = await res.json();
      setChauffeurDetails(details);
    } catch {}
  }

  useEffect(() => {
    const handleStatusUpdate = (ride: any) => {
      if (currentRide && ride.id === currentRide.id) {
        setCurrentRide(ride);
        if (ride.status === "chauffeur_assigned") {
          setRideStatus("assigned");
          if (ride.chauffeurId) fetchChauffeurDetails(ride.chauffeurId);
          if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } else if (ride.status === "chauffeur_arriving") {
          setRideStatus("arriving");
        } else if (ride.status === "trip_started") {
          setRideStatus("in_trip");
        } else if (ride.status === "trip_completed") {
          setRideStatus("completed");
          // Show rating screen after a brief delay
          setTimeout(() => {
            setShowRating(true);
          }, 1000);
          if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
      }
    };

    on("ride:statusUpdate", handleStatusUpdate);
    on("ride:accepted", handleStatusUpdate);

    return () => {
      off("ride:statusUpdate", handleStatusUpdate);
      off("ride:accepted", handleStatusUpdate);
    };
  }, [currentRide]);

  useEffect(() => {
    const handleDriverLocation = (data: any) => {
      if (currentRide && data.chauffeurId === currentRide.chauffeurId) {
        setDriverLocation({ lat: data.lat, lng: data.lng });
      }
    };
    on("location:update", handleDriverLocation);
    return () => { off("location:update", handleDriverLocation); };
  }, [currentRide]);

  async function fetchRoute(origin: { lat: number; lng: number }, dest: { lat: number; lng: number }) {
    try {
      const res = await apiRequest("GET",
        `/api/directions?originLat=${origin.lat}&originLng=${origin.lng}&destLat=${dest.lat}&destLng=${dest.lng}`
      );
      const data = await res.json();
      if (data.polyline) {
        setRoutePolyline(data.polyline);
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
          setPickupAddress("Current Location");
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
          const [addr] = await Location.reverseGeocodeAsync({
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
          });
          if (addr) {
            setPickupAddress(`${addr.street || addr.name || ""}, ${addr.city || addr.region || ""}`.replace(/^, /, ""));
          }
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
      const dest = await geocodeDestination();
      if (!dest) {
        Alert.alert("Error", "Could not determine destination coordinates");
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
        isLateNight: new Date().getHours() >= 22 || new Date().getHours() < 5,
      });
      const ride = await res.json();
      setCurrentRide(ride);
      setRideStatus("requested");
      if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (e) {
      Alert.alert("Error", "Failed to request ride");
    }
  }

  function cancelRide() {
    if (currentRide) {
      apiRequest("PUT", `/api/rides/${currentRide.id}/status`, { status: "cancelled" }).catch(() => {});
    }
    setRideStatus("idle");
    setCurrentRide(null);
    setEstimatedPrice(null);
    setEstimatedDistance(null);
    setDropoffAddress("");
    setDropoffCoords(null);
    setRoutePolyline(null);
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
        <View style={styles.avatarCircle}>
          <Ionicons name="person" size={18} color={Colors.white} />
        </View>
      </View>

      <View style={styles.mapArea}>
        <A2BMap
          pickupLocation={location}
          dropoffLocation={dropoffCoords}
          driverLocation={driverLocation}
          routePolyline={routePolyline}
          showDriver={rideStatus === "assigned" || rideStatus === "arriving" || rideStatus === "in_trip"}
          followDriver={rideStatus === "arriving" || rideStatus === "in_trip"}
          loading={locationLoading}
          etaText={etaText || undefined}
          statusText={
            rideStatus === "assigned" ? "Your Chauffeur is En Route" :
            rideStatus === "arriving" ? "Your Chauffeur is Arriving" :
            rideStatus === "in_trip" ? "Trip In Progress" :
            undefined
          }
        />
      </View>

      {rideStatus === "idle" && (
        <Animated.View entering={FadeInDown.duration(400)} style={styles.bottomSheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Where to?</Text>

          <Pressable style={styles.locationRow}>
            <View style={styles.dotGreen} />
            <Text style={styles.locationText} numberOfLines={1}>{pickupAddress}</Text>
          </Pressable>

          <View style={styles.locationRow}>
            <View style={styles.dotRed} />
            <TextInput
              style={styles.locationInput}
              placeholder="Enter destination"
              placeholderTextColor={Colors.textMuted}
              value={dropoffAddress}
              onChangeText={setDropoffAddress}
            />
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
        <Animated.View entering={FadeInDown.duration(400)} style={styles.bottomSheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Fare Estimate</Text>

          <View style={styles.priceCard}>
            <Text style={styles.priceLabel}>{selectedVehicle.name}</Text>
            <Text style={styles.priceValue}>R {estimatedPrice}</Text>
            <Text style={styles.priceCurrency}>ZAR</Text>
            {estimatedDistance && (
              <Text style={styles.distanceInfo}>{estimatedDistance} km estimated distance</Text>
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
              <Text style={styles.routeText} numberOfLines={1}>{pickupAddress}</Text>
            </View>
            <View style={styles.routeLine} />
            <View style={styles.routeRow}>
              <View style={styles.dotRed} />
              <Text style={styles.routeText} numberOfLines={1}>{dropoffAddress}</Text>
            </View>
          </View>

          <View style={styles.btnRow}>
            <Pressable style={styles.cancelBtn} onPress={cancelRide}>
              <Ionicons name="close" size={22} color={Colors.textSecondary} />
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.requestBtn, pressed && { opacity: 0.9 }]}
              onPress={requestRide}
            >
              <Text style={styles.requestBtnText}>Request Ride</Text>
            </Pressable>
          </View>
        </Animated.View>
      )}

      {rideStatus === "requested" && (
        <Animated.View entering={FadeInDown.duration(400)} style={styles.bottomSheet}>
          <View style={styles.sheetHandle} />
          <View style={styles.searchingContainer}>
            <ActivityIndicator size="large" color={Colors.white} />
            <Text style={styles.searchingText}>Finding your driver...</Text>
            <Text style={styles.searchingSubtext}>Searching for available {selectedVehicle.name} drivers nearby</Text>
          </View>
          <Pressable style={styles.cancelFullBtn} onPress={cancelRide}>
            <Text style={styles.cancelFullBtnText}>Cancel Request</Text>
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
            <View style={styles.chauffeurAvatar}>
              <Ionicons name="person" size={24} color={Colors.white} />
            </View>
            <View style={styles.chauffeurInfo}>
              <Text style={styles.chauffeurName}>{chauffeurDetails?.driverName || "Your Driver"}</Text>
              <Text style={styles.chauffeurVehicle}>
                {chauffeurDetails?.carMake ? `${chauffeurDetails.carMake} ` : ""}{chauffeurDetails?.vehicleModel || selectedVehicle.name}
              </Text>
              {chauffeurDetails && (
                <View style={styles.driverMeta}>
                  <View style={styles.ratingChip}>
                    <Ionicons name="star" size={11} color={Colors.warning} />
                    <Text style={styles.ratingChipText}>{(chauffeurDetails.driverRating || 5.0).toFixed(1)}</Text>
                  </View>
                  <Text style={styles.plateText}>{chauffeurDetails.plateNumber}</Text>
                  <Text style={styles.colorDot}>{chauffeurDetails.carColor}</Text>
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
            />
          </View>

          <View style={styles.ratingActions}>
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
      )}

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
  avatarCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  mapArea: {
    flex: 1,
    overflow: "hidden",
  },
  bottomSheet: {
    backgroundColor: Colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 40,
    gap: 16,
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
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
  },
  confirmBtnText: {
    fontSize: 16,
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
    flex: 1,
    backgroundColor: Colors.white,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
  },
  requestBtnText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: Colors.primary,
  },
  searchingContainer: {
    alignItems: "center",
    gap: 12,
    paddingVertical: 20,
  },
  searchingText: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
    color: Colors.white,
  },
  searchingSubtext: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
    textAlign: "center",
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
  chauffeurAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.accent,
    alignItems: "center",
    justifyContent: "center",
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
});

import React, { useRef, useEffect, useMemo, useCallback } from "react";
import { View, Text, StyleSheet, ActivityIndicator, Platform } from "react-native";
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from "react-native-maps";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

const GOOGLE_MAPS_API_KEY =
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY ||
  "AIzaSyAY-_nYP4PvZcKDaY-KVuZXx0oB0syx1N0";

// Fallback region — Johannesburg CBD. Used when GPS not yet acquired so map
// never renders at world zoom level.
const DEFAULT_REGION = { lat: -26.2041, lng: 28.0473 };

const DARK_MAP_STYLE = [
  { elementType: "geometry", stylers: [{ color: "#1d1d1d" }] },
  { elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#757575" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#212121" }] },
  { featureType: "administrative", elementType: "geometry", stylers: [{ color: "#757575" }] },
  { featureType: "administrative.country", elementType: "labels.text.fill", stylers: [{ color: "#9e9e9e" }] },
  { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#bdbdbd" }] },
  { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#757575" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#181818" }] },
  { featureType: "poi.park", elementType: "labels.text.fill", stylers: [{ color: "#616161" }] },
  { featureType: "road", elementType: "geometry.fill", stylers: [{ color: "#2c2c2c" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#8a8a8a" }] },
  { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#373737" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#3c3c3c" }] },
  { featureType: "road.highway.controlled_access", elementType: "geometry", stylers: [{ color: "#4e4e4e" }] },
  { featureType: "road.local", elementType: "labels.text.fill", stylers: [{ color: "#616161" }] },
  { featureType: "transit", elementType: "labels.text.fill", stylers: [{ color: "#757575" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0e0e0e" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#3d3d3d" }] },
];

function decodePolyline(encoded: string): { latitude: number; longitude: number }[] {
  const points: { latitude: number; longitude: number }[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < encoded.length) {
    let b: number;
    let shift = 0;
    let result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;
    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;
    points.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }
  return points;
}

interface NearbyDriver {
  id: string | number;
  lat: number;
  lng: number;
}

interface A2BMapProps {
  pickupLocation: { lat: number; lng: number } | null;
  dropoffLocation?: { lat: number; lng: number } | null;
  driverLocation?: { lat: number; lng: number } | null;
  nearbyDrivers?: NearbyDriver[];
  routePolyline?: string | null;
  showDriver?: boolean;
  followDriver?: boolean;
  loading?: boolean;
  etaText?: string;
  statusText?: string;
}

export default function A2BMap({
  pickupLocation,
  dropoffLocation,
  driverLocation,
  nearbyDrivers = [],
  routePolyline,
  showDriver = false,
  followDriver = false,
  loading = false,
  etaText,
  statusText,
}: A2BMapProps) {
  const mapRef = useRef<MapView>(null);
  const mapReadyRef = useRef(false);
  const pendingFitRef = useRef(false);
  const hasMovedRef = useRef(false); // true once we've done the first real fitMap

  // Use user's location for initialRegion if available, else Johannesburg
  const center = pickupLocation || DEFAULT_REGION;
  const initialRegionRef = useRef({
    latitude: center.lat,
    longitude: center.lng,
    latitudeDelta: 0.004,
    longitudeDelta: 0.004,
  });

  const routeCoords = useMemo(() => {
    if (!routePolyline) return [];
    return decodePolyline(routePolyline);
  }, [routePolyline]);

  const fitMap = useCallback(() => {
    if (!mapRef.current || !mapReadyRef.current) {
      pendingFitRef.current = true;
      return;
    }
    pendingFitRef.current = false;
    hasMovedRef.current = true;

    if (followDriver && driverLocation) {
      mapRef.current.animateToRegion({
        latitude: driverLocation.lat,
        longitude: driverLocation.lng,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      }, 800);
    } else if (routeCoords.length > 0) {
      mapRef.current.fitToCoordinates(routeCoords, {
        edgePadding: { top: 80, right: 60, bottom: 220, left: 60 },
        animated: true,
      });
    } else if (pickupLocation && dropoffLocation) {
      mapRef.current.fitToCoordinates(
        [
          { latitude: pickupLocation.lat, longitude: pickupLocation.lng },
          { latitude: dropoffLocation.lat, longitude: dropoffLocation.lng },
        ],
        { edgePadding: { top: 80, right: 60, bottom: 220, left: 60 }, animated: true }
      );
    } else {
      // Always street-level — never world zoom
      const center = pickupLocation || DEFAULT_REGION;
      mapRef.current.animateToRegion({
        latitude: center.lat,
        longitude: center.lng,
        latitudeDelta: 0.004,
        longitudeDelta: 0.004,
      }, 600);
    }
  }, [pickupLocation, dropoffLocation, driverLocation, routeCoords, followDriver]);

  function handleMapReady() {
    mapReadyRef.current = true;
    fitMap();
    setTimeout(fitMap, 300);
    setTimeout(fitMap, 800);
  }

  useEffect(() => {
    fitMap();
  }, [fitMap]);

  // Extra safety: whenever pickupLocation first becomes available,
  // force the camera to street level immediately
  useEffect(() => {
    if (!pickupLocation || !mapRef.current || !mapReadyRef.current) return;
    if (routeCoords.length > 0 || dropoffLocation) return; // handled below
    mapRef.current.animateToRegion({
      latitude: pickupLocation.lat,
      longitude: pickupLocation.lng,
      latitudeDelta: 0.004,
      longitudeDelta: 0.004,
    }, 400);
  }, [pickupLocation?.lat, pickupLocation?.lng]);

  // Fit to both markers whenever pickup + dropoff are set (no route yet)
  useEffect(() => {
    if (!pickupLocation || !dropoffLocation) return;
    if (routeCoords.length > 0) return; // route polyline effect handles this
    const tryFit = () => {
      if (!mapRef.current || !mapReadyRef.current) return;
      mapRef.current.fitToCoordinates(
        [
          { latitude: pickupLocation.lat, longitude: pickupLocation.lng },
          { latitude: dropoffLocation.lat, longitude: dropoffLocation.lng },
        ],
        { edgePadding: { top: 80, right: 60, bottom: 260, left: 60 }, animated: true }
      );
    };
    const t1 = setTimeout(tryFit, 500);
    const t2 = setTimeout(tryFit, 1200);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [pickupLocation?.lat, pickupLocation?.lng, dropoffLocation?.lat, dropoffLocation?.lng]);

  // Fit to route polyline whenever it becomes available (with retries)
  useEffect(() => {
    if (routeCoords.length === 0) return;
    const tryFit = () => {
      if (!mapRef.current || !mapReadyRef.current) return;
      mapRef.current.fitToCoordinates(routeCoords, {
        edgePadding: { top: 80, right: 60, bottom: 260, left: 60 },
        animated: true,
      });
    };
    const t1 = setTimeout(tryFit, 400);
    const t2 = setTimeout(tryFit, 1000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [routeCoords]);

  if (!GOOGLE_MAPS_API_KEY) {
    return (
      <View style={styles.fallback}>
        <ActivityIndicator size="large" color={Colors.white} />
        <Text style={styles.fallbackText}>Map Loading...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {(loading || !pickupLocation) && (
        <View style={styles.locatingOverlay}>
          <ActivityIndicator size="small" color={Colors.white} />
          <Text style={styles.locatingText}>Locating you...</Text>
        </View>
      )}
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={Platform.OS === "web" ? undefined : PROVIDER_GOOGLE}
        customMapStyle={DARK_MAP_STYLE}
        initialRegion={initialRegionRef.current}
        onMapReady={handleMapReady}
        showsUserLocation={true}
        showsMyLocationButton={false}
        showsCompass={false}
        showsTraffic={false}
        showsBuildings={false}
        showsIndoors={false}
        toolbarEnabled={false}
        mapPadding={{ top: 0, right: 0, bottom: 0, left: 0 }}
        googleMapsApiKey={GOOGLE_MAPS_API_KEY}
      >
        {pickupLocation && (
          <Marker
            coordinate={{ latitude: pickupLocation.lat, longitude: pickupLocation.lng }}
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <View style={styles.pickupMarker}>
              <View style={styles.pickupDot} />
            </View>
          </Marker>
        )}

        {dropoffLocation && (
          <Marker
            coordinate={{ latitude: dropoffLocation.lat, longitude: dropoffLocation.lng }}
            anchor={{ x: 0.5, y: 1 }}
          >
            <View style={styles.dropoffMarker}>
              <Ionicons name="location" size={28} color={Colors.white} />
            </View>
          </Marker>
        )}

        {/* Nearby idle drivers shown when not in an active ride */}
        {!showDriver && nearbyDrivers.map((driver) => (
          <Marker
            key={`nearby-${driver.id}`}
            coordinate={{ latitude: driver.lat, longitude: driver.lng }}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={false}
          >
            <View style={styles.nearbyDriverMarker}>
              <Ionicons name="car-sport" size={16} color="#000" />
            </View>
          </Marker>
        ))}

        {showDriver && driverLocation && (
          <Marker
            coordinate={{ latitude: driverLocation.lat, longitude: driverLocation.lng }}
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <View style={styles.driverMarker}>
              <Ionicons name="car-sport" size={20} color="#000" />
            </View>
          </Marker>
        )}

        {routeCoords.length > 0 && (
          <Polyline
            coordinates={routeCoords}
            strokeColor="#276EF1"
            strokeWidth={5}
            lineDashPattern={undefined}
          />
        )}
      </MapView>

      {statusText && (
        <View style={styles.statusOverlay}>
          <Text style={styles.statusOverlayText}>{statusText}</Text>
          {etaText && <Text style={styles.etaOverlayText}>{etaText}</Text>}
        </View>
      )}

      <View style={styles.gradientTop} />
      <View style={styles.gradientBottom} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: "hidden",
  },
  map: {
    flex: 1,
  },
  fallback: {
    flex: 1,
    backgroundColor: "#1a1a2e",
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  fallbackText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
  },
  locatingOverlay: {
    position: "absolute",
    top: 12,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(0,0,0,0.7)",
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    zIndex: 10,
  },
  locatingText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: Colors.white,
  },
  pickupMarker: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.7)",
    borderWidth: 2,
    borderColor: Colors.white,
    alignItems: "center",
    justifyContent: "center",
  },
  pickupDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.white,
  },
  dropoffMarker: {
    alignItems: "center",
  },
  driverMarker: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.white,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#000",
  },
  nearbyDriverMarker: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#FFD700",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "#000",
  },
  statusOverlay: {
    position: "absolute",
    top: 16,
    left: 20,
    right: 20,
    backgroundColor: "rgba(0,0,0,0.85)",
    borderRadius: 14,
    padding: 14,
    alignItems: "center",
    gap: 4,
  },
  statusOverlayText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.white,
    letterSpacing: 0.5,
  },
  etaOverlayText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
  },
  gradientTop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 40,
    backgroundColor: "rgba(0,0,0,0.3)",
  },
  gradientBottom: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 60,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
});

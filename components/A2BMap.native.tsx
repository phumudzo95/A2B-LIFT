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

// Compute a MapView region from an array of coordinates with padding.
// Using animateToRegion is more reliable than fitToCoordinates on iOS PROVIDER_GOOGLE in Expo Go.
function computeRegion(
  coords: { latitude: number; longitude: number }[],
  extraPadFactor = 0.35
) {
  const lats = coords.map(c => c.latitude);
  const lngs = coords.map(c => c.longitude);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const latDelta = Math.max((maxLat - minLat) * (1 + extraPadFactor), 0.01);
  const lngDelta = Math.max((maxLng - minLng) * (1 + extraPadFactor), 0.01);
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: latDelta,
    longitudeDelta: lngDelta,
  };
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
  const driverMarkerRef = useRef<any>(null);
  // Store initial driver coordinate so the Marker's coordinate prop never changes (prevents blink).
  // Position updates are done imperatively via animateMarkerToCoordinate.
  const initialDriverCoordRef = useRef<{ latitude: number; longitude: number } | null>(null);
  if (!initialDriverCoordRef.current && driverLocation) {
    initialDriverCoordRef.current = { latitude: driverLocation.lat, longitude: driverLocation.lng };
  }

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

  // Fly the camera to a computed region — more reliable than fitToCoordinates on iOS
  const zoomToCoords = useCallback((
    coords: { latitude: number; longitude: number }[],
    duration = 700
  ) => {
    if (!mapRef.current || coords.length === 0) return;
    const region = computeRegion(coords);
    mapRef.current.animateToRegion(region, duration);
  }, []);

  const fitMap = useCallback(() => {
    if (!mapRef.current) return;

    if (followDriver && driverLocation) {
      mapRef.current.animateToRegion({
        latitude: driverLocation.lat,
        longitude: driverLocation.lng,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      }, 800);
    } else if (routeCoords.length > 0) {
      zoomToCoords(routeCoords);
    } else if (pickupLocation && dropoffLocation) {
      zoomToCoords([
        { latitude: pickupLocation.lat, longitude: pickupLocation.lng },
        { latitude: dropoffLocation.lat, longitude: dropoffLocation.lng },
      ]);
    } else {
      const center = pickupLocation || DEFAULT_REGION;
      mapRef.current.animateToRegion({
        latitude: center.lat,
        longitude: center.lng,
        latitudeDelta: 0.004,
        longitudeDelta: 0.004,
      }, 600);
    }
  }, [pickupLocation, dropoffLocation, driverLocation, routeCoords, followDriver, zoomToCoords]);

  function handleMapReady() {
    mapReadyRef.current = true;
    fitMap();
    setTimeout(fitMap, 400);
  }

  useEffect(() => {
    fitMap();
  }, [fitMap]);

  // Zoom to user location when GPS first arrives (no route/dropoff set yet)
  useEffect(() => {
    if (!pickupLocation || !mapRef.current) return;
    if (routeCoords.length > 0 || dropoffLocation) return;
    mapRef.current.animateToRegion({
      latitude: pickupLocation.lat,
      longitude: pickupLocation.lng,
      latitudeDelta: 0.004,
      longitudeDelta: 0.004,
    }, 400);
  }, [pickupLocation?.lat, pickupLocation?.lng]);

  // Zoom to show pickup + dropoff when dropoff is set (before route loads)
  useEffect(() => {
    if (!pickupLocation || !dropoffLocation) return;
    if (routeCoords.length > 0) return;
    const coords = [
      { latitude: pickupLocation.lat, longitude: pickupLocation.lng },
      { latitude: dropoffLocation.lat, longitude: dropoffLocation.lng },
    ];
    const t1 = setTimeout(() => zoomToCoords(coords, 700), 200);
    const t2 = setTimeout(() => zoomToCoords(coords, 700), 800);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [pickupLocation?.lat, pickupLocation?.lng, dropoffLocation?.lat, dropoffLocation?.lng, zoomToCoords]);

  // Zoom to route when polyline arrives — fires with retries, no mapReady gate needed
  useEffect(() => {
    if (routeCoords.length === 0) return;
    const t1 = setTimeout(() => zoomToCoords(routeCoords, 700), 200);
    const t2 = setTimeout(() => zoomToCoords(routeCoords, 700), 900);
    const t3 = setTimeout(() => zoomToCoords(routeCoords, 700), 2000);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [routeCoords, zoomToCoords]);

  // Smoothly animate driver marker to new GPS position — no React re-render so no blink
  useEffect(() => {
    if (!driverLocation || !driverMarkerRef.current) return;
    if (!initialDriverCoordRef.current) {
      initialDriverCoordRef.current = { latitude: driverLocation.lat, longitude: driverLocation.lng };
    }
    try {
      driverMarkerRef.current.animateMarkerToCoordinate(
        { latitude: driverLocation.lat, longitude: driverLocation.lng },
        400
      );
    } catch {}
  }, [driverLocation?.lat, driverLocation?.lng]);

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

        {showDriver && initialDriverCoordRef.current && (
          <Marker
            ref={driverMarkerRef}
            identifier="driver-marker"
            coordinate={initialDriverCoordRef.current}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={false}
            tracksInfoWindowChanges={false}
            flat={true}
          >
            <View style={styles.driverMarker}>
              <Ionicons name="car-sport" size={20} color="#000" />
            </View>
          </Marker>
        )}

        {routeCoords.length > 0 && (
          <Polyline
            coordinates={routeCoords}
            strokeColor="#FFFFFF"
            strokeWidth={5}
            zIndex={10}
            geodesic={true}
            lineCap="round"
            lineJoin="round"
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

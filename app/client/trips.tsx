import React, { useCallback } from "react";
import { View, Text, StyleSheet, FlatList, ActivityIndicator, Platform, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import Colors from "@/constants/colors";

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  searching:          { label: "Searching",   color: Colors.warning },
  requested:          { label: "Searching",   color: Colors.warning },
  chauffeur_assigned: { label: "Assigned",    color: "#4A9EFF" },
  chauffeur_arriving: { label: "Arriving",    color: "#4A9EFF" },
  trip_started:       { label: "In Progress", color: "#A78BFA" },
  trip_completed:     { label: "Completed",   color: Colors.success },
  cancelled:          { label: "Cancelled",   color: Colors.error },
};

function getStatusConfig(status: string) {
  return STATUS_CONFIG[status] ?? { label: status, color: Colors.textSecondary };
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" });
}

function formatTime(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" });
}

export default function TripsScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const { data: trips, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["/api/rides/client", user?.id ?? ""],
    enabled: !!user?.id,
  });

  const renderTrip = useCallback(({ item }: { item: any }) => {
    const { label, color } = getStatusConfig(item.status);
    const isActive = ["searching", "requested", "chauffeur_assigned", "chauffeur_arriving", "trip_started"].includes(item.status);

    return (
      <View style={[styles.tripCard, isActive && styles.tripCardActive]}>
        {/* Status + date row */}
        <View style={styles.tripHeader}>
          <View style={[styles.statusChip, { backgroundColor: `${color}22` }]}>
            <View style={[styles.statusDot, { backgroundColor: color }]} />
            <Text style={[styles.statusLabel, { color }]}>{label}</Text>
          </View>
          <View style={styles.dateTimeRow}>
            <Text style={styles.tripDate}>{formatDate(item.createdAt)}</Text>
            <Text style={styles.tripTime}>{formatTime(item.createdAt)}</Text>
          </View>
        </View>

        {/* Route */}
        <View style={styles.routeRow}>
          <View style={styles.routeDots}>
            <View style={styles.dotGreen} />
            <View style={styles.routeLine} />
            <View style={styles.dotRed} />
          </View>
          <View style={styles.routeAddresses}>
            <Text style={styles.routeAddress} numberOfLines={1}>
              {item.pickupAddress || "Pickup location"}
            </Text>
            <Text style={styles.routeAddress} numberOfLines={1}>
              {item.dropoffAddress || "Dropoff location"}
            </Text>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.tripFooter}>
          <Text style={styles.vehicleType}>
            {item.vehicleType ? item.vehicleType.replace("_", " ").replace(/\b\w/g, (c: string) => c.toUpperCase()) : "Standard"}
          </Text>
          {item.distanceKm ? (
            <Text style={styles.tripDistance}>{Number(item.distanceKm).toFixed(1)} km</Text>
          ) : null}
          <Text style={styles.tripPrice}>
            {item.price ? `R ${Number(item.price).toFixed(0)}` : "—"}
          </Text>
        </View>
      </View>
    );
  }, []);

  return (
    <View style={[styles.container, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 16) }]}>
      <Text style={styles.title}>Trip History</Text>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.white} />
        </View>
      ) : !trips || (Array.isArray(trips) && (trips as any[]).length === 0) ? (
        <View style={styles.center}>
          <Ionicons name="car-sport-outline" size={52} color={Colors.textMuted} />
          <Text style={styles.emptyText}>No trips yet</Text>
          <Text style={styles.emptySubtext}>Your ride history will appear here</Text>
        </View>
      ) : (
        <FlatList
          data={Array.isArray(trips) ? (trips as any[]) : []}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderTrip}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={Colors.white}
            />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.primary,
    paddingHorizontal: 20,
  },
  title: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    color: Colors.white,
    marginBottom: 20,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  emptyText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: Colors.textSecondary,
    marginTop: 8,
  },
  emptySubtext: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
  },
  list: {
    gap: 12,
    paddingBottom: 100,
  },
  tripCard: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 16,
    gap: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  tripCardActive: {
    borderColor: "#4A9EFF44",
  },
  tripHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  statusChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusLabel: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  dateTimeRow: {
    alignItems: "flex-end",
    gap: 1,
  },
  tripDate: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
  },
  tripTime: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
  },
  routeRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "stretch",
  },
  routeDots: {
    alignItems: "center",
    paddingVertical: 2,
    gap: 3,
  },
  dotGreen: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.success,
  },
  routeLine: {
    width: 1.5,
    flex: 1,
    minHeight: 16,
    backgroundColor: Colors.border,
  },
  dotRed: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.error,
  },
  routeAddresses: {
    flex: 1,
    gap: 10,
  },
  routeAddress: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
  },
  tripFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  vehicleType: {
    flex: 1,
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: Colors.textMuted,
    textTransform: "capitalize",
  },
  tripDistance: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
  },
  tripPrice: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    color: Colors.white,
  },
});

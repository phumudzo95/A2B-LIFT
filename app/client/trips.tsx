import React, { useCallback } from "react";
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator, Platform, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { getApiUrl } from "@/lib/query-client";
import Colors from "@/constants/colors";

export default function TripsScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const { data: trips, isLoading, refetch } = useQuery({
    queryKey: ["/api/rides/client", user?.id || ""],
    enabled: !!user,
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case "trip_completed": return Colors.success;
      case "cancelled": return Colors.error;
      case "requested": return Colors.warning;
      default: return Colors.textSecondary;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "trip_completed": return "Completed";
      case "cancelled": return "Cancelled";
      case "requested": return "Requested";
      case "chauffeur_assigned": return "Assigned";
      case "chauffeur_arriving": return "Arriving";
      case "trip_started": return "In Progress";
      default: return status;
    }
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" });
  };

  const renderTrip = useCallback(({ item }: { item: any }) => (
    <View style={styles.tripCard}>
      <View style={styles.tripTop}>
        <View style={styles.tripRoute}>
          <View style={styles.routePoints}>
            <View style={styles.dotGreen} />
            <View style={styles.routeLine} />
            <View style={styles.dotRed} />
          </View>
          <View style={styles.routeTexts}>
            <Text style={styles.routeAddress} numberOfLines={1}>{item.pickupAddress || "Pickup location"}</Text>
            <Text style={styles.routeAddress} numberOfLines={1}>{item.dropoffAddress || "Dropoff location"}</Text>
          </View>
        </View>
        <View style={[styles.statusChip, { backgroundColor: `${getStatusColor(item.status)}20` }]}>
          <View style={[styles.statusChipDot, { backgroundColor: getStatusColor(item.status) }]} />
          <Text style={[styles.statusChipText, { color: getStatusColor(item.status) }]}>{getStatusLabel(item.status)}</Text>
        </View>
      </View>
      <View style={styles.tripBottom}>
        <Text style={styles.tripDate}>{formatDate(item.createdAt)}</Text>
        <Text style={styles.tripPrice}>R {item.price || "—"}</Text>
      </View>
    </View>
  ), []);

  return (
    <View style={[styles.container, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 16) }]}>
      <Text style={styles.title}>Trip History</Text>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.white} />
        </View>
      ) : !trips || (Array.isArray(trips) && trips.length === 0) ? (
        <View style={styles.center}>
          <Ionicons name="car-sport-outline" size={48} color={Colors.textMuted} />
          <Text style={styles.emptyText}>No trips yet</Text>
          <Text style={styles.emptySubtext}>Your ride history will appear here</Text>
        </View>
      ) : (
        <FlatList
          data={Array.isArray(trips) ? trips : []}
          keyExtractor={(item) => item.id}
          renderItem={renderTrip}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={false} onRefresh={refetch} tintColor={Colors.white} />}
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
    gap: 8,
  },
  emptyText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: Colors.textSecondary,
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
    borderRadius: 14,
    padding: 16,
    gap: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  tripTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  tripRoute: {
    flex: 1,
    flexDirection: "row",
    gap: 10,
  },
  routePoints: {
    alignItems: "center",
    paddingVertical: 2,
    gap: 2,
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
    backgroundColor: Colors.accent,
  },
  dotRed: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.error,
  },
  routeTexts: {
    flex: 1,
    justifyContent: "space-between",
    gap: 8,
  },
  routeAddress: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
  },
  statusChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    alignSelf: "flex-start",
  },
  statusChipDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusChipText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  tripBottom: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  tripDate: {
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

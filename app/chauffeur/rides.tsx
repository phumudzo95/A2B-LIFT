import React, { useState, useEffect, useCallback } from "react";
import { View, Text, StyleSheet, FlatList, ActivityIndicator, Platform, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery } from "@tanstack/react-query";
import Colors from "@/constants/colors";

export default function ChauffeurRidesScreen() {
  const insets = useSafeAreaInsets();
  const [chauffeurId, setChauffeurId] = useState<string | null>(null);

  useEffect(() => {
    AsyncStorage.getItem("a2b_chauffeur").then((stored) => {
      if (stored) setChauffeurId(JSON.parse(stored).id);
    });
  }, []);

  const { data: rides, isLoading, refetch } = useQuery({
    queryKey: ["/api/rides/chauffeur", chauffeurId || ""],
    enabled: !!chauffeurId,
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case "trip_completed": return Colors.success;
      case "cancelled": return Colors.error;
      default: return Colors.warning;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "trip_completed": return "Completed";
      case "cancelled": return "Cancelled";
      case "chauffeur_assigned": return "Assigned";
      case "chauffeur_arriving": return "Arriving";
      case "trip_started": return "In Progress";
      default: return status;
    }
  };

  const renderRide = useCallback(({ item }: { item: any }) => (
    <View style={styles.rideCard}>
      <View style={styles.rideTop}>
        <View style={styles.routeCol}>
          <View style={styles.routeRow}>
            <View style={styles.dotGreen} />
            <Text style={styles.routeText} numberOfLines={1}>{item.pickupAddress || "Pickup"}</Text>
          </View>
          <View style={styles.routeRow}>
            <View style={styles.dotRed} />
            <Text style={styles.routeText} numberOfLines={1}>{item.dropoffAddress || "Dropoff"}</Text>
          </View>
        </View>
      </View>
      <View style={styles.rideBottom}>
        <View style={[styles.statusChip, { backgroundColor: `${getStatusColor(item.status)}20` }]}>
          <Text style={[styles.statusChipText, { color: getStatusColor(item.status) }]}>{getStatusLabel(item.status)}</Text>
        </View>
        <Text style={styles.ridePrice}>R {item.price || "—"}</Text>
      </View>
    </View>
  ), []);

  return (
    <View style={[styles.container, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 16) }]}>
      <Text style={styles.title}>My Rides</Text>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.white} />
        </View>
      ) : !rides || (Array.isArray(rides) && rides.length === 0) ? (
        <View style={styles.center}>
          <Ionicons name="car-sport-outline" size={48} color={Colors.textMuted} />
          <Text style={styles.emptyText}>No rides yet</Text>
          <Text style={styles.emptySubtext}>Go online to receive ride requests</Text>
        </View>
      ) : (
        <FlatList
          data={Array.isArray(rides) ? rides : []}
          keyExtractor={(item) => item.id}
          renderItem={renderRide}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={false} onRefresh={refetch} tintColor={Colors.white} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.primary, paddingHorizontal: 20 },
  title: { fontSize: 24, fontFamily: "Inter_700Bold", color: Colors.white, marginBottom: 20 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
  emptyText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: Colors.textSecondary },
  emptySubtext: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textMuted },
  list: { gap: 12, paddingBottom: 100 },
  rideCard: { backgroundColor: Colors.card, borderRadius: 14, padding: 16, gap: 12, borderWidth: 1, borderColor: Colors.border },
  rideTop: { gap: 8 },
  routeCol: { gap: 8 },
  routeRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  dotGreen: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.success },
  dotRed: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.error },
  routeText: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
  rideBottom: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  statusChip: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  statusChipText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  ridePrice: { fontSize: 16, fontFamily: "Inter_700Bold", color: Colors.white },
});

import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, TextInput, ActivityIndicator, Alert, RefreshControl, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { apiRequest } from "@/lib/query-client";
import Colors from "@/constants/colors";

const emptyForm = { carMake: "", vehicleModel: "", vehicleYear: "", plateNumber: "", vehicleType: "budget", carColor: "", passengerCapacity: "4", luggageCapacity: "2" };

export default function VehiclesScreen() {
  const insets = useSafeAreaInsets();
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await apiRequest("GET", "/api/vehicles");
      const data = await res.json();
      setVehicles(Array.isArray(data.vehicles) ? data.vehicles : []);
      setAssignments(Array.isArray(data.assignments) ? data.assignments : []);
    } catch {
      Alert.alert("Error", "Could not load vehicles.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function update(field: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function createVehicle() {
    if (!form.carMake.trim() || !form.vehicleModel.trim() || !form.vehicleYear.trim() || !form.plateNumber.trim() || !form.carColor.trim()) {
      Alert.alert("Missing details", "Please complete the vehicle details.");
      return;
    }
    setSaving(true);
    try {
      await apiRequest("POST", "/api/vehicles", {
        ...form,
        vehicleYear: Number.parseInt(form.vehicleYear, 10),
        passengerCapacity: Number.parseInt(form.passengerCapacity, 10) || 4,
        luggageCapacity: Number.parseInt(form.luggageCapacity, 10) || 2,
      });
      setForm(emptyForm);
      await load();
    } catch (e: any) {
      Alert.alert("Vehicle not saved", e.message || "Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function selectVehicle(vehicleId: string) {
    try {
      await apiRequest("POST", `/api/vehicles/${vehicleId}/select-active`);
      Alert.alert("Vehicle selected", "You can now go online with this vehicle.");
      await load();
    } catch (e: any) {
      Alert.alert("Cannot select vehicle", e.message || "Vehicle must be approved and assigned to you.");
    }
  }

  if (loading) {
    return <View style={[styles.container, styles.center]}><ActivityIndicator color={Colors.white} /></View>;
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 14) }]}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}><Ionicons name="arrow-back" size={22} color={Colors.white} /></Pressable>
        <Text style={styles.title}>Vehicles</Text>
        <View style={styles.backBtn} />
      </View>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.white} />}
      >
        <Text style={styles.sectionTitle}>Add vehicle</Text>
        <View style={styles.form}>
          {([
            ["carMake", "Car Make"],
            ["vehicleModel", "Car Model"],
            ["vehicleYear", "Model Year"],
            ["plateNumber", "Plate Number"],
            ["vehicleType", "Category"],
            ["carColor", "Color"],
            ["passengerCapacity", "Passengers"],
            ["luggageCapacity", "Luggage"],
          ] as const).map(([field, label]) => (
            <TextInput
              key={field}
              style={styles.input}
              value={form[field]}
              onChangeText={(value) => update(field, value)}
              placeholder={label}
              placeholderTextColor={Colors.textMuted}
              keyboardType={field.includes("Year") || field.includes("Capacity") ? "number-pad" : "default"}
              autoCapitalize={field === "plateNumber" ? "characters" : "words"}
            />
          ))}
          <Pressable style={[styles.submitBtn, saving && { opacity: 0.7 }]} onPress={createVehicle} disabled={saving}>
            {saving ? <ActivityIndicator color={Colors.primary} /> : <Text style={styles.submitText}>Save Vehicle</Text>}
          </Pressable>
        </View>

        <Text style={styles.sectionTitle}>My vehicles</Text>
        {vehicles.length === 0 ? (
          <Text style={styles.emptyText}>No vehicles yet.</Text>
        ) : vehicles.map((vehicle) => {
          const assigned = assignments.some((assignment) => assignment.vehicleId === vehicle.id && assignment.status === "active");
          return (
            <View key={vehicle.id} style={styles.vehicleCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.vehicleTitle}>{vehicle.carMake} {vehicle.vehicleModel}</Text>
                <Text style={styles.vehicleMeta}>{vehicle.plateNumber} · {vehicle.vehicleYear} · {vehicle.status}</Text>
              </View>
              {vehicle.status === "approved" && assigned && (
                <Pressable style={styles.selectBtn} onPress={() => selectVehicle(vehicle.id)}>
                  <Text style={styles.selectText}>Select</Text>
                </Pressable>
              )}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.primary },
  center: { alignItems: "center", justifyContent: "center" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 12 },
  backBtn: { width: 38, height: 38, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 18, fontFamily: "Inter_700Bold", color: Colors.white },
  content: { paddingHorizontal: 20 },
  sectionTitle: { fontSize: 13, fontFamily: "Inter_700Bold", color: Colors.textSecondary, textTransform: "uppercase", marginTop: 14, marginBottom: 10 },
  form: { gap: 10, marginBottom: 16 },
  input: { minHeight: 46, borderRadius: 12, paddingHorizontal: 14, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border, color: Colors.white },
  submitBtn: { minHeight: 48, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: Colors.white },
  submitText: { color: Colors.primary, fontFamily: "Inter_700Bold" },
  emptyText: { color: Colors.textMuted, fontFamily: "Inter_400Regular" },
  vehicleCard: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: Colors.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: Colors.border, marginBottom: 10 },
  vehicleTitle: { color: Colors.white, fontFamily: "Inter_700Bold", fontSize: 15 },
  vehicleMeta: { color: Colors.textMuted, fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 4 },
  selectBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: Colors.accent },
  selectText: { color: Colors.white, fontFamily: "Inter_700Bold", fontSize: 12 },
});

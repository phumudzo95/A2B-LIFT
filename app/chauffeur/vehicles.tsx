import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, TextInput, ActivityIndicator, Alert, RefreshControl, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { apiRequest } from "@/lib/query-client";
import { uploadDocument } from "@/lib/supabase-storage";
import Colors from "@/constants/colors";

const emptyForm = { carMake: "", vehicleModel: "", vehicleYear: "", plateNumber: "", vehicleType: "budget", carColor: "", passengerCapacity: "4", luggageCapacity: "2" };
const VEHICLE_DOCS = [
  { id: "vehicle:double_license_disk", label: "Double License Disk" },
  { id: "vehicle:passenger_liability_insurance", label: "Passenger Liability Insurance" },
  { id: "vehicle:dekra_report", label: "Dekra Report" },
];

export default function VehiclesScreen() {
  const insets = useSafeAreaInsets();
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [operatorProfile, setOperatorProfile] = useState<any>(null);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [profileRes, vehicleRes] = await Promise.all([
        apiRequest("GET", "/api/operator-profile/me"),
        apiRequest("GET", "/api/vehicles"),
      ]);
      const profileData = await profileRes.json();
      const data = await vehicleRes.json();
      setOperatorProfile(profileData.profile || null);
      const baseVehicles = Array.isArray(data.vehicles) ? data.vehicles : [];
      const enriched = await Promise.all(baseVehicles.map(async (vehicle) => {
        try {
          const detailRes = await apiRequest("GET", `/api/vehicles/${vehicle.id}`);
          return { ...vehicle, ...(await detailRes.json()) };
        } catch {
          return vehicle;
        }
      }));
      setVehicles(enriched);
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

  async function pickAndUploadDocument(vehicleId: string, type: string) {
    try {
      if (Platform.OS !== "web") {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== "granted") {
          Alert.alert("Permission needed", "Please allow photo access.");
          return;
        }
      }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.65 });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      let url = asset.uri;
      try {
        url = await uploadDocument(asset.uri, vehicleId, type.replace("vehicle:", "vehicle_"));
      } catch {}
      await apiRequest("POST", `/api/vehicles/${vehicleId}/documents`, { type, url });
      await load();
    } catch (e: any) {
      Alert.alert("Upload failed", e.message || "Could not upload this document.");
    }
  }

  async function submitVehicle(vehicleId: string) {
    try {
      await apiRequest("POST", `/api/vehicles/${vehicleId}/submit`);
      Alert.alert("Vehicle submitted", "A2B will review the vehicle documents.");
      await load();
    } catch (e: any) {
      Alert.alert("Cannot submit vehicle", e.message || "Please upload all required documents.");
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
          const vehicleData = vehicle.vehicle || vehicle;
          const docs = Array.isArray(vehicle.documents) ? vehicle.documents : [];
          const uploadedTypes = new Set(docs.map((doc: any) => doc.type));
          const missingDocs = VEHICLE_DOCS.filter((doc) => !uploadedTypes.has(doc.id));
          return (
            <View key={vehicle.id} style={styles.vehicleCard}>
              <View style={styles.vehicleTop}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.vehicleTitle}>{vehicleData.carMake} {vehicleData.vehicleModel}</Text>
                  <Text style={styles.vehicleMeta}>{vehicleData.plateNumber} · {vehicleData.vehicleYear}</Text>
                </View>
                <View style={[styles.statusChip, styles[`status_${vehicleData.status}` as keyof typeof styles] as any]}>
                  <Text style={styles.statusText}>{vehicleData.status}</Text>
                </View>
              </View>

              {vehicleData.status !== "approved" && (
                <View style={styles.docsBlock}>
                  {VEHICLE_DOCS.map((doc) => (
                    <Pressable key={doc.id} style={styles.docRow} onPress={() => pickAndUploadDocument(vehicleData.id, doc.id)}>
                      <Ionicons name={uploadedTypes.has(doc.id) ? "checkmark-circle" : "cloud-upload-outline"} size={18} color={uploadedTypes.has(doc.id) ? Colors.success : Colors.textMuted} />
                      <Text style={styles.docText}>{doc.label}</Text>
                    </Pressable>
                  ))}
                  <Pressable style={[styles.submitBtn, missingDocs.length > 0 && styles.submitBtnMuted]} onPress={() => submitVehicle(vehicleData.id)}>
                    <Text style={styles.submitText}>Submit for Approval</Text>
                  </Pressable>
                </View>
              )}

              {vehicleData.status === "approved" && (
                <View style={styles.actionRow}>
                  {operatorProfile?.type === "driver" && assigned && (
                    <Pressable style={styles.selectBtn} onPress={() => selectVehicle(vehicleData.id)}>
                      <Text style={styles.selectText}>Select for Driving</Text>
                    </Pressable>
                  )}
                  {operatorProfile?.type === "partner" && (
                    <Pressable style={styles.selectBtn} onPress={() => router.push("/chauffeur/fleet" as never)}>
                      <Text style={styles.selectText}>Assign Driver</Text>
                    </Pressable>
                  )}
                </View>
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
  vehicleCard: { gap: 12, backgroundColor: Colors.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: Colors.border, marginBottom: 10 },
  vehicleTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  vehicleTitle: { color: Colors.white, fontFamily: "Inter_700Bold", fontSize: 15 },
  vehicleMeta: { color: Colors.textMuted, fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 4 },
  statusChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: Colors.surface },
  status_draft: { backgroundColor: Colors.surface },
  status_pending: { backgroundColor: "rgba(255,193,7,0.16)" },
  status_approved: { backgroundColor: "rgba(76,175,80,0.16)" },
  status_rejected: { backgroundColor: "rgba(255,77,77,0.16)" },
  status_suspended: { backgroundColor: "rgba(255,77,77,0.16)" },
  statusText: { color: Colors.white, fontFamily: "Inter_700Bold", fontSize: 11, textTransform: "uppercase" },
  docsBlock: { gap: 8 },
  docRow: { minHeight: 40, flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderColor: Colors.border, borderRadius: 10, paddingHorizontal: 12 },
  docText: { color: Colors.white, fontFamily: "Inter_600SemiBold", fontSize: 12, flex: 1 },
  actionRow: { flexDirection: "row", justifyContent: "flex-end" },
  selectBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: Colors.accent },
  selectText: { color: Colors.white, fontFamily: "Inter_700Bold", fontSize: 12 },
  submitBtnMuted: { opacity: 0.85 },
});

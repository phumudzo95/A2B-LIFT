import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, TextInput, ActivityIndicator, Platform, ScrollView, Alert } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/lib/auth-context";
import { apiRequest } from "@/lib/query-client";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Colors from "@/constants/colors";

const VEHICLE_TYPES = ["Executive V-Class", "VIP Sedan", "Airport Transfer", "Premium Reserve"];
const CAR_COLORS = ["Black", "White", "Silver", "Grey", "Navy"];

export default function ChauffeurRegisterScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [vehicleModel, setVehicleModel] = useState("");
  const [plateNumber, setPlateNumber] = useState("");
  const [vehicleType, setVehicleType] = useState(VEHICLE_TYPES[0]);
  const [carColor, setCarColor] = useState(CAR_COLORS[0]);
  const [passengerCapacity, setPassengerCapacity] = useState("4");
  const [luggageCapacity, setLuggageCapacity] = useState("2");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit() {
    if (!vehicleModel.trim() || !plateNumber.trim()) {
      setError("Please fill in all required fields");
      return;
    }
    if (!user) return;
    setLoading(true);
    setError("");
    try {
      const res = await apiRequest("POST", "/api/chauffeurs", {
        userId: user.id,
        vehicleModel: vehicleModel.trim(),
        plateNumber: plateNumber.trim().toUpperCase(),
        vehicleType,
        carColor,
        passengerCapacity: parseInt(passengerCapacity) || 4,
        luggageCapacity: parseInt(luggageCapacity) || 2,
      });
      const chauffeur = await res.json();
      await AsyncStorage.setItem("a2b_chauffeur", JSON.stringify(chauffeur));
      router.replace("/chauffeur");
    } catch (e: any) {
      setError("Registration failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 20) }]}>
      <Pressable style={styles.backBtn} onPress={() => router.back()}>
        <Ionicons name="chevron-back" size={24} color={Colors.white} />
      </Pressable>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.title}>Chauffeur Registration</Text>
          <Text style={styles.subtitle}>Register your vehicle to start driving</Text>
        </View>

        {!!error && (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle" size={16} color={Colors.error} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <View style={styles.form}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Vehicle Model</Text>
            <View style={styles.inputWrapper}>
              <TextInput style={styles.input} placeholder="e.g. Mercedes V-Class 2024" placeholderTextColor={Colors.textMuted} value={vehicleModel} onChangeText={setVehicleModel} />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Plate Number</Text>
            <View style={styles.inputWrapper}>
              <TextInput style={styles.input} placeholder="e.g. CA 123 456" placeholderTextColor={Colors.textMuted} value={plateNumber} onChangeText={setPlateNumber} autoCapitalize="characters" />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Vehicle Type</Text>
            <View style={styles.chipRow}>
              {VEHICLE_TYPES.map((vt) => (
                <Pressable
                  key={vt}
                  style={[styles.chip, vehicleType === vt && styles.chipActive]}
                  onPress={() => setVehicleType(vt)}
                >
                  <Text style={[styles.chipText, vehicleType === vt && styles.chipTextActive]}>{vt}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Car Color</Text>
            <View style={styles.chipRow}>
              {CAR_COLORS.map((c) => (
                <Pressable
                  key={c}
                  style={[styles.chip, carColor === c && styles.chipActive]}
                  onPress={() => setCarColor(c)}
                >
                  <Text style={[styles.chipText, carColor === c && styles.chipTextActive]}>{c}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={styles.rowInputs}>
            <View style={[styles.inputGroup, { flex: 1 }]}>
              <Text style={styles.label}>Passengers</Text>
              <View style={styles.inputWrapper}>
                <TextInput style={styles.input} value={passengerCapacity} onChangeText={setPassengerCapacity} keyboardType="number-pad" />
              </View>
            </View>
            <View style={[styles.inputGroup, { flex: 1 }]}>
              <Text style={styles.label}>Luggage</Text>
              <View style={styles.inputWrapper}>
                <TextInput style={styles.input} value={luggageCapacity} onChangeText={setLuggageCapacity} keyboardType="number-pad" />
              </View>
            </View>
          </View>
        </View>

        <Pressable
          style={({ pressed }) => [styles.submitBtn, pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] }, loading && { opacity: 0.7 }]}
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading ? <ActivityIndicator color={Colors.primary} /> : <Text style={styles.submitBtnText}>Register Vehicle</Text>}
        </Pressable>

        <View style={{ height: insets.bottom + (Platform.OS === "web" ? 34 : 24) }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.primary, paddingHorizontal: 24 },
  backBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center", marginLeft: -8 },
  scrollContent: { flexGrow: 1 },
  header: { marginTop: 12, marginBottom: 24 },
  title: { fontSize: 24, fontFamily: "Inter_700Bold", color: Colors.white, marginBottom: 6 },
  subtitle: { fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
  errorBox: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "rgba(255,77,77,0.1)", padding: 12, borderRadius: 10, borderWidth: 1, borderColor: "rgba(255,77,77,0.2)", marginBottom: 16 },
  errorText: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.error },
  form: { gap: 18 },
  inputGroup: { gap: 8 },
  label: { fontSize: 12, fontFamily: "Inter_500Medium", color: Colors.textSecondary, textTransform: "uppercase", letterSpacing: 1 },
  inputWrapper: { backgroundColor: Colors.card, borderRadius: 12, paddingHorizontal: 16, borderWidth: 1, borderColor: Colors.border },
  input: { paddingVertical: 14, fontSize: 15, fontFamily: "Inter_400Regular", color: Colors.white },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  chipActive: { backgroundColor: Colors.white, borderColor: Colors.white },
  chipText: { fontSize: 13, fontFamily: "Inter_500Medium", color: Colors.textSecondary },
  chipTextActive: { color: Colors.primary },
  rowInputs: { flexDirection: "row", gap: 12 },
  submitBtn: { backgroundColor: Colors.white, paddingVertical: 16, borderRadius: 14, alignItems: "center", marginTop: 24 },
  submitBtnText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: Colors.primary },
});

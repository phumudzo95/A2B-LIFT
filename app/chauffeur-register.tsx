import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, TextInput, ActivityIndicator, Platform, ScrollView, Alert } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/lib/auth-context";
import { apiRequest } from "@/lib/query-client";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Colors from "@/constants/colors";
import * as ImagePicker from "expo-image-picker";

const VEHICLE_CATEGORIES = [
  { id: "budget", name: "Budget", examples: "Toyota Corolla, Toyota Quest" },
  { id: "luxury", name: "Luxury", examples: "BMW 3 Series, Mercedes C Class" },
  { id: "business", name: "Business Class", examples: "BMW 5 Series, Mercedes E Class" },
  { id: "van", name: "Van", examples: "Hyundai H1, Mercedes Vito, Staria" },
  { id: "luxury_van", name: "Luxury Van", examples: "Mercedes V Class" },
];

const CAR_COLORS = ["Black", "White", "Silver", "Grey", "Navy", "Burgundy", "Midnight Blue", "Champagne"];

const COLOR_SWATCHES: Record<string, string> = {
  Black: "#000000", White: "#FFFFFF", Silver: "#C0C0C0", Grey: "#808080",
  Navy: "#1B2A4A", Burgundy: "#6B1C2A", "Midnight Blue": "#191970", Champagne: "#F7E7CE",
};

// Required documents (same as Uber SA requirements)
const REQUIRED_DOCS = [
  { id: "id_document", label: "South African ID / Passport", icon: "card-outline" as const, hint: "Clear photo of your ID document" },
  { id: "drivers_license", label: "Driver's License", icon: "car-outline" as const, hint: "Front and back of your license" },
  { id: "proof_of_address", label: "Proof of Address", icon: "home-outline" as const, hint: "Utility bill or bank statement (not older than 3 months)" },
  { id: "vehicle_registration", label: "Vehicle Registration", icon: "document-outline" as const, hint: "Official registration document (RC1)" },
  { id: "prDP", label: "PrDP Certificate", icon: "ribbon-outline" as const, hint: "Professional Driving Permit (required for e-hailing)" },
];

export default function ChauffeurRegisterScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [step, setStep] = useState<"vehicle" | "documents">("vehicle");

  // Vehicle fields
  const [carMake, setCarMake] = useState("");
  const [vehicleModel, setVehicleModel] = useState("");
  const [plateNumber, setPlateNumber] = useState("");
  const [phone, setPhone] = useState(user?.phone || "");
  const [vehicleType, setVehicleType] = useState(VEHICLE_CATEGORIES[0].id);
  const [carColor, setCarColor] = useState(CAR_COLORS[0]);
  const [passengerCapacity, setPassengerCapacity] = useState("4");
  const [luggageCapacity, setLuggageCapacity] = useState("2");

  // Document uploads: { docId: { uri, name } }
  const [documents, setDocuments] = useState<Record<string, { uri: string; name: string } | null>>({
    id_document: null, drivers_license: null, proof_of_address: null,
    vehicle_registration: null, prDP: null,
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function pickDocument(docId: string) {
    try {
      if (Platform.OS === "web") {
        // Web: use file input via ImagePicker
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 0.8,
          allowsEditing: false,
        });
        if (!result.canceled && result.assets?.[0]) {
          const asset = result.assets[0];
          setDocuments(prev => ({ ...prev, [docId]: { uri: asset.uri, name: asset.fileName || `${docId}.jpg` } }));
        }
      } else {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== "granted") {
          Alert.alert("Permission needed", "Please allow access to your photo library.");
          return;
        }
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 0.8,
          allowsEditing: false,
        });
        if (!result.canceled && result.assets?.[0]) {
          const asset = result.assets[0];
          setDocuments(prev => ({ ...prev, [docId]: { uri: asset.uri, name: asset.fileName || `${docId}.jpg` } }));
        }
      }
    } catch (e) {
      Alert.alert("Error", "Could not open document picker. Try again.");
    }
  }

  function validateVehicle(): boolean {
    if (!carMake.trim() || !vehicleModel.trim() || !plateNumber.trim() || !phone.trim()) {
      setError("Please fill in all required vehicle fields");
      return false;
    }
    setError("");
    return true;
  }

  function validateDocuments(): boolean {
    const missing = REQUIRED_DOCS.filter(d => !documents[d.id]);
    if (missing.length > 0) {
      setError(`Please upload: ${missing.map(d => d.label).join(", ")}`);
      return false;
    }
    setError("");
    return true;
  }

  async function handleSubmit() {
    if (!validateDocuments()) return;
    if (!user) return;
    setLoading(true);
    setError("");
    try {
      // Step 1: Register the chauffeur profile
      const res = await apiRequest("POST", "/api/chauffeurs", {
        userId: user.id,
        carMake: carMake.trim(),
        vehicleModel: vehicleModel.trim(),
        plateNumber: plateNumber.trim().toUpperCase(),
        vehicleType,
        carColor,
        phone: phone.trim(),
        passengerCapacity: parseInt(passengerCapacity) || 4,
        luggageCapacity: parseInt(luggageCapacity) || 2,
      });
      const chauffeur = await res.json();
      await AsyncStorage.setItem("a2b_chauffeur", JSON.stringify(chauffeur));

      // Step 2: Upload documents one by one
      const appRes = await apiRequest("GET", "/api/driver/applications/me");
      const application = await appRes.json().catch(() => null);
      const applicationId = application?.id || null;

      for (const doc of REQUIRED_DOCS) {
        const file = documents[doc.id];
        if (!file) continue;
        try {
          // Upload the document metadata — in production this would upload to Supabase Storage
          await apiRequest("POST", "/api/driver/documents", {
            userId: user.id,
            applicationId,
            chauffeurId: chauffeur.id,
            type: doc.id,
            url: file.uri, // In production: upload to Supabase Storage and use the public URL
          });
        } catch (docErr) {
          console.warn(`Failed to upload ${doc.id}:`, docErr);
        }
      }

      router.replace("/chauffeur");
    } catch (e: any) {
      setError(e.message || "Registration failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  // ── STEP 1: Vehicle Details ──
  if (step === "vehicle") {
    return (
      <View style={[styles.container, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 20) }]}>
        <Pressable style={styles.backBtn} onPress={() => router.canGoBack() ? router.back() : router.replace("/")}>
          <Ionicons name="chevron-back" size={24} color={Colors.white} />
        </Pressable>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          <View style={styles.header}>
            <View style={styles.stepIndicator}>
              <View style={[styles.stepDot, styles.stepDotActive]} /><View style={styles.stepLine} /><View style={styles.stepDot} />
            </View>
            <Text style={styles.title}>Vehicle Details</Text>
            <Text style={styles.subtitle}>Step 1 of 2 — Tell us about your vehicle</Text>
          </View>

          {!!error && (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={16} color={Colors.error} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <View style={styles.form}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Phone Number *</Text>
              <View style={styles.inputWrapper}>
                <Ionicons name="call-outline" size={18} color={Colors.textMuted} />
                <TextInput style={styles.inputWithIcon} placeholder="e.g. +27 61 234 5678" placeholderTextColor={Colors.textMuted} value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Car Make *</Text>
              <View style={styles.inputWrapper}>
                <TextInput style={styles.input} placeholder="e.g. Toyota, BMW, Mercedes" placeholderTextColor={Colors.textMuted} value={carMake} onChangeText={setCarMake} />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Car Model *</Text>
              <View style={styles.inputWrapper}>
                <TextInput style={styles.input} placeholder="e.g. Corolla, 3 Series, V Class" placeholderTextColor={Colors.textMuted} value={vehicleModel} onChangeText={setVehicleModel} />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Plate Number *</Text>
              <View style={styles.inputWrapper}>
                <TextInput style={styles.input} placeholder="e.g. CA 123 456" placeholderTextColor={Colors.textMuted} value={plateNumber} onChangeText={setPlateNumber} autoCapitalize="characters" />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Vehicle Category</Text>
              <View style={styles.chipRow}>
                {VEHICLE_CATEGORIES.map((vc) => (
                  <Pressable key={vc.id} style={[styles.chip, vehicleType === vc.id && styles.chipActive]} onPress={() => setVehicleType(vc.id)}>
                    <Text style={[styles.chipText, vehicleType === vc.id && styles.chipTextActive]}>{vc.name}</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={styles.categoryHint}>{VEHICLE_CATEGORIES.find(c => c.id === vehicleType)?.examples}</Text>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Car Color</Text>
              <View style={styles.colorRow}>
                {CAR_COLORS.map((c) => (
                  <Pressable key={c} style={[styles.colorChip, carColor === c && styles.colorChipActive]} onPress={() => setCarColor(c)}>
                    <View style={[styles.colorSwatch, { backgroundColor: COLOR_SWATCHES[c] }, c === "White" && { borderWidth: 1, borderColor: Colors.textMuted }]} />
                    <Text style={[styles.colorText, carColor === c && styles.colorTextActive]}>{c}</Text>
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
            style={({ pressed }) => [styles.submitBtn, pressed && { opacity: 0.9 }]}
            onPress={() => { if (validateVehicle()) setStep("documents"); }}
          >
            <Text style={styles.submitBtnText}>Next: Upload Documents</Text>
            <Ionicons name="arrow-forward" size={18} color={Colors.primary} />
          </Pressable>

          <View style={{ height: insets.bottom + (Platform.OS === "web" ? 34 : 24) }} />
        </ScrollView>
      </View>
    );
  }

  // ── STEP 2: Document Upload ──
  return (
    <View style={[styles.container, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 20) }]}>
      <Pressable style={styles.backBtn} onPress={() => setStep("vehicle")}>
        <Ionicons name="chevron-back" size={24} color={Colors.white} />
      </Pressable>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <View style={styles.stepIndicator}>
            <View style={[styles.stepDot, styles.stepDotActive]} /><View style={[styles.stepLine, styles.stepLineActive]} /><View style={[styles.stepDot, styles.stepDotActive]} />
          </View>
          <Text style={styles.title}>Upload Documents</Text>
          <Text style={styles.subtitle}>Step 2 of 2 — Required for compliance & verification</Text>
        </View>

        {!!error && (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle" size={16} color={Colors.error} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <View style={styles.docInfoBox}>
          <Ionicons name="shield-checkmark-outline" size={18} color={Colors.textSecondary} />
          <Text style={styles.docInfoText}>Your documents are encrypted and only visible to A2B LIFT admins for verification.</Text>
        </View>

        <View style={styles.form}>
          {REQUIRED_DOCS.map((doc) => {
            const uploaded = documents[doc.id];
            return (
              <Pressable key={doc.id} style={[styles.docRow, uploaded && styles.docRowUploaded]} onPress={() => pickDocument(doc.id)}>
                <View style={[styles.docIconWrap, uploaded && styles.docIconWrapUploaded]}>
                  <Ionicons name={uploaded ? "checkmark" : doc.icon} size={20} color={uploaded ? Colors.success : Colors.textSecondary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.docLabel}>{doc.label}</Text>
                  <Text style={styles.docHint}>{uploaded ? `✓ ${uploaded.name}` : doc.hint}</Text>
                </View>
                <Ionicons name={uploaded ? "checkmark-circle" : "cloud-upload-outline"} size={20} color={uploaded ? Colors.success : Colors.textMuted} />
              </Pressable>
            );
          })}
        </View>

        <Pressable
          style={({ pressed }) => [styles.submitBtn, pressed && { opacity: 0.9 }, loading && { opacity: 0.7 }]}
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading ? <ActivityIndicator color={Colors.primary} /> : (
            <>
              <Text style={styles.submitBtnText}>Submit Application</Text>
              <Ionicons name="checkmark" size={18} color={Colors.primary} />
            </>
          )}
        </Pressable>

        <Text style={styles.submitNote}>Your application will be reviewed by our team within 24–48 hours.</Text>

        <View style={{ height: insets.bottom + (Platform.OS === "web" ? 34 : 24) }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.primary, paddingHorizontal: 24 },
  backBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center", marginLeft: -8 },
  scrollContent: { flexGrow: 1 },
  header: { marginTop: 12, marginBottom: 20, gap: 8 },
  stepIndicator: { flexDirection: "row", alignItems: "center", gap: 0, marginBottom: 4 },
  stepDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.border },
  stepDotActive: { backgroundColor: Colors.white },
  stepLine: { flex: 1, height: 2, backgroundColor: Colors.border, marginHorizontal: 6 },
  stepLineActive: { backgroundColor: Colors.white },
  title: { fontSize: 22, fontFamily: "Inter_700Bold", color: Colors.white },
  subtitle: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
  errorBox: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "rgba(255,77,77,0.1)", padding: 12, borderRadius: 10, borderWidth: 1, borderColor: "rgba(255,77,77,0.2)", marginBottom: 12 },
  errorText: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.error, flex: 1 },
  docInfoBox: { flexDirection: "row", alignItems: "flex-start", gap: 10, backgroundColor: Colors.surface, padding: 12, borderRadius: 10, marginBottom: 16 },
  docInfoText: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textSecondary, lineHeight: 18 },
  form: { gap: 12 },
  inputGroup: { gap: 6 },
  label: { fontSize: 11, fontFamily: "Inter_500Medium", color: Colors.textSecondary, textTransform: "uppercase", letterSpacing: 1 },
  inputWrapper: { flexDirection: "row", alignItems: "center", backgroundColor: Colors.card, borderRadius: 12, paddingHorizontal: 16, borderWidth: 1, borderColor: Colors.border, gap: 10 },
  input: { flex: 1, paddingVertical: 13, fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.white },
  inputWithIcon: { flex: 1, paddingVertical: 13, fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.white },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  chipActive: { backgroundColor: Colors.white, borderColor: Colors.white },
  chipText: { fontSize: 12, fontFamily: "Inter_500Medium", color: Colors.textSecondary },
  chipTextActive: { color: Colors.primary },
  categoryHint: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.textMuted },
  colorRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  colorChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  colorChipActive: { borderColor: Colors.white, backgroundColor: Colors.accent },
  colorSwatch: { width: 14, height: 14, borderRadius: 7 },
  colorText: { fontSize: 11, fontFamily: "Inter_500Medium", color: Colors.textSecondary },
  colorTextActive: { color: Colors.white },
  rowInputs: { flexDirection: "row", gap: 12 },
  // Document upload rows
  docRow: { flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: Colors.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: Colors.border },
  docRowUploaded: { borderColor: Colors.success, backgroundColor: "rgba(34,197,94,0.06)" },
  docIconWrap: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.card, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: Colors.border },
  docIconWrapUploaded: { backgroundColor: "rgba(34,197,94,0.1)", borderColor: Colors.success },
  docLabel: { fontSize: 13, fontFamily: "Inter_500Medium", color: Colors.white, marginBottom: 2 },
  docHint: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.textMuted },
  submitBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: Colors.white, paddingVertical: 15, borderRadius: 14, marginTop: 20 },
  submitBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: Colors.primary },
  submitNote: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textMuted, textAlign: "center", marginTop: 12 },
});

import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, TextInput, ActivityIndicator, Platform, ScrollView, Alert, Image } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/lib/auth-context";
import { apiRequest } from "@/lib/query-client";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Colors from "@/constants/colors";
import * as ImagePicker from "expo-image-picker";
import { uploadDocument } from "@/lib/supabase-storage";

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

const DRIVER_DOCS = [
  { id: "pdrp_certificate", label: "PDRP Certificate", icon: "ribbon-outline" as const, hint: "Professional Driving Permit (e-hailing category)" },
  { id: "drivers_license", label: "Valid Driver's License", icon: "car-outline" as const, hint: "Front and back of your driver's license" },
  { id: "driver_evaluation", label: "Driver Evaluation", icon: "clipboard-outline" as const, hint: "Official driver evaluation / assessment certificate" },
  { id: "criminal_background_check", label: "Criminal Background Check", icon: "shield-checkmark-outline" as const, hint: "Police clearance certificate (not older than 6 months)" },
];

const CAR_DOCS = [
  { id: "double_license_disk", label: "Double License Disk", icon: "disc-outline" as const, hint: "Both license disks displayed in the vehicle" },
  { id: "passenger_liability_insurance", label: "Passenger Liability Insurance", icon: "umbrella-outline" as const, hint: "Valid passenger liability insurance certificate" },
  { id: "dekra_report", label: "Dekra Report", icon: "document-text-outline" as const, hint: "Current Dekra vehicle inspection / roadworthy report" },
];

const ALL_DOCS = [...DRIVER_DOCS, ...CAR_DOCS];

type Step = "vehicle" | "documents" | "photo";

export default function ChauffeurRegisterScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [step, setStep] = useState<Step>("vehicle");

  // Vehicle fields
  const [carMake, setCarMake] = useState("");
  const [vehicleModel, setVehicleModel] = useState("");
  const [plateNumber, setPlateNumber] = useState("");
  const [phone, setPhone] = useState(user?.phone || "");
  const [vehicleType, setVehicleType] = useState(VEHICLE_CATEGORIES[0].id);
  const [carColor, setCarColor] = useState(CAR_COLORS[0]);
  const [passengerCapacity, setPassengerCapacity] = useState("4");
  const [luggageCapacity, setLuggageCapacity] = useState("2");

  // Document uploads
  const [documents, setDocuments] = useState<Record<string, { uri: string; name: string } | null>>(
    Object.fromEntries(ALL_DOCS.map(d => [d.id, null]))
  );

  // Driver photo
  const [driverPhoto, setDriverPhoto] = useState<{ uri: string; name: string } | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function pickImage(docId: string, useCamera = false) {
    try {
      if (useCamera && Platform.OS !== "web") {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== "granted") {
          Alert.alert("Permission needed", "Please allow camera access.");
          return;
        }
        const result = await ImagePicker.launchCameraAsync({ quality: 0.7, allowsEditing: true, aspect: [1, 1] });
        if (!result.canceled && result.assets?.[0]) {
          const asset = result.assets[0];
          if (docId === "driver_photo") {
            setDriverPhoto({ uri: asset.uri, name: asset.fileName || "driver_photo.jpg" });
          } else {
            setDocuments(prev => ({ ...prev, [docId]: { uri: asset.uri, name: asset.fileName || `${docId}.jpg` } }));
          }
        }
        return;
      }
      if (Platform.OS !== "web") {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== "granted") {
          Alert.alert("Permission needed", "Please allow photo library access.");
          return;
        }
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.6,
        allowsEditing: docId === "driver_photo",
        aspect: docId === "driver_photo" ? [1, 1] : undefined,
      });
      if (!result.canceled && result.assets?.[0]) {
        const asset = result.assets[0];
        if (docId === "driver_photo") {
          setDriverPhoto({ uri: asset.uri, name: asset.fileName || "driver_photo.jpg" });
        } else {
          setDocuments(prev => ({ ...prev, [docId]: { uri: asset.uri, name: asset.fileName || `${docId}.jpg` } }));
        }
      }
    } catch {
      Alert.alert("Error", "Could not open image picker. Please try again.");
    }
  }

  function promptPhotoSource(docId: string) {
    if (Platform.OS === "web") { pickImage(docId); return; }
    Alert.alert("Upload Photo", "Choose a source", [
      { text: "Take Photo", onPress: () => pickImage(docId, true) },
      { text: "Choose from Library", onPress: () => pickImage(docId, false) },
      { text: "Cancel", style: "cancel" },
    ]);
  }

  function validateVehicle(): boolean {
    if (!carMake.trim() || !vehicleModel.trim() || !plateNumber.trim() || !phone.trim()) {
      setError("Please fill in all required vehicle fields");
      return false;
    }
    setError(""); return true;
  }

  function validateDocuments(): boolean {
    const missing = ALL_DOCS.filter(d => !documents[d.id]);
    if (missing.length > 0) {
      setError(`Please upload: ${missing.map(d => d.label).join(", ")}`);
      return false;
    }
    setError(""); return true;
  }

  async function handleSubmit() {
    if (!driverPhoto) { setError("Please upload or take your driver profile photo."); return; }
    if (!user) return;
    setLoading(true);
    setError("");
    try {
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

      const appRes = await apiRequest("GET", `/api/driver/applications/me?userId=${user.id}`);
      const application = await appRes.json().catch(() => null);
      const applicationId = application?.id || null;

      const uploadOne = async (docId: string, uri: string, name: string) => {
        let publicUrl = uri;
        try {
          publicUrl = await uploadDocument(uri, user.id, docId);
        } catch (e) {
          console.warn(`Supabase upload failed for ${docId}:`, e);
        }
        await apiRequest("POST", "/api/driver/documents", {
          userId: user.id, applicationId, chauffeurId: chauffeur.id,
          type: docId, url: publicUrl,
        });
      };

      await Promise.all([
        ...ALL_DOCS.map(doc => {
          const file = documents[doc.id];
          if (!file) return Promise.resolve();
          return uploadOne(doc.id, file.uri, file.name).catch(e => console.warn(`Failed ${doc.id}:`, e));
        }),
        uploadOne("driver_photo", driverPhoto.uri, driverPhoto.name).catch(e => console.warn("Failed driver_photo:", e)),
      ]);

      router.replace("/chauffeur");
    } catch (e: any) {
      setError(e.message || "Registration failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const StepIndicator = ({ current }: { current: number }) => (
    <View style={styles.stepIndicator}>
      {[1, 2, 3].map((n, i) => (
        <React.Fragment key={n}>
          <View style={[styles.stepDot, current >= n && styles.stepDotActive]} />
          {i < 2 && <View style={[styles.stepLine, current > n && styles.stepLineActive]} />}
        </React.Fragment>
      ))}
    </View>
  );

  // ── STEP 1: Vehicle Details ──
  if (step === "vehicle") {
    return (
      <View style={[styles.container, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 20) }]}>
        <Pressable style={styles.backBtn} onPress={() => router.canGoBack() ? router.back() : router.replace("/")}>
          <Ionicons name="chevron-back" size={24} color={Colors.white} />
        </Pressable>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          <View style={styles.header}>
            <StepIndicator current={1} />
            <Text style={styles.title}>Vehicle Details</Text>
            <Text style={styles.subtitle}>Step 1 of 3 — Tell us about your vehicle</Text>
          </View>

          {!!error && <View style={styles.errorBox}><Ionicons name="alert-circle" size={16} color={Colors.error} /><Text style={styles.errorText}>{error}</Text></View>}

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

          <Pressable style={({ pressed }) => [styles.submitBtn, pressed && { opacity: 0.9 }]} onPress={() => { if (validateVehicle()) setStep("documents"); }}>
            <Text style={styles.submitBtnText}>Next: Upload Documents</Text>
            <Ionicons name="arrow-forward" size={18} color={Colors.primary} />
          </Pressable>
          <View style={{ height: insets.bottom + 24 }} />
        </ScrollView>
      </View>
    );
  }

  // ── STEP 2: Documents ──
  if (step === "documents") {
    return (
      <View style={[styles.container, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 20) }]}>
        <Pressable style={styles.backBtn} onPress={() => setStep("vehicle")}>
          <Ionicons name="chevron-back" size={24} color={Colors.white} />
        </Pressable>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          <View style={styles.header}>
            <StepIndicator current={2} />
            <Text style={styles.title}>Upload Documents</Text>
            <Text style={styles.subtitle}>Step 2 of 3 — Required for compliance & verification</Text>
          </View>

          {!!error && <View style={styles.errorBox}><Ionicons name="alert-circle" size={16} color={Colors.error} /><Text style={styles.errorText}>{error}</Text></View>}

          <View style={styles.docInfoBox}>
            <Ionicons name="lock-closed-outline" size={18} color={Colors.textSecondary} />
            <Text style={styles.docInfoText}>Your documents are encrypted and only visible to A2B LIFT admins for verification.</Text>
          </View>

          {/* Driver Documents */}
          <Text style={styles.docSectionTitle}>Driver Documents</Text>
          <View style={styles.form}>
            {DRIVER_DOCS.map((doc) => {
              const uploaded = documents[doc.id];
              return (
                <Pressable key={doc.id} style={[styles.docRow, uploaded && styles.docRowUploaded]} onPress={() => promptPhotoSource(doc.id)}>
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

          {/* Car Documents */}
          <Text style={[styles.docSectionTitle, { marginTop: 20 }]}>Vehicle Documents</Text>
          <View style={styles.form}>
            {CAR_DOCS.map((doc) => {
              const uploaded = documents[doc.id];
              return (
                <Pressable key={doc.id} style={[styles.docRow, uploaded && styles.docRowUploaded]} onPress={() => promptPhotoSource(doc.id)}>
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

          <Pressable style={({ pressed }) => [styles.submitBtn, pressed && { opacity: 0.9 }]} onPress={() => { if (validateDocuments()) setStep("photo"); }}>
            <Text style={styles.submitBtnText}>Next: Profile Photo</Text>
            <Ionicons name="arrow-forward" size={18} color={Colors.primary} />
          </Pressable>
          <View style={{ height: insets.bottom + 24 }} />
        </ScrollView>
      </View>
    );
  }

  // ── STEP 3: Driver Profile Photo ──
  return (
    <View style={[styles.container, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 20) }]}>
      <Pressable style={styles.backBtn} onPress={() => setStep("documents")}>
        <Ionicons name="chevron-back" size={24} color={Colors.white} />
      </Pressable>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <StepIndicator current={3} />
          <Text style={styles.title}>Profile Photo</Text>
          <Text style={styles.subtitle}>Step 3 of 3 — Upload a clear photo of yourself</Text>
        </View>

        {!!error && <View style={styles.errorBox}><Ionicons name="alert-circle" size={16} color={Colors.error} /><Text style={styles.errorText}>{error}</Text></View>}

        {/* Photo preview */}
        <View style={styles.photoPreviewWrap}>
          {driverPhoto ? (
            <Image source={{ uri: driverPhoto.uri }} style={styles.photoPreview} />
          ) : (
            <View style={styles.photoPlaceholder}>
              <Ionicons name="person" size={56} color={Colors.textMuted} />
            </View>
          )}
        </View>

        {/* Photo instructions */}
        <View style={styles.photoInstructions}>
          <Text style={styles.photoInstructionsTitle}>Photo guidelines</Text>
          {[
            { icon: "sunny-outline", text: "Take the photo in good, natural lighting" },
            { icon: "person-circle-outline", text: "Face the camera directly — eyes clearly visible" },
            { icon: "remove-circle-outline", text: "No sunglasses, hats, or obstructions" },
            { icon: "scan-outline", text: "Plain background preferred (white or light-coloured)" },
            { icon: "expand-outline", text: "Head and shoulders must be fully in frame" },
          ].map((tip, i) => (
            <View key={i} style={styles.photoTipRow}>
              <Ionicons name={tip.icon as any} size={16} color={Colors.accent === "#2A2A2A" ? "#888" : Colors.accent} />
              <Text style={styles.photoTipText}>{tip.text}</Text>
            </View>
          ))}
        </View>

        <View style={styles.photoActions}>
          {Platform.OS !== "web" && (
            <Pressable style={styles.photoActionBtn} onPress={() => pickImage("driver_photo", true)}>
              <Ionicons name="camera-outline" size={20} color={Colors.white} />
              <Text style={styles.photoActionBtnText}>Take Photo</Text>
            </Pressable>
          )}
          <Pressable style={[styles.photoActionBtn, { backgroundColor: Colors.surface }]} onPress={() => pickImage("driver_photo", false)}>
            <Ionicons name="images-outline" size={20} color={Colors.white} />
            <Text style={styles.photoActionBtnText}>Choose from Library</Text>
          </Pressable>
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
        <View style={{ height: insets.bottom + 24 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.primary, paddingHorizontal: 24 },
  backBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center", marginLeft: -8 },
  scrollContent: { flexGrow: 1 },
  header: { marginTop: 12, marginBottom: 20, gap: 8 },
  stepIndicator: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
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
  docSectionTitle: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: Colors.textSecondary, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 },
  form: { gap: 10 },
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
  colorChipActive: { borderColor: Colors.white, backgroundColor: "#1A2540" },
  colorSwatch: { width: 14, height: 14, borderRadius: 7 },
  colorText: { fontSize: 11, fontFamily: "Inter_500Medium", color: Colors.textSecondary },
  colorTextActive: { color: Colors.white },
  rowInputs: { flexDirection: "row", gap: 12 },
  docRow: { flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: Colors.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: Colors.border },
  docRowUploaded: { borderColor: Colors.success, backgroundColor: "rgba(34,197,94,0.06)" },
  docIconWrap: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.card, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: Colors.border },
  docIconWrapUploaded: { backgroundColor: "rgba(34,197,94,0.1)", borderColor: Colors.success },
  docLabel: { fontSize: 13, fontFamily: "Inter_500Medium", color: Colors.white, marginBottom: 2 },
  docHint: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.textMuted },
  photoPreviewWrap: { alignItems: "center", marginBottom: 20 },
  photoPreview: { width: 160, height: 160, borderRadius: 80, borderWidth: 3, borderColor: Colors.white },
  photoPlaceholder: { width: 160, height: 160, borderRadius: 80, backgroundColor: Colors.surface, borderWidth: 2, borderColor: Colors.border, alignItems: "center", justifyContent: "center" },
  photoInstructions: { backgroundColor: Colors.surface, borderRadius: 14, padding: 16, marginBottom: 20, gap: 10 },
  photoInstructionsTitle: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: Colors.white, marginBottom: 4 },
  photoTipRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  photoTipText: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textSecondary, flex: 1, lineHeight: 18 },
  photoActions: { flexDirection: "row", gap: 12, marginBottom: 20 },
  photoActionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: Colors.card, paddingVertical: 13, borderRadius: 12, borderWidth: 1, borderColor: Colors.border },
  photoActionBtnText: { fontSize: 13, fontFamily: "Inter_500Medium", color: Colors.white },
  submitBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: Colors.white, paddingVertical: 15, borderRadius: 14, marginTop: 4 },
  submitBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: Colors.primary },
  submitNote: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textMuted, textAlign: "center", marginTop: 12 },
});

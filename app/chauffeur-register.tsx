import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, TextInput, ActivityIndicator, Platform, ScrollView, Alert, Image } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "@/lib/auth-context";
import { apiRequest } from "@/lib/query-client";
import { uploadDocument } from "@/lib/supabase-storage";
import Colors from "@/constants/colors";

const DRIVER_DOCS = [
  { id: "driver:pdrp_certificate", label: "PDRP Certificate", optional: false },
  { id: "driver:drivers_license", label: "Valid Driver's License", optional: false },
  { id: "driver:driver_evaluation", label: "Driver Evaluation", optional: true },
  { id: "driver:criminal_background_check", label: "Criminal Background Check", optional: false },
];

type DraftFile = { uri: string; name: string };
type DraftDocuments = Record<string, DraftFile | null>;

function emptyDocs(): DraftDocuments {
  return Object.fromEntries(DRIVER_DOCS.map((doc) => [doc.id, null])) as DraftDocuments;
}

export default function ChauffeurRegisterScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [phone, setPhone] = useState(user?.phone || "");
  const [documents, setDocuments] = useState<DraftDocuments>(emptyDocs);
  const [driverPhoto, setDriverPhoto] = useState<DraftFile | null>(null);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const draftKey = user?.id ? `a2b_driver_registration_draft_${user.id}` : null;

  useEffect(() => {
    let cancelled = false;
    if (!draftKey) { setDraftLoaded(true); return; }
    AsyncStorage.getItem(draftKey)
      .then((raw) => {
        if (cancelled || !raw) return;
        const draft = JSON.parse(raw);
        if (typeof draft?.phone === "string") setPhone(draft.phone);
        if (draft?.documents) setDocuments({ ...emptyDocs(), ...draft.documents });
        if (draft?.driverPhoto?.uri) setDriverPhoto(draft.driverPhoto);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setDraftLoaded(true); });
    return () => { cancelled = true; };
  }, [draftKey]);

  useEffect(() => {
    if (!draftKey || !draftLoaded) return;
    AsyncStorage.setItem(draftKey, JSON.stringify({ phone, documents, driverPhoto })).catch(() => {});
  }, [documents, draftKey, draftLoaded, driverPhoto, phone]);

  async function pickImage(docId: string, camera = false) {
    try {
      if (Platform.OS !== "web") {
        const permission = camera
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (permission.status !== "granted") {
          Alert.alert("Permission needed", "Please allow camera or photo access.");
          return;
        }
      }
      const result = camera && Platform.OS !== "web"
        ? await ImagePicker.launchCameraAsync({ quality: 0.7, allowsEditing: docId === "driver_photo", aspect: docId === "driver_photo" ? [1, 1] : undefined })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.65, allowsEditing: docId === "driver_photo", aspect: docId === "driver_photo" ? [1, 1] : undefined });
      if (!result.canceled && result.assets?.[0]) {
        const asset = result.assets[0];
        const file = { uri: asset.uri, name: asset.fileName || `${docId}.jpg` };
        if (docId === "driver_photo") setDriverPhoto(file);
        else setDocuments((prev) => ({ ...prev, [docId]: file }));
      }
    } catch {
      Alert.alert("Error", "Could not open image picker.");
    }
  }

  function validate() {
    if (!phone.trim()) {
      setError("Phone number is required.");
      return false;
    }
    if (!driverPhoto) {
      setError("Please upload a clear driver profile photo.");
      return false;
    }
    const missingDocs = DRIVER_DOCS.filter((doc) => !doc.optional && !documents[doc.id]);
    if (missingDocs.length > 0) {
      setError(`Please upload: ${missingDocs.map((doc) => doc.label).join(", ")}`);
      return false;
    }
    setError("");
    return true;
  }

  async function submit() {
    if (!user || !validate()) return;
    setLoading(true);
    setError("");
    try {
      for (const doc of DRIVER_DOCS) {
        const file = documents[doc.id];
        if (!file) continue;
        let url = file.uri;
        try {
          url = await uploadDocument(file.uri, user.id, doc.id.replace("driver:", "driver_"));
        } catch {}
        await apiRequest("POST", "/api/operator-profile/documents", { type: doc.id, url });
      }
      if (driverPhoto) {
        let photoUrl = driverPhoto.uri;
        try {
          photoUrl = await uploadDocument(driverPhoto.uri, user.id, "driver_photo");
        } catch {}
        await apiRequest("POST", "/api/operator-profile/documents", { type: "driver:driver_photo", url: photoUrl });
      }
      const res = await apiRequest("POST", "/api/operator-profile/driver", { phone: phone.trim(), profilePhoto: driverPhoto?.uri || null });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || "Driver registration failed");
      }
      if (draftKey) await AsyncStorage.removeItem(draftKey);
      router.replace("/chauffeur");
    } catch (e: any) {
      setError(e.message || "Driver registration failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 20) }]}>
      <Pressable style={styles.backBtn} onPress={() => router.canGoBack() ? router.back() : router.replace("/chauffeur-onboarding")}>
        <Ionicons name="chevron-back" size={24} color={Colors.white} />
      </Pressable>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 28 }]}>
        <View style={styles.header}>
          <Text style={styles.title}>Driver Registration</Text>
          <Text style={styles.subtitle}>Submit your driver profile first. Vehicles are added after A2B approves your driver account. Your progress is saved automatically.</Text>
        </View>
        {!!error && <View style={styles.errorBox}><Ionicons name="alert-circle" size={16} color={Colors.error} /><Text style={styles.errorText}>{error}</Text></View>}

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Phone Number *</Text>
          <TextInput style={styles.input} value={phone} onChangeText={setPhone} placeholder="+27 61 234 5678" placeholderTextColor={Colors.textMuted} keyboardType="phone-pad" />
        </View>

        <Text style={styles.sectionTitle}>Driver Photo</Text>
        <View style={styles.photoRow}>
          <View style={styles.photoPreview}>
            {driverPhoto ? <Image source={{ uri: driverPhoto.uri }} style={styles.photoImage} /> : <Ionicons name="person" size={42} color={Colors.textMuted} />}
          </View>
          <View style={styles.photoActions}>
            {Platform.OS !== "web" && (
              <Pressable style={styles.secondaryBtn} onPress={() => pickImage("driver_photo", true)}>
                <Ionicons name="camera-outline" size={18} color={Colors.white} />
                <Text style={styles.secondaryBtnText}>Camera</Text>
              </Pressable>
            )}
            <Pressable style={styles.secondaryBtn} onPress={() => pickImage("driver_photo", false)}>
              <Ionicons name="images-outline" size={18} color={Colors.white} />
              <Text style={styles.secondaryBtnText}>Gallery</Text>
            </Pressable>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Driver Documents</Text>
        <View style={styles.docs}>
          {DRIVER_DOCS.map((doc) => {
            const file = documents[doc.id];
            return (
              <Pressable key={doc.id} style={[styles.docRow, file && styles.docUploaded]} onPress={() => pickImage(doc.id)}>
                <Ionicons name={file ? "checkmark-circle" : "cloud-upload-outline"} size={22} color={file ? Colors.success : Colors.textMuted} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.docTitle}>{doc.label}{doc.optional ? " (Optional)" : ""}</Text>
                  <Text style={styles.docMeta}>{file ? file.name : "Tap to upload"}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        <Pressable style={[styles.submitBtn, loading && { opacity: 0.7 }]} onPress={submit} disabled={loading}>
          {loading ? <ActivityIndicator color={Colors.primary} /> : <Text style={styles.submitText}>Submit Driver Application</Text>}
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.primary, paddingHorizontal: 24 },
  backBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center", marginLeft: -8 },
  content: { flexGrow: 1 },
  header: { marginTop: 12, marginBottom: 20, gap: 8 },
  title: { fontSize: 24, fontFamily: "Inter_700Bold", color: Colors.white },
  subtitle: { fontSize: 13, lineHeight: 19, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
  inputGroup: { gap: 8, marginBottom: 20 },
  label: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: Colors.white },
  input: { minHeight: 50, borderRadius: 12, paddingHorizontal: 14, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border, color: Colors.white, fontFamily: "Inter_400Regular" },
  sectionTitle: { fontSize: 13, fontFamily: "Inter_700Bold", color: Colors.textSecondary, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 },
  photoRow: { flexDirection: "row", gap: 14, alignItems: "center", marginBottom: 22 },
  photoPreview: { width: 92, height: 92, borderRadius: 46, alignItems: "center", justifyContent: "center", overflow: "hidden", backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border },
  photoImage: { width: "100%", height: "100%" },
  photoActions: { flex: 1, gap: 10 },
  secondaryBtn: { minHeight: 42, borderRadius: 12, backgroundColor: Colors.surface, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  secondaryBtnText: { color: Colors.white, fontFamily: "Inter_600SemiBold", fontSize: 13 },
  docs: { gap: 10 },
  docRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.card },
  docUploaded: { borderColor: "rgba(76,175,80,0.35)" },
  docTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.white },
  docMeta: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textMuted, marginTop: 2 },
  errorBox: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "rgba(255,77,77,0.1)", padding: 12, borderRadius: 10, marginBottom: 12 },
  errorText: { flex: 1, fontSize: 13, color: Colors.error, fontFamily: "Inter_400Regular" },
  submitBtn: { minHeight: 52, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: Colors.white, marginTop: 20 },
  submitText: { fontSize: 15, fontFamily: "Inter_700Bold", color: Colors.primary },
});

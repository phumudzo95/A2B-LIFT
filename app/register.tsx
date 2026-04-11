import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, Pressable, TextInput, ActivityIndicator, Platform, ScrollView, Image, Modal } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/lib/auth-context";
import { apiRequest } from "@/lib/query-client";
import Colors from "@/constants/colors";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import AsyncStorage from "@react-native-async-storage/async-storage";
import LivenessCamera, { type LivenessChallenge, type LivenessCaptureResult } from "@/components/LivenessCamera";
import { uploadDocument } from "@/lib/supabase-storage";

WebBrowser.maybeCompleteAuthSession();

const GOOGLE_OAUTH_START = "https://api-production-0783.up.railway.app/api/auth/google/start";

export default function RegisterScreen() {
  const insets = useSafeAreaInsets();
  const { register, setUser } = useAuth();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState("");
  // Selfie capture step (shown after successful registration)
  const [registeredUserId, setRegisteredUserId] = useState<string | null>(null);
  const [showSelfieStep, setShowSelfieStep] = useState(false);
  const [selfieChallenge] = useState<LivenessChallenge>("look_straight");
  const [selfieUri, setSelfieUri] = useState<string | null>(null);
  const [selfieUploading, setSelfieUploading] = useState(false);
  const [selfieMessage, setSelfieMessage] = useState("");
  // Selfie capture during registration
  const [showSelfieCamera, setShowSelfieCamera] = useState(false);
  const [selfieUri, setSelfieUri] = useState<string | null>(null);
  const [selfieUploading, setSelfieUploading] = useState(false);
  const [registeredUser, setRegisteredUser] = useState<any>(null);

  // Handle the deep link callback from the backend OAuth flow
  useEffect(() => {
    const sub = Linking.addEventListener("url", ({ url }) => {
      if (!url.startsWith("a2blift://auth")) return;
      handleDeepLinkCallback(url);
    });
    return () => sub.remove();
  }, []);

  async function handleDeepLinkCallback(url: string) {
    try {
      const parsed = new URL(url);
      const err = parsed.searchParams.get("error");
      if (err) { setError("Google sign up failed. Please try again."); setGoogleLoading(false); return; }
      const payloadStr = parsed.searchParams.get("payload");
      if (!payloadStr) { setGoogleLoading(false); return; }
      const payload = JSON.parse(decodeURIComponent(payloadStr));
      await AsyncStorage.setItem("a2b_user", JSON.stringify(payload.user));
      if (payload.accessToken) await AsyncStorage.setItem("a2b_token", payload.accessToken);
      // Fetch the latest user profile from the server so the role is always current
      try {
        const meRes = await apiRequest("GET", "/api/auth/me");
        if (meRes.ok) {
          const freshUser = await meRes.json();
          await AsyncStorage.setItem("a2b_user", JSON.stringify(freshUser));
          setUser(freshUser);
          return;
        }
      } catch {}
      setUser(payload.user);
      // AuthGate handles navigation when user state changes
    } catch {
      setError("Google sign up failed. Please try again.");
    } finally {
      setGoogleLoading(false);
    }
  }

  function isValidEmail(val: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val.trim());
  }

  async function handleRegister() {
    if (!name.trim()) { setError("Full name is required"); return; }
    if (!email.trim()) { setError("Email is required"); return; }
    if (!isValidEmail(email)) { setError("Please enter a valid email address"); return; }
    if (!password.trim()) { setError("Password is required"); return; }
    if (password.length < 4) { setError("Password must be at least 4 characters"); return; }
    setLoading(true); setError("");
    try {
      const user = await register({ username: email.trim().toLowerCase(), password, name: name.trim(), phone: phone.trim() });
      // Show selfie capture step before navigating
      setRegisteredUser(user);
      setShowSelfieCamera(true);
    } catch (e: any) {
      const msg = e.message || "Registration failed.";
      if (msg.includes("already exists") || msg.includes("400")) setError("An account with this email already exists");
      else if (msg.includes("500") || msg.includes("Database")) setError("Server error. Please try again.");
      else if (msg.includes("fetch") || msg.includes("network")) setError("Cannot connect to server.");
      else setError(msg);
    } finally { setLoading(false); }
  }

  async function handleSelfieCapture(result: LivenessCaptureResult) {
    const userId = registeredUserId;
    if (!userId || !result.uri) return;
    setSelfieUploading(true);
    setSelfieMessage("Uploading your selfie...");
    try {
      const uploadedUrl = await uploadDocument(result.uri, userId, "profile_selfie");
      setSelfieUri(result.uri);
      await apiRequest("PUT", `/api/users/${userId}/selfie`, { profilePhoto: uploadedUrl });
      setSelfieMessage("Selfie saved! Setting up your account...");
    } catch {
      setSelfieMessage("Could not save selfie. You can add it from your profile later.");
    } finally {
      setSelfieUploading(false);
      setShowSelfieStep(false);
      // AuthGate will navigate to the correct screen
    }
  }

  function skipSelfie() {
    setShowSelfieStep(false);
    // AuthGate will navigate to the correct screen
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 20) }]}>
      <Pressable style={styles.backBtn} onPress={() => router.canGoBack() ? router.back() : router.replace("/")}>
        <Ionicons name="chevron-back" size={24} color={Colors.white} />
      </Pressable>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.title}>Create Account</Text>
          <Text style={styles.subtitle}>Join A2B LIFT for premium rides</Text>
        </View>

        <View style={styles.form}>
          {!!error && (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={16} color={Colors.error} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Full Name <Text style={styles.required}>*</Text></Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="person-outline" size={18} color={Colors.textMuted} />
              <TextInput style={styles.input} placeholder="Enter your full name" placeholderTextColor={Colors.textMuted}
                value={name} onChangeText={setName} autoCorrect={false} />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Email <Text style={styles.required}>*</Text></Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="mail-outline" size={18} color={Colors.textMuted} />
              <TextInput style={styles.input} placeholder="Enter your email address" placeholderTextColor={Colors.textMuted}
                value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false}
                keyboardType="email-address" textContentType="emailAddress" />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Phone Number</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="call-outline" size={18} color={Colors.textMuted} />
              <TextInput style={styles.input} placeholder="Optional" placeholderTextColor={Colors.textMuted}
                value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Password</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="lock-closed-outline" size={18} color={Colors.textMuted} />
              <TextInput style={styles.input} placeholder="Create a password" placeholderTextColor={Colors.textMuted}
                value={password} onChangeText={setPassword} secureTextEntry={!showPassword} />
              <Pressable onPress={() => setShowPassword(!showPassword)} hitSlop={8}>
                <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={18} color={Colors.textMuted} />
              </Pressable>
            </View>
          </View>

          <Pressable style={({ pressed }) => [styles.registerBtn, pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] }, loading && { opacity: 0.7 }]}
            onPress={handleRegister} disabled={loading}>
            {loading ? <ActivityIndicator color={Colors.primary} /> : <Text style={styles.registerBtnText}>Create Account</Text>}
          </Pressable>

          {/* ── Divider ── */}
          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or sign up with</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* ── Google Sign Up ── */}
          <Pressable style={({ pressed }) => [styles.googleBtn, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }, googleLoading && { opacity: 0.7 }]}
            onPress={handleGoogleSignUp} disabled={googleLoading}>
            {googleLoading ? <ActivityIndicator color="#1a1a1a" size="small" /> : (
              <>
                <Image source={require("../assets/images/google_icon.png")} style={{ width: 22, height: 22 }} resizeMode="contain" />
                <Text style={styles.googleBtnText}>Continue with Google</Text>
              </>
            )}
          </Pressable>

          <Text style={styles.termsText}>
            By creating an account you agree to our{" "}
            <Text style={styles.termsLink}>Terms of Service</Text>
            {" "}and{" "}
            <Text style={styles.termsLink}>Privacy Policy</Text>
          </Text>
        </View>

        <View style={[styles.footer, { paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 16) }]}>
          <Text style={styles.footerText}>Already have an account?</Text>
          <Pressable onPress={() => router.replace("/login")}>
            <Text style={styles.footerLink}>Sign In</Text>
          </Pressable>
        </View>
      </ScrollView>
      {/* Selfie capture step — shown after successful registration */}
      <Modal visible={showSelfieStep} animationType="slide" onRequestClose={skipSelfie}>
        <LivenessCamera
          challenge={selfieChallenge}
          onCapture={handleSelfieCapture}
          onCancel={skipSelfie}
        />
        {/* Skip button overlaid at bottom */}
        {!selfieUploading && (
          <Pressable
            style={selfieSkipBtn}
            onPress={skipSelfie}
          >
            <Text style={selfieSkipText}>Skip for now</Text>
          </Pressable>
        )}
        {selfieUploading && (
          <View style={selfieLoadingOverlay}>
            <ActivityIndicator size="large" color="#fff" />
            <Text style={selfieLoadingText}>{selfieMessage}</Text>
          </View>
        )}
      </Modal>
    </View>
  );
}

const selfieSkipBtn = {
  position: "absolute" as const,
  bottom: 120,
  alignSelf: "center" as const,
  paddingHorizontal: 24,
  paddingVertical: 10,
  borderRadius: 20,
  backgroundColor: "rgba(255,255,255,0.08)",
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.15)",
};
const selfieSkipText = { color: "rgba(255,255,255,0.6)", fontSize: 13 };
const selfieLoadingOverlay = {
  position: "absolute" as const,
  inset: 0,
  backgroundColor: "rgba(0,0,0,0.7)",
  alignItems: "center" as const,
  justifyContent: "center" as const,
  gap: 16,
};
const selfieLoadingText = { color: "#fff", fontSize: 15 };

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.primary, paddingHorizontal: 24 },
  scrollContent: { flexGrow: 1 },
  backBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center", marginLeft: -8 },
  header: { marginTop: 20, marginBottom: 28 },
  title: { fontSize: 28, fontFamily: "Inter_700Bold", color: Colors.white, marginBottom: 8 },
  subtitle: { fontSize: 15, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
  form: { gap: 16 },
  errorBox: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "rgba(255,77,77,0.1)", padding: 12, borderRadius: 10, borderWidth: 1, borderColor: "rgba(255,77,77,0.2)" },
  errorText: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.error },
  inputGroup: { gap: 8 },
  label: { fontSize: 12, fontFamily: "Inter_500Medium", color: Colors.textSecondary, textTransform: "uppercase", letterSpacing: 1 },
  required: { color: Colors.error, fontSize: 12 },
  inputWrapper: { flexDirection: "row", alignItems: "center", backgroundColor: Colors.card, borderRadius: 12, paddingHorizontal: 16, gap: 12, borderWidth: 1, borderColor: Colors.border },
  input: { flex: 1, paddingVertical: 15, fontSize: 15, fontFamily: "Inter_400Regular", color: Colors.white },
  registerBtn: { backgroundColor: Colors.white, paddingVertical: 15, borderRadius: 14, alignItems: "center", marginTop: 4 },
  registerBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: Colors.primary },
  dividerRow: { flexDirection: "row", alignItems: "center", gap: 12, marginVertical: 2 },
  dividerLine: { flex: 1, height: 1, backgroundColor: Colors.border },
  dividerText: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textMuted },
  googleBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12, backgroundColor: "#ffffff", paddingVertical: 14, borderRadius: 14, borderWidth: 1, borderColor: "#e0e0e0" },
  googleIconWrap: { width: 22, height: 22, borderRadius: 11, backgroundColor: "#4285F4", alignItems: "center", justifyContent: "center" },
  googleG: { fontSize: 13, fontFamily: "Inter_700Bold", color: "#fff" },
  googleBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#1a1a1a" },
  googleIconWrap: { width: 22, height: 22, borderRadius: 11, backgroundColor: "#fff", borderWidth: 1, borderColor: "#e0e0e0", alignItems: "center", justifyContent: "center" },
  googleG: { fontSize: 13, fontWeight: "700", color: "#4285F4" },
  termsText: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.textMuted, textAlign: "center", lineHeight: 18 },
  termsLink: { color: Colors.textSecondary, fontFamily: "Inter_500Medium" },
  footer: { flex: 1, justifyContent: "flex-end", flexDirection: "row", alignItems: "flex-end", gap: 4, paddingTop: 16 },
  footerText: { fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.textMuted },
  footerLink: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.white },
});

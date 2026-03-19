import React, { useState, useEffect } from "react";
import {
  View, Text, StyleSheet, Pressable, TextInput,
  ActivityIndicator, Platform, Alert, Image,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/lib/auth-context";
import Colors from "@/constants/colors";
import * as WebBrowser from "expo-web-browser";
import * as AuthSession from "expo-auth-session";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { apiRequest } from "@/lib/query-client";

WebBrowser.maybeCompleteAuthSession();

const GOOGLE_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_WEB || "";

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { login, setUser } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Use implicit flow (response_type=token) — returns access_token directly,
  // no redirect URI registration needed in Google Cloud Console.
  const redirectUri = AuthSession.makeRedirectUri({ scheme: "a2blift" });

  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: GOOGLE_CLIENT_ID,
      scopes: ["openid", "email", "profile"],
      redirectUri,
      responseType: AuthSession.ResponseType.Token,
      usePKCE: false,
    },
    {
      authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
    }
  );

  useEffect(() => {
    if (response?.type === "success") {
      const accessToken = response.params?.access_token;
      if (accessToken) handleGoogleToken(accessToken);
      else { setError("Google sign in failed. No token received."); setGoogleLoading(false); }
    } else if (response?.type === "error") {
      setError("Google sign in failed. Please try again.");
      setGoogleLoading(false);
    } else if (response?.type === "dismiss" || response?.type === "cancel") {
      setGoogleLoading(false);
    }
  }, [response]);

  async function handleGoogleToken(accessToken: string) {
    try {
      // Exchange Google access token for our app JWT
      const res = await apiRequest("POST", "/api/auth/google-token", { accessToken });
      const payload = await res.json();
      if (!payload.user) throw new Error(payload.message || "Google sign in failed");
      const token = payload.accessToken || null;
      await AsyncStorage.setItem("a2b_user", JSON.stringify(payload.user));
      if (token) await AsyncStorage.setItem("a2b_token", token);
      setUser(payload.user);
      setTimeout(() => router.replace("/role-select"), 0);
    } catch (e: any) {
      setError(e.message || "Google sign in failed. Please try again.");
    } finally {
      setGoogleLoading(false);
    }
  }

  async function handleLogin() {
    if (!username.trim() || !password.trim()) { setError("Please fill in all fields"); return; }
    setLoading(true); setError("");
    try {
      await login(username.trim(), password);
      setTimeout(() => router.replace("/role-select"), 0);
    } catch (e: any) {
      setError(e.message?.includes("401") ? "Invalid credentials" : "Login failed. Please try again.");
    } finally { setLoading(false); }
  }

  async function handleGoogleSignIn() {
    if (!GOOGLE_CLIENT_ID) {
      Alert.alert("Setup Required", "Google Client ID not configured.");
      return;
    }
    setGoogleLoading(true);
    setError("");
    await promptAsync();
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 20) }]}>
      <Pressable style={styles.backBtn} onPress={() => router.canGoBack() ? router.back() : router.replace("/")}>
        <Ionicons name="chevron-back" size={24} color={Colors.white} />
      </Pressable>

      <View style={styles.header}>
        <Text style={styles.title}>Welcome Back</Text>
        <Text style={styles.subtitle}>Sign in to your A2B LIFT account</Text>
      </View>

      <View style={styles.form}>
        {!!error && (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle" size={16} color={Colors.error} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Username</Text>
          <View style={styles.inputWrapper}>
            <Ionicons name="person-outline" size={18} color={Colors.textMuted} />
            <TextInput style={styles.input} placeholder="Enter username" placeholderTextColor={Colors.textMuted}
              value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} />
          </View>
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Password</Text>
          <View style={styles.inputWrapper}>
            <Ionicons name="lock-closed-outline" size={18} color={Colors.textMuted} />
            <TextInput style={styles.input} placeholder="Enter password" placeholderTextColor={Colors.textMuted}
              value={password} onChangeText={setPassword} secureTextEntry={!showPassword} />
            <Pressable onPress={() => setShowPassword(!showPassword)} hitSlop={8}>
              <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={18} color={Colors.textMuted} />
            </Pressable>
          </View>
        </View>

        <Pressable style={({ pressed }) => [styles.loginBtn, pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] }, loading && { opacity: 0.7 }]}
          onPress={handleLogin} disabled={loading}>
          {loading ? <ActivityIndicator color={Colors.primary} /> : <Text style={styles.loginBtnText}>Sign In</Text>}
        </Pressable>

        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>or continue with</Text>
          <View style={styles.dividerLine} />
        </View>

        <Pressable style={({ pressed }) => [styles.googleBtn, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }, googleLoading && { opacity: 0.7 }]}
          onPress={handleGoogleSignIn} disabled={googleLoading}>
          {googleLoading ? <ActivityIndicator color="#1a1a1a" size="small" /> : (
            <>
              <Image
                source={require("../assets/images/google_icon.png")}
                style={{ width: 22, height: 22 }}
                resizeMode="contain"
              />
              <Text style={styles.googleBtnText}>Continue with Google</Text>
            </>
          )}
        </Pressable>
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 16) }]}>
        <Text style={styles.footerText}>Don't have an account?</Text>
        <Pressable onPress={() => router.replace("/register")}>
          <Text style={styles.footerLink}>Create Account</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.primary, paddingHorizontal: 24 },
  backBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center", marginLeft: -8 },
  header: { marginTop: 20, marginBottom: 36 },
  title: { fontSize: 28, fontFamily: "Inter_700Bold", color: Colors.white, marginBottom: 8 },
  subtitle: { fontSize: 15, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
  form: { gap: 16 },
  errorBox: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "rgba(255,77,77,0.1)", padding: 12, borderRadius: 10, borderWidth: 1, borderColor: "rgba(255,77,77,0.2)" },
  errorText: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.error },
  inputGroup: { gap: 8 },
  label: { fontSize: 12, fontFamily: "Inter_500Medium", color: Colors.textSecondary, textTransform: "uppercase", letterSpacing: 1 },
  inputWrapper: { flexDirection: "row", alignItems: "center", backgroundColor: Colors.card, borderRadius: 12, paddingHorizontal: 16, gap: 12, borderWidth: 1, borderColor: Colors.border },
  input: { flex: 1, paddingVertical: 15, fontSize: 15, fontFamily: "Inter_400Regular", color: Colors.white },
  loginBtn: { backgroundColor: Colors.white, paddingVertical: 15, borderRadius: 14, alignItems: "center", marginTop: 4 },
  loginBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: Colors.primary },
  dividerRow: { flexDirection: "row", alignItems: "center", gap: 12, marginVertical: 2 },
  dividerLine: { flex: 1, height: 1, backgroundColor: Colors.border },
  dividerText: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textMuted },
  googleBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12, backgroundColor: "#ffffff", paddingVertical: 14, borderRadius: 14, borderWidth: 1, borderColor: "#e0e0e0" },
  googleIconWrap: { width: 22, height: 22, borderRadius: 11, backgroundColor: "#4285F4", alignItems: "center", justifyContent: "center" },
  googleG: { fontSize: 13, fontFamily: "Inter_700Bold", color: "#fff" },
  googleBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#1a1a1a" },
  footer: { flex: 1, justifyContent: "flex-end", flexDirection: "row", alignItems: "flex-end", gap: 4, paddingTop: 24 },
  footerText: { fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.textMuted },
  footerLink: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.white },
});

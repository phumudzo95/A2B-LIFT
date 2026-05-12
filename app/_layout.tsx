import { QueryClientProvider } from "@tanstack/react-query";
import { Stack, router, usePathname, useRootNavigationState } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useState } from "react";
import { Platform } from "react-native";
import * as Linking from "expo-linking";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { StatusBar } from "expo-status-bar";
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from "@expo-google-fonts/inter";
import { ErrorBoundary } from "@mobile-ui/errors";
import { getAppVariant, getAuthenticatedHomeRoute, usesRoleSelect } from "@mobile-core/app-variant";
import { queryClient } from "@mobile-core/query";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AuthProvider, useAuth } from "@mobile-core/auth";
import { SocketProvider } from "@mobile-core/socket";

const RIDE_ALERT_CHANNEL_ID = "ride-alerts-v3";
const RIDE_ALERT_SOUND = "trip_alert.wav";
const NEEDS_ROLE_SELECT_KEY = "a2b_needs_role_select";

// ─── Global notification handler (runs before any screen mounts) ─────────────
// Set ONCE at module level. The chauffeur dashboard no longer re-sets this,
// preventing race conditions between the two calls.
if (Platform.OS !== "web") {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Notifications = require("expo-notifications");
    if (Platform.OS === "android") {
      // Create the channel synchronously at startup so the OS knows about it
      // before any push arrives (even if the app is cold-started by a push)
      Notifications.setNotificationChannelAsync(RIDE_ALERT_CHANNEL_ID, {
        name: "Ride Alerts",
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        sound: RIDE_ALERT_SOUND,
        bypassDnd: true,
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        showBadge: true,
        enableLights: true,
        lightColor: "#22c55e",
      });
      // Also keep a standard channel for non-ride alerts
      Notifications.setNotificationChannelAsync("default", {
        name: "General",
        importance: Notifications.AndroidImportance.DEFAULT,
        sound: "default",
      });
      // Client-specific alert channel — must exist at startup so pushes
      // can be delivered before the client screen has mounted
      Notifications.setNotificationChannelAsync("client-alerts", {
        name: "Client Alerts",
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 200, 200, 200],
        sound: RIDE_ALERT_SOUND,
        bypassDnd: true,
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        showBadge: true,
      });
    }
    // This handler controls foreground notification presentation.
    // It is set ONCE here so all screens inherit it automatically.
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
      }),
    });
  } catch {}
}

SplashScreen.preventAutoHideAsync();

function normalizeReferralCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  return normalized || null;
}

function extractReferralCodeFromUrl(url: string): string | null {
  const parsed = Linking.parse(url);
  const queryRef = parsed.queryParams?.ref;
  if (typeof queryRef === "string") {
    return normalizeReferralCode(queryRef);
  }

  const pathSegments = String(parsed.path || "")
    .split("/")
    .filter(Boolean);

  if (pathSegments.length >= 2 && ["r", "ref", "referral"].includes(pathSegments[0])) {
    return normalizeReferralCode(pathSegments[1]);
  }

  return null;
}

function AuthGate() {
  const { user, isLoading } = useAuth();
  const pathname = usePathname();
  const navState = useRootNavigationState();
  const appVariant = getAppVariant();
  const shouldShowRoleSelect = usesRoleSelect(appVariant);
  const authenticatedHomeRoute = getAuthenticatedHomeRoute(appVariant);

  useEffect(() => {
    if (isLoading || !navState?.key) return;

    // Screens that require no user
    const isGuestOnly = pathname === "/" || pathname === "/login" || pathname === "/register";
    // Screens that require a user
    const isProtected =
      pathname.startsWith("/client") ||
      pathname.startsWith("/chauffeur") ||
      pathname === "/role-select" ||
      pathname === "/chauffeur-register";

    if (user && !shouldShowRoleSelect && pathname === "/role-select") {
      router.replace(authenticatedHomeRoute);
      return;
    }

    if (user && isGuestOnly) {
      if (!shouldShowRoleSelect) {
        router.replace(authenticatedHomeRoute);
        return;
      }

      // Restore last mode, defaulting straight to dashboard for returning users.
      // role-select remains available when users explicitly navigate there.
      Promise.all([
        AsyncStorage.getItem(NEEDS_ROLE_SELECT_KEY),
        AsyncStorage.getItem("a2b_last_mode"),
      ]).then(async ([needsRoleSelect, lastMode]) => {
        if (needsRoleSelect === "1") {
          await AsyncStorage.removeItem(NEEDS_ROLE_SELECT_KEY);
          router.replace("/role-select");
          return;
        }

        if (user.role === "chauffeur") {
          if (lastMode === "client") {
            router.replace("/client");
          } else {
            router.replace("/chauffeur");
          }
        } else if (lastMode === "chauffeur") {
          router.replace("/chauffeur");
        } else {
          router.replace("/client");
        }
      }).catch(() => {
        if (user.role === "chauffeur") {
          router.replace("/chauffeur");
        } else {
          router.replace("/client");
        }
      });
    } else if (!user && isProtected) {
      // Not logged in but trying to access app — send to landing
      router.replace("/");
    }
  }, [user, isLoading, pathname, navState?.key, shouldShowRoleSelect, authenticatedHomeRoute]);

  return null;
}

function ReferralLinkGate() {
  const { user, setPendingReferralCode } = useAuth();

  useEffect(() => {
    let active = true;

    const handleReferralUrl = async (url: string) => {
      const referralCode = extractReferralCodeFromUrl(url);
      if (!referralCode) return;

      await setPendingReferralCode(referralCode);
      if (!user) {
        router.replace({ pathname: "/register", params: { ref: referralCode } });
      }
    };

    Linking.getInitialURL()
      .then((url) => {
        if (active && url) {
          void handleReferralUrl(url);
        }
      })
      .catch(() => {});

    const subscription = Linking.addEventListener("url", ({ url }) => {
      void handleReferralUrl(url);
    });

    return () => {
      active = false;
      subscription.remove();
    };
  }, [setPendingReferralCode, user]);

  return null;
}

function RootLayoutNav() {
  const appVariant = getAppVariant();
  const shouldShowRoleSelect = usesRoleSelect(appVariant);
  const shouldIncludeClientRoutes = appVariant !== "driver";
  const shouldIncludeDriverRoutes = appVariant !== "client";

  return (
    <>
      <AuthGate />
      <ReferralLinkGate />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#000000" } }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="login" />
        <Stack.Screen name="register" />
        {shouldShowRoleSelect ? <Stack.Screen name="role-select" /> : null}
        {shouldIncludeClientRoutes ? <Stack.Screen name="client" options={{ gestureEnabled: false }} /> : null}
        {shouldIncludeDriverRoutes ? <Stack.Screen name="chauffeur" options={{ gestureEnabled: false }} /> : null}
        {shouldIncludeDriverRoutes ? <Stack.Screen name="chauffeur-register" /> : null}
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });
  const [fontLoadTimedOut, setFontLoadTimedOut] = useState(false);

  useEffect(() => {
    if (fontsLoaded || fontError) return;
    const timeout = setTimeout(() => {
      setFontLoadTimedOut(true);
    }, 4000);
    return () => clearTimeout(timeout);
  }, [fontsLoaded, fontError]);

  useEffect(() => {
    if (fontsLoaded || fontError || fontLoadTimedOut) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError, fontLoadTimedOut]);

  if (!fontsLoaded && !fontError && !fontLoadTimedOut) return null;

  const appTree = (
    <AuthProvider>
      <SocketProvider>
        <StatusBar style="light" />
        <RootLayoutNav />
      </SocketProvider>
    </AuthProvider>
  );

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <GestureHandlerRootView style={{ flex: 1 }}>
          {appTree}
        </GestureHandlerRootView>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

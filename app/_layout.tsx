import { QueryClientProvider } from "@tanstack/react-query";
import { Stack, router, usePathname, useRootNavigationState } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useState } from "react";
import { Platform } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { StatusBar } from "expo-status-bar";
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from "@expo-google-fonts/inter";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { queryClient } from "@/lib/query-client";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { SocketProvider } from "@/lib/socket-context";

SplashScreen.preventAutoHideAsync();

function AuthGate() {
  const { user, isLoading } = useAuth();
  const pathname = usePathname();
  const navState = useRootNavigationState();

  useEffect(() => {
    if (isLoading || !navState?.key) return;

    // Screens that require no user
    const isGuestOnly = pathname === "/" || pathname === "/login" || pathname === "/register";
    // Screens that require a user
    const isProtected =
      pathname.startsWith("/client") ||
      pathname.startsWith("/chauffeur") ||
      pathname === "/role-select";

    if (user && isGuestOnly) {
      // Restore last mode, or default to role-select
      AsyncStorage.getItem("a2b_last_mode").then(lastMode => {
        if (user.role === "chauffeur") {
          if (lastMode === "client") {
            router.replace("/client");
          } else {
            router.replace("/chauffeur");
          }
        } else if (lastMode === "client") {
          router.replace("/client");
        } else {
          router.replace("/role-select");
        }
      }).catch(() => {
        if (user.role === "chauffeur") {
          router.replace("/chauffeur");
        } else {
          router.replace("/role-select");
        }
      });
    } else if (!user && isProtected) {
      // Not logged in but trying to access app — send to landing
      router.replace("/");
    }
  }, [user, isLoading, pathname, navState?.key]);

  return null;
}

function RootLayoutNav() {
  return (
    <>
      <AuthGate />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#000000" } }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="login" />
        <Stack.Screen name="register" />
        <Stack.Screen name="role-select" />
        <Stack.Screen name="client" options={{ gestureEnabled: false }} />
        <Stack.Screen name="chauffeur" options={{ gestureEnabled: false }} />
        <Stack.Screen name="chauffeur-register" />
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
          {Platform.OS === "ios" ? <KeyboardProvider>{appTree}</KeyboardProvider> : appTree}
        </GestureHandlerRootView>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

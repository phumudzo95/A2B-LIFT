import { QueryClientProvider } from "@tanstack/react-query";
import { Stack, router, usePathname, useRootNavigationState } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { StatusBar } from "expo-status-bar";
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from "@expo-google-fonts/inter";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { queryClient } from "@/lib/query-client";
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
    const isProtected = pathname.startsWith("/client") || pathname.startsWith("/chauffeur");

    if (user && isGuestOnly) {
      // Logged-in user landed on splash/login/register — send to role select
      router.replace("/role-select");
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
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <KeyboardProvider>
            <AuthProvider>
              <SocketProvider>
                <StatusBar style="light" />
                <RootLayoutNav />
              </SocketProvider>
            </AuthProvider>
          </KeyboardProvider>
        </GestureHandlerRootView>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

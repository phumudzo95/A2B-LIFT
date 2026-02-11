import React, { createContext, useContext, useState, useEffect, useMemo, ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { apiRequest } from "@/lib/query-client";

interface AuthUser {
  id: string;
  username: string;
  name: string;
  phone: string | null;
  role: string;
  rating: number | null;
  walletBalance: number | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (data: { username: string; password: string; name: string; phone: string }) => Promise<void>;
  logout: () => Promise<void>;
  setUser: (user: AuthUser | null) => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadUser();
  }, []);

  async function loadUser() {
    try {
      const stored = await AsyncStorage.getItem("a2b_user");
      if (stored) {
        setUser(JSON.parse(stored));
      }
    } catch (e) {
      console.error("Failed to load user:", e);
    } finally {
      setIsLoading(false);
    }
  }

  async function login(username: string, password: string) {
    const res = await apiRequest("POST", "/api/auth/login", { username, password });
    const userData = await res.json();
    setUser(userData);
    await AsyncStorage.setItem("a2b_user", JSON.stringify(userData));
  }

  async function register(data: { username: string; password: string; name: string; phone: string }) {
    const res = await apiRequest("POST", "/api/auth/register", data);
    const userData = await res.json();
    setUser(userData);
    await AsyncStorage.setItem("a2b_user", JSON.stringify(userData));
  }

  async function logout() {
    setUser(null);
    await AsyncStorage.removeItem("a2b_user");
    await AsyncStorage.removeItem("a2b_chauffeur");
  }

  async function refreshUser() {
    if (!user) return;
    try {
      const res = await apiRequest("GET", `/api/users/${user.id}`);
      const userData = await res.json();
      setUser(userData);
      await AsyncStorage.setItem("a2b_user", JSON.stringify(userData));
    } catch (e) {
      console.error("Failed to refresh user:", e);
    }
  }

  const value = useMemo(
    () => ({ user, isLoading, login, register, logout, setUser, refreshUser }),
    [user, isLoading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

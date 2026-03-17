import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
  ReactNode,
} from "react";
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

type LoginResponse =
  | AuthUser
  | {
      user: AuthUser;
      accessToken?: string;
    };

interface AuthContextValue {
  user: AuthUser | null;
  accessToken: string | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (data: {
    username: string;
    password: string;
    name: string;
    phone: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
  setUser: (user: AuthUser | null) => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
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
      const token = await AsyncStorage.getItem("a2b_token");
      if (token) setAccessToken(token);
    } catch (e) {
      console.error("Failed to load user:", e);
    } finally {
      setIsLoading(false);
    }
  }

  function normalizeAuthPayload(payload: LoginResponse): {
    user: AuthUser;
    accessToken: string | null;
  } {
    if ((payload as any)?.user) {
      return {
        user: (payload as any).user,
        accessToken: (payload as any).accessToken || null,
      };
    }
    return { user: payload as AuthUser, accessToken: null };
  }

  async function login(username: string, password: string) {
    const res = await apiRequest("POST", "/api/auth/login", {
      username,
      password,
    });
    const payload = (await res.json()) as LoginResponse;
    const normalized = normalizeAuthPayload(payload);
    setUser(normalized.user);
    setAccessToken(normalized.accessToken);
    await AsyncStorage.setItem("a2b_user", JSON.stringify(normalized.user));
    if (normalized.accessToken) {
      await AsyncStorage.setItem("a2b_token", normalized.accessToken);
    }
  }

  async function register(data: {
    username: string;
    password: string;
    name: string;
    phone: string;
  }) {
    try {
      const res = await apiRequest("POST", "/api/auth/register", data);
      const payload = (await res.json()) as LoginResponse;
      const normalized = normalizeAuthPayload(payload);
      setUser(normalized.user);
      setAccessToken(normalized.accessToken);
      await AsyncStorage.setItem("a2b_user", JSON.stringify(normalized.user));
      if (normalized.accessToken) {
        await AsyncStorage.setItem("a2b_token", normalized.accessToken);
      }
    } catch (error: any) {
      console.error("Register API error:", error);
      // Try to extract error message from response
      let errorMessage = error.message || "Registration failed. Please try again.";
      
      // If error message contains status code and response, try to parse JSON
      if (error.message && error.message.includes(":")) {
        const parts = error.message.split(":");
        if (parts.length > 1) {
          try {
            const jsonError = JSON.parse(parts.slice(1).join(":"));
            if (jsonError.message) {
              errorMessage = jsonError.message;
            }
          } catch {
            // If parsing fails, use the original message
          }
        }
      }
      
      throw new Error(errorMessage);
    }
  }

  async function logout() {
    setUser(null);
    setAccessToken(null);
    await AsyncStorage.removeItem("a2b_user");
    await AsyncStorage.removeItem("a2b_chauffeur");
    await AsyncStorage.removeItem("a2b_token");
    // Best-effort server logout (clears cookie on web)
    apiRequest("POST", "/api/auth/logout").catch(() => {});
  }

  async function refreshUser() {
    if (!user) return;
    try {
      // If JWT is configured, prefer /me; otherwise fall back to legacy /users/:id
      try {
        const me = await apiRequest("GET", `/api/auth/me`);
        const meData = (await me.json()) as AuthUser;
        setUser(meData);
        await AsyncStorage.setItem("a2b_user", JSON.stringify(meData));
        return;
      } catch {
        // ignore and fall back
      }

      const res = await apiRequest("GET", `/api/users/${user.id}`);
      const userData = (await res.json()) as AuthUser;
      setUser(userData);
      await AsyncStorage.setItem("a2b_user", JSON.stringify(userData));
    } catch (e) {
      console.error("Failed to refresh user:", e);
    }
  }

  const value = useMemo(
    () => ({
      user,
      accessToken,
      isLoading,
      login,
      register,
      logout,
      setUser,
      refreshUser,
    }),
    [user, accessToken, isLoading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}


import React, { createContext, useContext, useState, useEffect, useMemo, } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { apiRequest } from "@/lib/query-client";
const AuthContext = createContext(null);
export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [accessToken, setAccessToken] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    useEffect(() => {
        loadUser();
    }, []);
    async function loadUser() {
        try {
            const stored = await AsyncStorage.getItem("a2b_user");
            const token = await AsyncStorage.getItem("a2b_token");
            if (token)
                setAccessToken(token);
            if (stored) {
                setUser(JSON.parse(stored));
            }
        }
        catch (e) {
            console.error("Failed to load user:", e);
        }
        finally {
            setIsLoading(false);
        }
        // After the app is unblocked, silently refresh from server to pick up role/profile changes
        try {
            const token = await AsyncStorage.getItem("a2b_token");
            if (!token)
                return;
            const meRes = await apiRequest("GET", "/api/auth/me");
            if (meRes.ok) {
                const freshUser = await meRes.json();
                setUser(freshUser);
                await AsyncStorage.setItem("a2b_user", JSON.stringify(freshUser));
            }
        }
        catch { }
    }
    function normalizeAuthPayload(payload) {
        if (payload?.user) {
            return {
                user: payload.user,
                accessToken: payload.accessToken || null,
            };
        }
        return { user: payload, accessToken: null };
    }
    async function login(username, password) {
        const res = await apiRequest("POST", "/api/auth/login", {
            username,
            password,
        });
        const payload = (await res.json());
        if (!res.ok) {
            throw new Error(payload.message || "Invalid credentials");
        }
        const normalized = normalizeAuthPayload(payload);
        setUser(normalized.user);
        setAccessToken(normalized.accessToken);
        await AsyncStorage.setItem("a2b_user", JSON.stringify(normalized.user));
        if (normalized.accessToken) {
            await AsyncStorage.setItem("a2b_token", normalized.accessToken);
        }
    }
    async function register(data) {
        const res = await apiRequest("POST", "/api/auth/register", data);
        const payload = (await res.json());
        if (!res.ok) {
            throw new Error(payload.message || "Registration failed. Please try again.");
        }
        const normalized = normalizeAuthPayload(payload);
        setUser(normalized.user);
        setAccessToken(normalized.accessToken);
        await AsyncStorage.setItem("a2b_user", JSON.stringify(normalized.user));
        if (normalized.accessToken) {
            await AsyncStorage.setItem("a2b_token", normalized.accessToken);
        }
    }
    async function logout() {
        setUser(null);
        setAccessToken(null);
        await AsyncStorage.removeItem("a2b_user");
        await AsyncStorage.removeItem("a2b_chauffeur");
        await AsyncStorage.removeItem("a2b_token");
        // Best-effort server logout (clears cookie on web)
        apiRequest("POST", "/api/auth/logout").catch(() => { });
    }
    async function refreshUser() {
        if (!user)
            return;
        try {
            // If JWT is configured, prefer /me; otherwise fall back to legacy /users/:id
            try {
                const me = await apiRequest("GET", `/api/auth/me`);
                const meData = (await me.json());
                setUser(meData);
                await AsyncStorage.setItem("a2b_user", JSON.stringify(meData));
                return;
            }
            catch {
                // ignore and fall back
            }
            const res = await apiRequest("GET", `/api/users/${user.id}`);
            const userData = (await res.json());
            setUser(userData);
            await AsyncStorage.setItem("a2b_user", JSON.stringify(userData));
        }
        catch (e) {
            console.error("Failed to refresh user:", e);
        }
    }
    const value = useMemo(() => ({
        user,
        accessToken,
        isLoading,
        login,
        register,
        logout,
        setUser,
        refreshUser,
    }), [user, accessToken, isLoading]);
    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx)
        throw new Error("useAuth must be used within AuthProvider");
    return ctx;
}

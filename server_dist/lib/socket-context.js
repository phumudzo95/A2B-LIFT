import React, { createContext, useContext, useMemo, useRef, useCallback, useEffect, } from "react";
import { io } from "socket.io-client";
import { getApiUrl } from "@/lib/query-client";
import { useAuth } from "@/lib/auth-context";
const SocketContext = createContext(null);
export function SocketProvider({ children }) {
    const { user, accessToken } = useAuth();
    const socketRef = useRef(null);
    // Local listeners map — used to re-attach after reconnect and for triggerEvent
    const listenersRef = useRef(new Map());
    useEffect(() => {
        if (!user || !accessToken) {
            socketRef.current?.disconnect();
            socketRef.current = null;
            return;
        }
        let baseUrl;
        try {
            baseUrl = getApiUrl();
        }
        catch {
            console.warn("SocketProvider: EXPO_PUBLIC_DOMAIN not set, skipping socket connection");
            return;
        }
        const socket = io(baseUrl, {
            transports: ["polling", "websocket"],
            auth: { token: accessToken },
            reconnectionAttempts: 5,
            reconnectionDelay: 2000,
            timeout: 8000,
        });
        socketRef.current = socket;
        socket.on("connect", () => {
            console.log("[Socket] connected:", socket.id);
            // Re-attach all registered listeners after reconnect
            listenersRef.current.forEach((callbacks, event) => {
                callbacks.forEach((cb) => socket.on(event, cb));
            });
        });
        socket.on("disconnect", (reason) => {
            console.log("[Socket] disconnected:", reason);
        });
        socket.on("connect_error", (err) => {
            console.warn("[Socket] connection error:", err.message);
        });
        return () => {
            socket.disconnect();
            socketRef.current = null;
        };
    }, [user, accessToken]);
    const on = useCallback((event, callback) => {
        if (!listenersRef.current.has(event)) {
            listenersRef.current.set(event, new Set());
        }
        listenersRef.current.get(event).add(callback);
        // Attach to live socket if already connected
        socketRef.current?.on(event, callback);
    }, []);
    const off = useCallback((event, callback) => {
        if (!callback) {
            listenersRef.current.delete(event);
            socketRef.current?.removeAllListeners(event);
        }
        else {
            listenersRef.current.get(event)?.delete(callback);
            socketRef.current?.off(event, callback);
        }
    }, []);
    const emit = useCallback((event, data) => {
        if (socketRef.current?.connected) {
            socketRef.current.emit(event, data);
        }
        else {
            console.warn("[Socket] emit called while disconnected, event:", event);
        }
    }, []);
    // Allows manually triggering local listeners (e.g. for HTTP-polling fallback)
    const triggerEvent = useCallback((event, data) => {
        listenersRef.current.get(event)?.forEach((cb) => cb(data));
    }, []);
    const value = useMemo(() => ({ emit, on, off, triggerEvent }), [emit, on, off, triggerEvent]);
    return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}
export function useSocket() {
    const ctx = useContext(SocketContext);
    if (!ctx)
        throw new Error("useSocket must be used within SocketProvider");
    return ctx;
}

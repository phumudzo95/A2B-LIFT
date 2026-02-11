import React, { createContext, useContext, useMemo, useRef, useCallback, ReactNode } from "react";

type EventCallback = (...args: any[]) => void;

interface SocketContextValue {
  emit: (event: string, data: any) => void;
  on: (event: string, callback: EventCallback) => void;
  off: (event: string, callback?: EventCallback) => void;
  triggerEvent: (event: string, data: any) => void;
}

const SocketContext = createContext<SocketContextValue | null>(null);

export function SocketProvider({ children }: { children: ReactNode }) {
  const listenersRef = useRef<Map<string, Set<EventCallback>>>(new Map());

  const on = useCallback((event: string, callback: EventCallback) => {
    if (!listenersRef.current.has(event)) {
      listenersRef.current.set(event, new Set());
    }
    listenersRef.current.get(event)!.add(callback);
  }, []);

  const off = useCallback((event: string, callback?: EventCallback) => {
    if (!callback) {
      listenersRef.current.delete(event);
    } else {
      listenersRef.current.get(event)?.delete(callback);
    }
  }, []);

  const triggerEvent = useCallback((event: string, data: any) => {
    listenersRef.current.get(event)?.forEach((cb) => cb(data));
  }, []);

  const emit = useCallback((_event: string, _data: any) => {
  }, []);

  const value = useMemo(
    () => ({ emit, on, off, triggerEvent }),
    [emit, on, off, triggerEvent]
  );

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}

export function useSocket() {
  const ctx = useContext(SocketContext);
  if (!ctx) throw new Error("useSocket must be used within SocketProvider");
  return ctx;
}

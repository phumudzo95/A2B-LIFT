import { fetch } from "expo/fetch";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { QueryClient, QueryFunction } from "@tanstack/react-query";

/**
 * Gets the base URL for the Express API server.
 * Set EXPO_PUBLIC_DOMAIN in .env to your Railway (or Render) host, no protocol.
 * e.g. EXPO_PUBLIC_DOMAIN=a2b-lift.up.railway.app
 */
export function getApiUrl(): string {
  const host = process.env.EXPO_PUBLIC_DOMAIN || "api-production-0783.up.railway.app";

  // Use http:// for localhost, IP addresses, or development; https:// for production
  const isLocal = host.includes("localhost") || 
                  host.includes("127.0.0.1") || 
                  host.match(/^192\.168\.\d+\.\d+/) || 
                  host.match(/^10\.\d+\.\d+\.\d+/) ||
                  host.match(/^172\.(1[6-9]|2[0-9]|3[0-1])\.\d+\.\d+/);
  const protocol = isLocal ? "http" : "https";
  const url = new URL(`${protocol}://${host}`);
  return url.href;
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    // Clone the response before reading to avoid consuming the body
    const clonedRes = res.clone();
    const text = (await clonedRes.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

async function getAuthHeader(): Promise<Record<string, string>> {
  try {
    const token = await AsyncStorage.getItem("a2b_token");
    if (token) return { Authorization: `Bearer ${token}` };
  } catch {
    // ignore
  }
  return {};
}

export async function apiRequest(
  method: string,
  route: string,
  data?: unknown | undefined,
): Promise<Response> {
  const baseUrl = getApiUrl();
  const url = new URL(route, baseUrl);

  const authHeader = await getAuthHeader();
  const headers: Record<string, string> = {
    ...(data ? { "Content-Type": "application/json" } : {}),
    ...authHeader,
  };

  const res = await fetch(url.toString(), {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    // credentials: "include" is not supported by expo/fetch on native — JWT via Authorization header is used instead
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const baseUrl = getApiUrl();
    const url = new URL(queryKey.join("/") as string, baseUrl);

    const authHeader = await getAuthHeader();
    const res = await fetch(url.toString(), {
      headers: authHeader,
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null as any;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});


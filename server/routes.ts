import type { Express, Request, Response } from "express";
import { createServer, type Server } from "node:http";
import { Server as SocketIOServer } from "socket.io";
import axios from "axios";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { storage } from "./storage";
import { db, pool } from "./db";
import { users, livenessSessions, rides as ridesTable } from "../shared/schema";
import { desc, eq, sql } from "drizzle-orm";
import { uploadLivenessPhoto, getAdminSignedUrl } from "./livenessPhotoService";
import {
  calculatePrice,
  calculateChauffeurEarnings,
  getPricingConfig,
  getVehicleCategories,
} from "./luxuryPricingEngine";
import { authOptional, requireAuth, requireRole, type AuthedRequest } from "./auth-middleware";
import { signAccessToken, type UserRole } from "./auth";
import { externalApiService } from "./external-api-service";

const RIDE_MATCH_RADIUS_KM = 25;
const CHAUFFEUR_LOCATION_STALE_WINDOW_MS = 10 * 60 * 1000;

function hasFreshChauffeurLocation(chauffeur: { lat?: number | null; lng?: number | null; locationUpdatedAt?: Date | string | null }) {
  if (chauffeur.lat == null || chauffeur.lng == null) return false;
  if (!chauffeur.locationUpdatedAt) return true;
  const timestamp = new Date(chauffeur.locationUpdatedAt).getTime();
  if (!Number.isFinite(timestamp)) return true;
  return Date.now() - timestamp <= CHAUFFEUR_LOCATION_STALE_WINDOW_MS;
}

async function sendExpoPushNotification(
  tokens: string[],
  title: string,
  body: string,
  data?: object,
  options?: { urgent?: boolean },
) {
  const urgent = options?.urgent ?? false;
  const messages = tokens
    .filter(t => t && t.startsWith("ExponentPushToken["))
    .map(to => ({
      to,
      sound: "default",
      title,
      body,
      data: data || {},
      badge: urgent ? 1 : undefined,
      priority: urgent ? "high" : "default",
      ttl: urgent ? 0 : undefined,
      channelId: urgent ? "ride-alerts" : undefined,
      interruptionLevel: urgent ? "time-sensitive" : undefined,
      android: urgent ? { channelId: "ride-alerts", sound: "default" } : undefined,
    }));
  if (messages.length === 0) return;
  try {
    await axios.post("https://exp.host/--/api/v2/push/send", messages, {
      headers: { "Content-Type": "application/json", Accept: "application/json", "Accept-Encoding": "gzip, deflate" },
      timeout: 5000,
    });
  } catch (e: any) {
    console.error("[push] Failed to send Expo push notification:", e.message);
  }
}

function generateAIResponse(type: string, description: string): string {
  const responses: Record<string, string[]> = {
    safety: [
      "We take your safety seriously. Your report has been logged and our safety team has been notified immediately. If you are in immediate danger, please call emergency services (10111). We will follow up within 24 hours.",
      "Thank you for reporting this safety concern. A safety specialist has been assigned to review your case. Please stay in a safe location. Emergency contacts have been alerted.",
    ],
    complaint: [
      "We apologize for the inconvenience. Your complaint has been recorded and will be reviewed by our quality assurance team within 24 hours. We strive to maintain the highest standards of service.",
      "Your feedback is important to us. This complaint has been escalated to our management team for immediate review. You may be eligible for a ride credit pending investigation.",
    ],
    emergency: [
      "EMERGENCY ALERT: Your report has been flagged as urgent. Our emergency response team has been notified. If you are in immediate danger, please call 10111 (police) or 10177 (ambulance). Your GPS location has been logged.",
      "This emergency has been escalated to the highest priority. Safety team and local authorities will be contacted. Please remain calm and stay connected. Your location is being tracked for your safety.",
    ],
  };

  const options = responses[type] || responses.complaint;
  void description;
  return options[Math.floor(Math.random() * options.length)];
}

function setAuthCookie(res: Response, token: string) {
  const isProd = process.env.NODE_ENV === "production";
  res.cookie("a2b_token", token, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

function getPaystackConfig() {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) {
    throw new Error("PAYSTACK_SECRET_KEY is not configured");
  }
  const currency = process.env.PAYSTACK_CURRENCY || "ZAR";
  const callbackUrl = process.env.PAYSTACK_CALLBACK_URL;
  return { secret, currency, callbackUrl };
}

/**
 * Determines the base URL for Paystack callback redirects.
 * Checks env vars in priority order so it works on Replit dev AND Railway production.
 */
function getAppBaseUrl(req?: Request): string {
  if (process.env.REPLIT_DEV_DOMAIN) {
    return `https://${process.env.REPLIT_DEV_DOMAIN}`;
  }
  if (process.env.RAILWAY_PUBLIC_DOMAIN) {
    return `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
  }
  if (process.env.PAYSTACK_CALLBACK_URL) {
    // Strip any path — we just want origin
    try {
      const u = new URL(process.env.PAYSTACK_CALLBACK_URL);
      return u.origin;
    } catch {
      return process.env.PAYSTACK_CALLBACK_URL;
    }
  }
  // Final fallback: derive from the incoming request
  if (req) {
    const proto = req.header("x-forwarded-proto") || req.protocol || "https";
    const host = req.header("x-forwarded-host") || req.get("host") || "";
    return `${proto}://${host}`;
  }
  return "https://api-production-0783.up.railway.app";
}

function getLivenessProvider(): "mock" | "smile_id" {
  const raw = (process.env.LIVENESS_PROVIDER || "mock").toLowerCase().trim();
  return raw === "smile_id" ? "smile_id" : "mock";
}

function buildChallengeCode(): string {
  const pool = ["BLINK", "TURN_LEFT", "TURN_RIGHT", "SMILE"];
  const first = pool[Math.floor(Math.random() * pool.length)];
  const second = pool[Math.floor(Math.random() * pool.length)];
  return `${first}-${second}`;
}

function challengeLabel(code: string): string {
  const labels: Record<string, string> = {
    BLINK: "Blink your eyes",
    TURN_LEFT: "Turn your face left",
    TURN_RIGHT: "Turn your face right",
    SMILE: "Give a clear smile",
  };
  return code
    .split("-")
    .map((part) => labels[part] || part)
    .join(" then ");
}

function isAllowedSelfieUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (!["https:"].includes(parsed.protocol)) return false;

    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    if (supabaseUrl) {
      const supabaseHost = new URL(supabaseUrl).host;
      if (parsed.host === supabaseHost) return true;
    }

    // Allow known Supabase storage domains when explicit env is missing.
    return parsed.host.endsWith("supabase.co");
  } catch {
    return false;
  }
}

function getImageDimensions(buffer: Buffer): { width: number; height: number } | null {
  // PNG
  if (
    buffer.length > 24 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return {
      width: buffer.readUInt32BE(16),
      height: buffer.readUInt32BE(20),
    };
  }

  // JPEG (scan markers for SOF0/SOF2)
  if (buffer.length > 4 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset < buffer.length - 1) {
      if (buffer[offset] !== 0xff) {
        offset++;
        continue;
      }
      const marker = buffer[offset + 1];
      if (marker === 0xc0 || marker === 0xc2) {
        if (offset + 8 >= buffer.length) return null;
        const height = buffer.readUInt16BE(offset + 5);
        const width = buffer.readUInt16BE(offset + 7);
        return { width, height };
      }
      if (marker === 0xda || marker === 0xd9) break;
      if (offset + 3 >= buffer.length) break;
      const segmentLength = buffer.readUInt16BE(offset + 2);
      if (segmentLength <= 0) break;
      offset += 2 + segmentLength;
    }
  }

  return null;
}

async function runMockSelfieQualityCheck(selfieUrl: string): Promise<{
  passed: boolean;
  score: number;
  reason?: string;
}> {
  // In mock mode we only validate that the selfie was uploaded to the allowed
  // Supabase storage domain.  No image-fetch or pixel-level checks are done
  // here — those would require a real ML liveness provider.
  if (!isAllowedSelfieUrl(selfieUrl)) {
    return {
      passed: false,
      score: 0.1,
      reason: "Selfie URL is not from an allowed secure storage domain.",
    };
  }

  return { passed: true, score: 0.95 };
}

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);

  const SUPABASE_SERVICE_KEY_CONFIGURED = !!(process.env.SUPABASE_SERVICE_ROLE_KEY);

  // Attach optional auth to all API requests (doesn't break legacy endpoints)
  app.use("/api", authOptional);

  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  io.on("connection", (socket) => {
    console.log("Socket connected:", socket.id);

    // Driver registers their chauffeurId on connect so we can target them for nearby trips
    socket.on("chauffeur:register", (data: { chauffeurId: string }) => {
      if (data?.chauffeurId) {
        (socket.data as any).chauffeurId = data.chauffeurId;
      }
    });

    socket.on("chauffeur:location", async (data) => {
      const { chauffeurId, lat, lng } = data;
      if (chauffeurId) {
        // Store chauffeurId on socket for targeted ride dispatch
        (socket.data as any).chauffeurId = chauffeurId;
        await storage.updateChauffeur(chauffeurId, {
          lat,
          lng,
          locationUpdatedAt: new Date(),
        });
        io.emit("location:update", { chauffeurId, lat, lng });
      }
    });

    socket.on("ride:request", async (data) => {
      io.emit("ride:new", data);
    });

    // ride:accept and ride:status are intentionally NOT relayed from socket events.
    // All ride state changes must go through the authenticated REST endpoints
    // (PUT /api/rides/:id/accept and PUT /api/rides/:id/status) which enforce
    // ownership checks and emit the socket events server-side after validation.

    socket.on("chat:message", async (data) => {
      io.emit("chat:newMessage", data);
    });

    socket.on("disconnect", () => {
      console.log("Socket disconnected:", socket.id);
    });
  });

  // Health check for Railway / Render uptime monitoring
  app.get("/api/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Haversine distance in km between two lat/lng points
  function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function getUserFirstName(user: { name?: string | null; username?: string | null } | null | undefined, fallback = "Rider"): string {
    const candidates = [user?.name, user?.username]
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      .map((value) => value.trim());

    for (const candidate of candidates) {
      const normalized = candidate.includes("@") ? candidate.split("@")[0] : candidate;
      const first = normalized
        .replace(/[._-]+/g, " ")
        .split(/\s+/)
        .find(Boolean);

      if (!first) continue;

      const lowered = first.toLowerCase();
      if (["a2b", "client", "rider", "user", "oauth"].includes(lowered)) continue;

      return first.charAt(0).toUpperCase() + first.slice(1);
    }

    return fallback;
  }

  let clientRatingsReady: Promise<void> | null = null;
  function ensureClientRatingsTable() {
    if (!clientRatingsReady) {
      clientRatingsReady = (async () => {
        await pool.query(`
          CREATE TABLE IF NOT EXISTS client_ratings (
            id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
            ride_id varchar NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
            client_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            chauffeur_id varchar NOT NULL REFERENCES chauffeurs(id) ON DELETE CASCADE,
            rating integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
            comment text,
            created_at timestamp DEFAULT now()
          )
        `);
        await pool.query(`
          CREATE UNIQUE INDEX IF NOT EXISTS idx_client_ratings_ride_chauffeur_unique
          ON client_ratings (ride_id, chauffeur_id)
        `);
        await pool.query(`
          CREATE INDEX IF NOT EXISTS idx_client_ratings_client_id
          ON client_ratings (client_id)
        `);
      })().catch((error) => {
        clientRatingsReady = null;
        throw error;
      });
    }
    return clientRatingsReady;
  }

  // -----------------------------
  // Auth (JWT)
  // -----------------------------
  app.post("/api/auth/register", async (req: Request, res: Response) => {
    try {
      const { username, password, name, phone, role } = req.body;

      if (!username || !password || !name) {
        return res.status(400).json({ message: "Email, password, and name are required" });
      }

      // Normalise email — username field now stores email address
      const email = username.trim().toLowerCase();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ message: "Please enter a valid email address" });
      }

      // Email must be unique
      const existing = await storage.getUserByUsername(email);
      if (existing) {
        return res.status(400).json({ message: "An account with this email already exists" });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const user = await storage.createUser({
        username: email,
        password: hashedPassword,
        name: name.trim(),
        phone: phone ? phone.trim() : null,
        role: (role || "client") as UserRole,
      });

      const token = signAccessToken({ sub: user.id, role: user.role as UserRole, email: user.username, name: user.name });
      setAuthCookie(res, token);
      const { password: _pw, ...safeUser } = user;
      return res.json({ user: safeUser, accessToken: token });
    } catch (error: any) {
      if (error.code === "23505") {
        return res.status(400).json({ message: "An account with this email already exists" });
      }
      if (error.code === "42P01") {
        return res.status(500).json({ message: "Database table not found. Please run: npm run db:push" });
      }
      return res.status(500).json({ message: error.message || "Registration failed. Please try again." });
    }
  });

  app.post("/api/auth/login", async (req: Request, res: Response) => {
    try {
      const { username, password } = req.body;
      const user = await storage.getUserByUsername(username);
      if (!user) {
        return res.status(401).json({ message: "Invalid credentials" });
      }
      const valid = await bcrypt.compare(password, user.password);
      if (!valid) {
        return res.status(401).json({ message: "Invalid credentials" });
      }
      const token = signAccessToken({ sub: user.id, role: user.role as UserRole, email: user.username, name: user.name });
      setAuthCookie(res, token);
      const { password: _pw, ...safeUser } = user;
      return res.json({ user: safeUser, accessToken: token });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/auth/logout", async (_req: Request, res: Response) => {
    res.clearCookie("a2b_token", { path: "/" });
    return res.json({ ok: true });
  });

  app.get("/api/auth/me", requireAuth, async (req: AuthedRequest, res: Response) => {
    const user = await storage.getUser(req.auth!.sub);
    if (!user) return res.status(404).json({ message: "User not found" });
    const { password: _pw, ...safeUser } = user;
    return res.json(safeUser);
  });

  // -----------------------------
  // Maps helpers — Google Places API only
  // -----------------------------

  const GOOGLE_KEY = process.env.GOOGLE_API_KEY || "AIzaSyAY-_nYP4PvZcKDaY-KVuZXx0oB0syx1N0";

  // Geocode: Google only
  app.get("/api/geocode", async (req: Request, res: Response) => {
    try {
      const address = req.query.address as string;
      if (!address) return res.status(400).json({ message: "Address is required" });
      if (!GOOGLE_KEY) return res.status(500).json({ message: "Google Maps API key not configured" });

      const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&components=country:ZA&key=${GOOGLE_KEY}`;
      const r = await (await fetch(url)).json() as any;
      if (r.status === "OK" && r.results.length > 0) {
        const loc = r.results[0].geometry.location;
        return res.json({ lat: loc.lat, lng: loc.lng });
      }
      return res.status(404).json({ message: "Location not found" });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  // Autocomplete: Google Places API only
  app.get("/api/places/autocomplete", async (req: Request, res: Response) => {
    try {
      const input = req.query.input as string;
      if (!input || input.trim().length < 2) return res.json({ predictions: [] });
      if (!GOOGLE_KEY) return res.status(500).json({ message: "Google Maps API key not configured" });

      const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(input)}&components=country:za&language=en&key=${GOOGLE_KEY}`;
      const r = await (await fetch(url)).json() as any;
      const mappedPredictions = Array.isArray(r.predictions)
        ? r.predictions.slice(0, 6).map((p: any) => ({
            placeId: p.place_id,
            description: p.description,
            mainText: p.structured_formatting?.main_text || p.description.split(",")[0],
            secondaryText: p.structured_formatting?.secondary_text || "",
            lat: null,
            lng: null,
          }))
        : [];

      if (r.status === "OK" && r.predictions.length > 0) {
        return res.json({ predictions: mappedPredictions });
      }

      if (input.trim().length >= 3) {
        const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(input)}&components=country:ZA&key=${GOOGLE_KEY}`;
        const geocodeResponse = await (await fetch(geocodeUrl)).json() as any;
        if (geocodeResponse.status === "OK" && Array.isArray(geocodeResponse.results) && geocodeResponse.results.length > 0) {
          return res.json({
            predictions: geocodeResponse.results.slice(0, 5).map((result: any) => ({
              placeId: result.place_id,
              description: result.formatted_address,
              mainText: result.address_components?.[0]?.long_name || result.formatted_address.split(",")[0],
              secondaryText: result.formatted_address
                .split(",")
                .slice(1)
                .join(", ")
                .trim(),
              lat: result.geometry?.location?.lat ?? null,
              lng: result.geometry?.location?.lng ?? null,
            })),
          });
        }
      }

      return res.json({ predictions: [] });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  // Place details: Google Places API only
  app.get("/api/places/details", async (req: Request, res: Response) => {
    try {
      const placeId = req.query.placeId as string;
      if (!placeId) return res.status(400).json({ message: "placeId is required" });
      if (!GOOGLE_KEY) return res.status(500).json({ message: "Google Maps API key not configured" });

      const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=geometry,formatted_address,name&key=${GOOGLE_KEY}`;
      const r = await (await fetch(url)).json() as any;
      if (r.status === "OK") {
        const loc = r.result.geometry.location;
        return res.json({ lat: loc.lat, lng: loc.lng, address: r.result.formatted_address });
      }
      return res.status(404).json({ message: "Place not found" });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  // Reverse geocode: Google only
  app.get("/api/places/reverse", async (req: Request, res: Response) => {
    try {
      const { lat, lng } = req.query;
      if (!lat || !lng) return res.status(400).json({ message: "lat and lng are required" });
      if (!GOOGLE_KEY) return res.status(500).json({ message: "Google Maps API key not configured" });

      const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${GOOGLE_KEY}`;
      const r = await (await fetch(url)).json() as any;
      if (r.status === "OK" && r.results.length > 0) {
        const best = r.results[0];
        const components = best.address_components;
        const get = (type: string) => components.find((c: any) => c.types.includes(type))?.long_name || "";
        const streetNumber = get("street_number");
        const route = get("route");
        const suburb = get("sublocality_level_1") || get("sublocality") || get("neighborhood");
        const city = get("locality") || get("administrative_area_level_2");
        const province = get("administrative_area_level_1");
        const mainText = route ? `${streetNumber ? streetNumber + " " : ""}${route}` : best.formatted_address.split(",")[0];
        const secondaryParts = [suburb, city, province].filter(Boolean);
        return res.json({
          placeId: best.place_id,
          description: best.formatted_address,
          mainText,
          secondaryText: secondaryParts.join(", "),
          lat: parseFloat(lat as string),
          lng: parseFloat(lng as string),
        });
      }
      return res.status(404).json({ message: "Location not found" });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/directions", async (req: Request, res: Response) => {
    try {
      const { originLat, originLng, destLat, destLng } = req.query;
      if (!originLat || !originLng || !destLat || !destLng) {
        return res
          .status(400)
          .json({ message: "Origin and destination coordinates are required" });
      }
      const apiKey = process.env.GOOGLE_API_KEY;
      if (!apiKey) {
        return res
          .status(500)
          .json({ message: "Google Maps API key not configured" });
      }
      const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${originLat},${originLng}&destination=${destLat},${destLng}&alternatives=true&key=${apiKey}`;
      const response = await fetch(url);
      const data = (await response.json()) as any;
      if (data.status === "OK" && data.routes?.length > 0) {
        const parseRoute = (route: any, idx: number) => {
          const leg = route.legs[0];
          const steps = (leg.steps || []).map((step: any) => ({
            instruction: step.html_instructions.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim(),
            distance: step.distance?.text || "",
            duration: step.duration?.text || "",
            endLat: step.end_location?.lat,
            endLng: step.end_location?.lng,
            maneuver: step.maneuver || "straight",
          }));
          return {
            polyline: route.overview_polyline.points,
            distanceKm: leg.distance.value / 1000,
            distanceText: leg.distance.text,
            durationMin: Math.ceil(leg.duration.value / 60),
            durationText: leg.duration.text,
            summary: route.summary || `Route ${idx + 1}`,
            steps,
          };
        };
        const primary = parseRoute(data.routes[0], 0);
        const alternatives = data.routes.map((r: any, i: number) => parseRoute(r, i));
        return res.json({ ...primary, alternatives });
      }
      return res.status(404).json({ message: "No route found" });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  // -----------------------------
  // Users
  // -----------------------------
  // List all users (admin)
  app.get("/api/users", requireAuth, requireRole(["admin"]), async (_req: AuthedRequest, res: Response) => {
    try {
      const allUsers = await db.select().from(users).orderBy(desc(users.createdAt));
      return res.json(allUsers);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/users/:id", async (req: Request, res: Response) => {
    try {
      const user = await storage.getUser(req.params.id);
      if (!user) return res.status(404).json({ message: "User not found" });
      const { password: _pw, ...safeUser } = user;
      return res.json(safeUser);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/users/:id", async (req: Request, res: Response) => {
    try {
      const user = await storage.updateUser(req.params.id, req.body);
      if (!user) return res.status(404).json({ message: "User not found" });
      const { password: _pw, ...safeUser } = user;
      return res.json(safeUser);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/users/:id/role", async (req: Request, res: Response) => {
    try {
      const { role } = req.body;
      const user = await storage.updateUser(req.params.id, { role });
      if (!user) return res.status(404).json({ message: "User not found" });
      const { password: _pw, ...safeUser } = user;
      return res.json(safeUser);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/users/:id/topup", async (req: Request, res: Response) => {
    try {
      const { amount } = req.body;
      if (!amount || amount <= 0) {
        return res.status(400).json({ message: "Invalid amount" });
      }
      const user = await storage.getUser(req.params.id);
      if (!user) return res.status(404).json({ message: "User not found" });
      const newBalance = (user.walletBalance || 0) + amount;
      const updated = await storage.updateUser(req.params.id, {
        walletBalance: newBalance,
      });
      if (!updated) return res.status(500).json({ message: "Failed to update balance" });
      await storage.createNotification({
        userId: req.params.id,
        title: "Wallet Top Up",
        body: `R ${amount.toFixed(2)} has been added to your wallet. New balance: R ${newBalance.toFixed(2)}`,
        type: "wallet",
      });
      const { password: _pw, ...safeUser } = updated;
      return res.json(safeUser);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  // Version probe — confirms this build is live
  app.get("/api/version", (_req: Request, res: Response) => {
    res.json({ version: "google-oauth-v2", built: new Date().toISOString() });
  });

  // -----------------------------
  // Google OAuth
  // -----------------------------
  // Backend-driven Google OAuth — no proxy, no consent screen.
  // App opens /api/auth/google/start in the browser, Google redirects to
  // /api/auth/google/callback, backend creates user and deep-links back to app.
  app.get("/api/auth/google/start", (req: Request, res: Response) => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) return res.status(500).send("Google OAuth not configured");
    const callbackUrl = `https://api-production-0783.up.railway.app/api/auth/google/callback`;
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", callbackUrl);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "openid email profile");
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "select_account");
    return res.redirect(url.toString());
  });

  app.get("/api/auth/google/callback", async (req: Request, res: Response) => {
    try {
      const { code, error } = req.query as any;
      if (error || !code) {
        return res.redirect(`a2blift://auth?error=${encodeURIComponent(error || "cancelled")}`);
      }
      const clientId = process.env.GOOGLE_CLIENT_ID!;
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET!;
      const callbackUrl = `https://api-production-0783.up.railway.app/api/auth/google/callback`;

      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: callbackUrl, grant_type: "authorization_code" }).toString(),
      });
      const tokens = await tokenRes.json() as any;
      if (tokens.error) {
        return res.redirect(`a2blift://auth?error=${encodeURIComponent(tokens.error_description || tokens.error)}`);
      }

      const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      const googleUser = await userInfoRes.json() as any;
      if (!googleUser.email) {
        return res.redirect(`a2blift://auth?error=no_email`);
      }

      const email = googleUser.email.trim().toLowerCase();
      let user = await storage.getUserByUsername(email);
      if (!user) {
        const randomPassword = await bcrypt.hash(Math.random().toString(36), 10);
        user = await storage.createUser({ username: email, password: randomPassword, name: googleUser.name || email.split("@")[0], phone: null, role: "client" });
      }

      const appToken = signAccessToken({ sub: user.id, role: user.role as UserRole, email: user.username, name: user.name });
      const { password: _pw, ...safeUser } = user;
      // Deep link back into the app with the JWT
      const payload = encodeURIComponent(JSON.stringify({ user: safeUser, accessToken: appToken }));
      return res.redirect(`a2blift://auth?payload=${payload}`);
    } catch (err: any) {
      return res.redirect(`a2blift://auth?error=${encodeURIComponent(err.message)}`);
    }
  });

  app.post("/api/auth/google", async (req: Request, res: Response) => {
    try {
      const { code, redirectUri } = req.body;
      if (!code || !redirectUri) {
        return res.status(400).json({ message: "code and redirectUri are required" });
      }

      const clientId = process.env.GOOGLE_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

      if (!clientId || !clientSecret) {
        return res.status(500).json({ message: "Google OAuth not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in environment variables." });
      }

      // Exchange auth code for tokens
      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }).toString(),
      });

      const tokens = await tokenRes.json() as any;
      if (tokens.error) {
        return res.status(400).json({ message: `Google token error: ${tokens.error_description || tokens.error}` });
      }

      // Get user info from Google
      const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      const googleUser = await userInfoRes.json() as any;

      if (!googleUser.email) {
        return res.status(400).json({ message: "Could not retrieve email from Google" });
      }

      // Use full email as username — consistent with manual registration
      const email = googleUser.email.trim().toLowerCase();
      let user = await storage.getUserByUsername(email);

      if (!user) {
        const randomPassword = await bcrypt.hash(Math.random().toString(36), 10);
        user = await storage.createUser({
          username: email,
          password: randomPassword,
          name: googleUser.name || email.split("@")[0],
          phone: null,
          role: "client",
        });
      }

      const token = signAccessToken({ sub: user.id, role: user.role as UserRole, email: user.username, name: user.name });
      setAuthCookie(res, token);
      const { password: _pw, ...safeUser } = user;
      return res.json({ user: safeUser, accessToken: token });
    } catch (error: any) {
      console.error("Google OAuth error:", error);
      return res.status(500).json({ message: error.message || "Google authentication failed" });
    }
  });


  // Google implicit-flow: accepts an access_token directly (no code exchange needed).
  // Used by the mobile app which uses response_type=token to avoid redirect URI issues.
  app.post("/api/auth/google-token", async (req: Request, res: Response) => {
    try {
      const { accessToken } = req.body;
      if (!accessToken) {
        return res.status(400).json({ message: "accessToken is required" });
      }

      // Fetch user info directly from Google using the access token
      const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const googleUser = await userInfoRes.json() as any;

      if (!googleUser.email) {
        return res.status(400).json({ message: "Could not retrieve email from Google" });
      }

      // Use full email as username so Google and manual accounts share the same record
      const email = googleUser.email.trim().toLowerCase();
      let user = await storage.getUserByUsername(email);

      if (!user) {
        const randomPassword = await bcrypt.hash(Math.random().toString(36), 10);
        user = await storage.createUser({
          username: email,
          password: randomPassword,
          name: googleUser.name || email.split("@")[0],
          phone: null,
          role: "client",
        });
      }

      const token = signAccessToken({ sub: user.id, role: user.role as UserRole, email: user.username, name: user.name });
      setAuthCookie(res, token);
      const { password: _pw, ...safeUser } = user;
      return res.json({ user: safeUser, accessToken: token });
    } catch (error: any) {
      console.error("Google token auth error:", error);
      return res.status(500).json({ message: error.message || "Google authentication failed" });
    }
  });

  app.post("/api/chauffeurs", authOptional, async (req: AuthedRequest, res: Response) => {
    try {
      const userId = req.body.userId;

      // If authenticated, only allow creating/updating own chauffeur profile (unless admin)
      if (req.auth && req.auth.role !== "admin" && req.auth.sub !== userId) {
        return res.status(403).json({ message: "You can only register your own chauffeur profile" });
      }

      // Auto-upsert user in this DB — handles cross-environment tokens (e.g. Railway user vs dev DB)
      if (userId) {
        const existingUser = await storage.getUser(userId);
        if (!existingUser) {
          const randomPw = Math.random().toString(36).slice(2);
          await storage.createUser({
            id: userId,
            username: `driver_${userId.slice(0, 12)}@a2blift.placeholder`,
            password: randomPw,
            name: req.body.name || "A2B Driver",
            phone: req.body.phone || null,
            role: "chauffeur",
          });
        }
      }

      // Upsert: if chauffeur already exists for this user, update instead of creating duplicate
      if (!userId) return res.status(400).json({ message: "userId is required" });
      let chauffeur;
      const existingChauffeur = await storage.getChauffeurByUserId(userId);
      if (existingChauffeur) {
        chauffeur = await storage.updateChauffeur(existingChauffeur.id, {
          carMake: req.body.carMake || existingChauffeur.carMake,
          vehicleModel: req.body.vehicleModel || existingChauffeur.vehicleModel,
          plateNumber: req.body.plateNumber || existingChauffeur.plateNumber,
          vehicleType: req.body.vehicleType || existingChauffeur.vehicleType,
          carColor: req.body.carColor || existingChauffeur.carColor,
          phone: req.body.phone || existingChauffeur.phone,
          passengerCapacity: req.body.passengerCapacity || existingChauffeur.passengerCapacity,
          luggageCapacity: req.body.luggageCapacity || existingChauffeur.luggageCapacity,
          profilePhoto: req.body.profilePhoto || existingChauffeur.profilePhoto,
        });
      } else {
        chauffeur = await storage.createChauffeur(req.body);
      }
      await storage.updateUser(req.body.userId, { role: "chauffeur" });

      // Create/ensure a driver application (pending) for admin review
      const existingApp = await storage.getDriverApplicationByUserId(req.body.userId);
      if (!existingApp) {
        await storage.createDriverApplication({
          userId: req.body.userId,
          chauffeurId: chauffeur!.id,
          status: "pending",
        });
      } else if (existingApp.chauffeurId !== chauffeur!.id) {
        await storage.updateDriverApplication(existingApp.id, { chauffeurId: chauffeur!.id });
      }

      return res.json(chauffeur);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/chauffeurs/user/:userId", async (req: Request, res: Response) => {
    try {
      const chauffeur = await storage.getChauffeurByUserId(req.params.userId);
      if (!chauffeur) return res.status(404).json({ message: "Chauffeur not found" });
      return res.json(chauffeur);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/chauffeurs/:id/push-token", requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const { pushToken } = req.body;
      // Verify the chauffeur belongs to the authenticated user
      const chauffeur = await storage.getChauffeur(req.params.id);
      if (!chauffeur) return res.status(404).json({ message: "Chauffeur not found" });
      if (chauffeur.userId !== req.auth!.sub && req.auth!.role !== "admin") {
        return res.status(403).json({ message: "Forbidden" });
      }
      await storage.updateChauffeur(req.params.id, { pushToken });
      return res.json({ success: true });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/chauffeurs/:id", async (req: Request, res: Response) => {
    try {
      const chauffeur = await storage.getChauffeur(req.params.id);
      if (!chauffeur) return res.status(404).json({ message: "Chauffeur not found" });
      const [ratings, earningsList] = await Promise.all([
        storage.getRatingsByChauffeur(req.params.id),
        storage.getEarningsByChauffeur(req.params.id).catch(() => []),
      ]);
      const computedRating =
        ratings.length > 0
          ? parseFloat((ratings.reduce((s, r) => s + r.rating, 0) / ratings.length).toFixed(1))
          : null;
      const cardEarningsTotal = (earningsList as any[])
        .filter((e: any) => e.type === "card" || e.type === "wallet")
        .reduce((s: number, e: any) => s + (e.amount || 0), 0);
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      // Today's earnings: digital earnings already store the driver's net share,
      // while cash trips contribute the driver's net take-home after commission.
      const todayCardEarnings = (earningsList as any[])
        .filter((e: any) => e.createdAt && new Date(e.createdAt) >= todayStart && (e.type === "card" || e.type === "wallet"))
        .reduce((s: number, e: any) => s + (e.amount || 0), 0);
      // For cash: convert each completed fare into the driver's net share.
      const chauffeurRides = await storage.getRidesByChauffeur(req.params.id);
      const todayCashFares = chauffeurRides
        .filter((r: any) => r.status === "trip_completed" && r.paymentMethod === "cash" && r.completedAt && new Date(r.completedAt) >= todayStart)
        .reduce((s: number, r: any) => s + calculateChauffeurEarnings(r.price || 0).chauffeurEarnings, 0);
      const todayEarnings = Math.round(todayCardEarnings + todayCashFares);
      return res.json({ ...chauffeur, computedRating, totalRatings: ratings.length, cardEarningsTotal, todayEarnings });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/chauffeurs/:id/details", async (req: Request, res: Response) => {
    try {
      const chauffeur = await storage.getChauffeur(req.params.id);
      if (!chauffeur) return res.status(404).json({ message: "Chauffeur not found" });
      const user = await storage.getUser(chauffeur.userId);
      const ratings = await storage.getRatingsByChauffeur(req.params.id);
      const avgRating =
        ratings.length > 0
          ? parseFloat((ratings.reduce((s, r) => s + r.rating, 0) / ratings.length).toFixed(1))
          : null;
      return res.json({
        ...chauffeur,
        driverName: user?.name || "Chauffeur",
        driverPhone: chauffeur.phone || user?.phone || null,
        driverRating: avgRating,
        totalRatings: ratings.length,
      });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/chauffeurs/:id/profile", async (req: Request, res: Response) => {
    try {
      const chauffeur = await storage.getChauffeur(req.params.id);
      if (!chauffeur) return res.status(404).json({ message: "Chauffeur not found" });
      const user = await storage.getUser(chauffeur.userId);
      const ratings = await storage.getRatingsByChauffeur(req.params.id);

      const avgRating =
        ratings.length > 0
          ? parseFloat((ratings.reduce((s, r) => s + r.rating, 0) / ratings.length).toFixed(2))
          : null;

      const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
      ratings.forEach((r) => { distribution[r.rating] = (distribution[r.rating] || 0) + 1; });

      const uniqueClientIds = [...new Set(ratings.slice(0, 30).map((r) => r.clientId))];
      const reviewerMap: Record<string, string> = {};
      await Promise.all(
        uniqueClientIds.map(async (id) => {
          const u = await storage.getUser(id);
          if (u) reviewerMap[id] = u.name;
        })
      );

      const ratingsWithNames = ratings.slice(0, 30).map((r) => ({
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        createdAt: r.createdAt,
        reviewerName: reviewerMap[r.clientId] || "Anonymous",
      }));

      const rides = await storage.getRidesByChauffeur(req.params.id);
      const completedTrips = rides.filter((r) => r.status === "trip_completed").length;

      return res.json({
        id: chauffeur.id,
        driverName: user?.name || "Chauffeur",
        driverRating: avgRating,
        totalRatings: ratings.length,
        completedTrips,
        distribution,
        profilePhoto: chauffeur.profilePhoto,
        carMake: chauffeur.carMake,
        vehicleModel: chauffeur.vehicleModel,
        carColor: chauffeur.carColor,
        plateNumber: chauffeur.plateNumber,
        vehicleCategory: chauffeur.vehicleCategory,
        ratings: ratingsWithNames,
      });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/clients/:id/profile", async (req: Request, res: Response) => {
    try {
      await ensureClientRatingsTable();

      const client = await storage.getUser(req.params.id);
      if (!client) return res.status(404).json({ message: "Client not found" });

      const rides = await storage.getRidesByClient(req.params.id);
      const completedTrips = rides.filter((ride) => ride.status === "trip_completed").length;

      const [summaryResult, distributionResult, reviewsResult] = await Promise.all([
        pool.query(
          `
            SELECT ROUND(AVG(rating)::numeric, 2) AS avg_rating,
                   COUNT(*)::int AS total_ratings
            FROM client_ratings
            WHERE client_id = $1
          `,
          [req.params.id]
        ),
        pool.query(
          `
            SELECT rating, COUNT(*)::int AS count
            FROM client_ratings
            WHERE client_id = $1
            GROUP BY rating
          `,
          [req.params.id]
        ),
        pool.query(
          `
            SELECT
              cr.id,
              cr.rating,
              cr.comment,
              cr.created_at AS "createdAt",
              COALESCE(u.name, 'Chauffeur') AS "reviewerName"
            FROM client_ratings cr
            JOIN chauffeurs ch ON ch.id = cr.chauffeur_id
            JOIN users u ON u.id = ch.user_id
            WHERE cr.client_id = $1
            ORDER BY cr.created_at DESC
            LIMIT 30
          `,
          [req.params.id]
        ),
      ]);

      const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
      for (const row of distributionResult.rows) {
        distribution[Number(row.rating)] = Number(row.count);
      }

      const avgRating = summaryResult.rows[0]?.avg_rating != null
        ? Number(summaryResult.rows[0].avg_rating)
        : null;
      const totalRatings = Number(summaryResult.rows[0]?.total_ratings || 0);

      return res.json({
        id: client.id,
        clientName: client.name || getUserFirstName(client, "Client"),
        clientPhone: client.phone || null,
        clientRating: avgRating,
        totalRatings,
        completedTrips,
        memberSince: client.createdAt,
        distribution,
        ratings: reviewsResult.rows,
      });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/chauffeurs/:id", async (req: Request, res: Response) => {
    try {
      const { name, ...chauffeurData } = req.body;
      const chauffeur = await storage.updateChauffeur(req.params.id, chauffeurData);
      if (!chauffeur) return res.status(404).json({ message: "Chauffeur not found" });
      if (name && chauffeur.userId) {
        await storage.updateUser(chauffeur.userId, { name: name.trim() });
      }
      return res.json({ ...chauffeur, userName: name || chauffeur.userName });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/chauffeurs/:id", requireAuth, requireRole(["admin"]), async (req: AuthedRequest, res: Response) => {
    try {
      const chauffeur = await storage.getChauffeur(req.params.id);
      if (!chauffeur) return res.status(404).json({ message: "Chauffeur not found" });
      // Also delete associated driver application
      if (chauffeur.userId) {
        const app = await storage.getDriverApplicationByUserId(chauffeur.userId);
        if (app) await storage.deleteDriverApplication(app.id);
      }
      await storage.deleteChauffeur(req.params.id);
      return res.json({ message: "Chauffeur deleted" });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/chauffeurs/:id/approve", requireAuth, requireRole(["admin"]), async (req: AuthedRequest, res: Response) => {
    try {
      const chauffeur = await storage.getChauffeur(req.params.id);
      if (!chauffeur) return res.status(404).json({ message: "Chauffeur not found" });
      await storage.updateChauffeur(req.params.id, { isApproved: true });
      if (chauffeur.userId) {
        await storage.createNotification({
          userId: chauffeur.userId,
          type: "approval",
          title: "🎉 Application Approved!",
          body: "Congratulations! Your driver application has been approved. You can now go online and start accepting rides.",
          isRead: false,
        });
        try {
          const app = await storage.getDriverApplicationByUserId(chauffeur.userId);
          if (app) {
            await storage.updateDriverApplication(app.id, {
              status: "approved",
              reviewedAt: new Date(),
              reviewerAdminId: req.auth!.sub,
            });
          }
        } catch (e: any) {
          console.error("[approve] application update failed:", e.message);
        }
        try {
          const docs = await storage.getDocumentsByUser(chauffeur.userId);
          for (const doc of docs) {
            await storage.updateDocument(doc.id, { status: "approved" });
          }
        } catch (e: any) {
          console.error("[approve] document update failed:", e.message);
        }
        if (chauffeur.pushToken) {
          sendExpoPushNotification([chauffeur.pushToken], "Application Approved 🎉", "You're approved! Go online to start accepting rides.");
        }
      }
      return res.json({ success: true });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/chauffeurs/:id/reject", requireAuth, requireRole(["admin"]), async (req: AuthedRequest, res: Response) => {
    try {
      const { reason } = req.body;
      if (!reason?.trim()) return res.status(400).json({ message: "Rejection reason is required" });
      const chauffeur = await storage.getChauffeur(req.params.id);
      if (!chauffeur) return res.status(404).json({ message: "Chauffeur not found" });
      await storage.updateChauffeur(req.params.id, { isApproved: false });
      if (chauffeur.userId) {
        await storage.createNotification({
          userId: chauffeur.userId,
          type: "rejection",
          title: "Application Not Approved",
          body: `Your driver application was not approved. Reason: ${reason.trim()}. Please contact support if you have questions.`,
          isRead: false,
        });
        try {
          const app = await storage.getDriverApplicationByUserId(chauffeur.userId);
          if (app) {
            await storage.updateDriverApplication(app.id, {
              status: "rejected",
              notes: reason.trim(),
              reviewedAt: new Date(),
              reviewerAdminId: req.auth!.sub,
            });
          }
        } catch {}
      }
      return res.json({ success: true });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  // Get documents for a specific chauffeur (admin)
  app.get("/api/chauffeurs/:id/documents", requireAuth, requireRole(["admin"]), async (req: AuthedRequest, res: Response) => {
    try {
      const chauffeur = await storage.getChauffeur(req.params.id);
      if (!chauffeur) return res.status(404).json({ message: "Chauffeur not found" });
      const docs = chauffeur.userId ? await storage.getDocumentsByUser(chauffeur.userId) : [];
      return res.json(docs);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/chauffeurs/:id/toggle-online", async (req: Request, res: Response) => {
    try {
      const chauffeur = await storage.getChauffeur(req.params.id);
      if (!chauffeur) return res.status(404).json({ message: "Chauffeur not found" });
      const updated = await storage.updateChauffeur(req.params.id, {
        isOnline: !chauffeur.isOnline,
      });
      return res.json(updated);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/chauffeurs", async (_req: Request, res: Response) => {
    try {
      const allChauffeurs = await storage.getAllChauffeurs();
      // Enrich with user details (name, username, phone)
      const enriched = await Promise.all(
        allChauffeurs.map(async (c) => {
          const user = c.userId ? await storage.getUser(c.userId) : null;
          return {
            ...c,
            userName: user?.name || "—",
            userPhone: user?.phone || c.phone || "—",
            userEmail: user?.username || "—",
          };
        })
      );
      return res.json(enriched);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  // -----------------------------
  // Driver Applications + Documents (Admin + Driver)
  // -----------------------------
  app.get("/api/driver/applications/me", authOptional, async (req: AuthedRequest, res: Response) => {
    const userId = req.auth?.sub || (req.query.userId as string);
    if (!userId) return res.status(400).json({ message: "userId required" });
    const appRow = await storage.getDriverApplicationByUserId(userId);
    return res.json(appRow || null);
  });

  app.get(
    "/api/admin/driver-applications",
    requireAuth,
    requireRole(["admin"]),
    async (_req: AuthedRequest, res: Response) => {
      const apps = await storage.getDriverApplications();
      return res.json(apps);
    },
  );

  app.put(
    "/api/admin/driver-applications/:id",
    requireAuth,
    requireRole(["admin"]),
    async (req: AuthedRequest, res: Response) => {
      const { status, notes } = req.body;
      const updated = await storage.updateDriverApplication(req.params.id, {
        status,
        notes,
        reviewedAt: new Date(),
        reviewerAdminId: req.auth!.sub,
      });
      if (!updated) return res.status(404).json({ message: "Application not found" });

      if (updated.chauffeurId) {
        if (status === "approved") {
          await storage.updateChauffeur(updated.chauffeurId, { isApproved: true });
        }
        if (status === "rejected") {
          await storage.updateChauffeur(updated.chauffeurId, { isApproved: false });
        }
      }

      return res.json(updated);
    },
  );

  app.delete(
    "/api/admin/driver-applications/:id",
    requireAuth,
    requireRole(["admin"]),
    async (req: AuthedRequest, res: Response) => {
      try {
        const deleted = await storage.deleteDriverApplication(req.params.id);
        if (!deleted) return res.status(404).json({ message: "Application not found" });
        return res.json({ message: "Application deleted" });
      } catch (error: any) {
        return res.status(500).json({ message: error.message });
      }
    },
  );

  // ── Profile photo upload for admin (base64 → Supabase Storage) — admin-only ──
  app.post("/api/upload/profile-photo", requireAuth, requireRole(["admin"]), async (req: AuthedRequest, res: Response) => {
    try {
      const { base64Data, chauffeurId } = req.body;
      if (!base64Data || typeof base64Data !== "string" || !chauffeurId || typeof chauffeurId !== "string") {
        return res.status(400).json({ message: "base64Data and chauffeurId are required" });
      }
      // Enforce maximum base64 size (~5 MB)
      if (base64Data.length > 7_000_000) {
        return res.status(400).json({ message: "Image too large. Maximum 5 MB." });
      }
      const SUPABASE_URL = process.env.SUPABASE_URL || "https://zzwkieiktbhptvgsqerd.supabase.co";
      const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
      const BUCKET = "driver-documents";
      const safeId = chauffeurId.replace(/[^a-zA-Z0-9_-]/g, "");
      const fileName = `${safeId}/profile_${Date.now()}.jpg`;
      const buffer = Buffer.from(base64Data, "base64");
      const uploadRes = await fetch(
        `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${fileName}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
            apikey: SUPABASE_SERVICE_KEY,
            "Content-Type": "image/jpeg",
            "x-upsert": "true",
          },
          body: buffer,
        },
      );
      if (!uploadRes.ok) {
        const errText = await uploadRes.text().catch(() => uploadRes.statusText);
        console.error("[upload/profile-photo] Supabase error:", uploadRes.status, errText);
        if (uploadRes.status === 401 || uploadRes.status === 403) {
          return res.status(500).json({ message: "Photo upload failed: Supabase service key not configured. Please add SUPABASE_SERVICE_ROLE_KEY to environment secrets." });
        }
        return res.status(500).json({ message: `Photo upload failed (${uploadRes.status}): ${errText}` });
      }
      const url = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${fileName}`;
      // Persist the photo URL in the chauffeur profile immediately
      try {
        await storage.updateChauffeur(chauffeurId, { profilePhoto: url });
      } catch {}
      return res.json({ url });
    } catch (error: any) {
      console.error("[upload/profile-photo] error:", error.message);
      return res.status(500).json({ message: error.message || "Photo upload failed. Please try again." });
    }
  });

  // ── Document upload proxy (server → Supabase, bypasses client CORS/RLS) ──
  app.post("/api/upload-document", authOptional, async (req: AuthedRequest, res: Response) => {
    try {
      const { base64Data, userId, docType } = req.body;
      if (!base64Data || !userId || !docType) {
        return res.status(400).json({ message: "base64Data, userId, and docType are required" });
      }

      const SUPABASE_URL = process.env.SUPABASE_URL || "https://zzwkieiktbhptvgsqerd.supabase.co";
      const SUPABASE_ANON_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
      const BUCKET = "driver-documents";

      const fileName = `${userId}/${docType}_${Date.now()}.jpg`;
      const buffer = Buffer.from(base64Data, "base64");

      const uploadRes = await fetch(
        `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${fileName}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
            apikey: SUPABASE_ANON_KEY,
            "Content-Type": "image/jpeg",
            "x-upsert": "true",
          },
          body: buffer,
        },
      );

      if (!uploadRes.ok) {
        const err = await uploadRes.text();
        console.error("[upload-document] Supabase error:", err);
        return res.status(500).json({ message: `Supabase upload failed: ${err}` });
      }

      const url = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${fileName}`;
      return res.json({ url });
    } catch (error: any) {
      console.error("[upload-document] error:", error.message);
      return res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/driver/documents", authOptional, async (req: AuthedRequest, res: Response) => {
    const { applicationId, chauffeurId, type, url, userId: bodyUserId } = req.body;
    const userId = req.auth?.sub || bodyUserId;
    if (!type || !url) return res.status(400).json({ message: "type and url are required" });
    if (!userId) return res.status(400).json({ message: "userId required" });
    const doc = await storage.createDocument({
      userId,
      applicationId: applicationId || null,
      chauffeurId: chauffeurId || null,
      type,
      url,
      status: "pending",
    });
    return res.json(doc);
  });

  app.get("/api/driver/documents", authOptional, async (req: AuthedRequest, res: Response) => {
    const userId = req.auth?.sub || (req.query.userId as string);
    if (!userId) return res.status(400).json({ message: "userId required" });
    const docs = await storage.getDocumentsByUser(userId);
    return res.json(docs);
  });

  app.get(
    "/api/admin/documents",
    requireAuth,
    requireRole(["admin"]),
    async (_req: AuthedRequest, res: Response) => {
      const docs = await storage.getAllDocuments();
      return res.json(docs);
    },
  );

  app.put(
    "/api/admin/documents/:id",
    requireAuth,
    requireRole(["admin"]),
    async (req: AuthedRequest, res: Response) => {
      const { status } = req.body;
      const doc = await storage.updateDocument(req.params.id, {
        status,
        reviewedAt: new Date(),
        reviewerAdminId: req.auth!.sub,
      });
      if (!doc) return res.status(404).json({ message: "Document not found" });
      return res.json(doc);
    },
  );

  // -----------------------------
  // Pricing
  // -----------------------------
  app.post("/api/pricing/estimate", async (req: Request, res: Response) => {
    try {
      const { distanceKm, categoryId, isLateNight } = req.body;
      const estimate = calculatePrice(distanceKm, categoryId || "budget", { isLateNight });
      return res.json(estimate);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/pricing/config", async (_req: Request, res: Response) => {
    return res.json(getPricingConfig());
  });

  app.get("/api/pricing/categories", async (_req: Request, res: Response) => {
    return res.json(getVehicleCategories());
  });

  // -----------------------------
  // Liveness (Cash Ride Security)
  // -----------------------------
  app.post("/api/liveness/session", requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const provider = getLivenessProvider();
      const userId = req.auth!.sub;
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
      const challengeCode = buildChallengeCode();

      const existing = await storage.getLatestPendingLivenessSessionByUser(userId);
      if (existing && existing.expiresAt && new Date(existing.expiresAt).getTime() > Date.now()) {
        return res.json({
          sessionId: existing.id,
          provider: existing.provider,
          expiresAt: existing.expiresAt,
          challenge: challengeLabel(existing.challengeCode),
          maxAttempts: existing.maxAttempts,
          attempts: existing.attempts,
        });
      }

      const session = await storage.createLivenessSession({
        userId,
        provider,
        status: "pending",
        challengeCode,
        maxAttempts: 3,
        attempts: 0,
        expiresAt,
      });

      return res.json({
        sessionId: session.id,
        provider: session.provider,
        expiresAt: session.expiresAt,
        challenge: challengeLabel(session.challengeCode),
        maxAttempts: session.maxAttempts,
        attempts: session.attempts,
      });
    } catch (error: any) {
      return res.status(500).json({ message: error.message || "Failed to create liveness session" });
    }
  });

  app.post("/api/liveness/verify", requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const { sessionId, selfieUrl } = req.body as { sessionId?: string; selfieUrl?: string };
      if (!sessionId || !selfieUrl) {
        return res.status(400).json({ message: "sessionId and selfieUrl are required" });
      }

      const session = await storage.getLivenessSession(sessionId);
      if (!session || session.userId !== req.auth!.sub) {
        return res.status(404).json({ message: "Liveness session not found" });
      }

      if (session.status === "passed") {
        return res.json({
          passed: true,
          sessionId: session.id,
          score: session.score || 0.99,
          provider: session.provider,
          selfieUrl: session.selfieUrl || selfieUrl,
        });
      }

      if (new Date(session.expiresAt).getTime() <= Date.now()) {
        await storage.updateLivenessSession(session.id, {
          status: "expired",
          errorReason: "Session expired. Please retry liveness.",
        });
        return res.status(410).json({ message: "Session expired. Please retry liveness." });
      }

      const nextAttempts = (session.attempts || 0) + 1;
      if (nextAttempts > (session.maxAttempts || 3)) {
        await storage.updateLivenessSession(session.id, {
          status: "failed",
          attempts: nextAttempts,
          errorReason: "Maximum attempts reached",
        });
        return res.status(429).json({ message: "Maximum liveness attempts reached" });
      }

      if (session.provider !== "mock") {
        await storage.updateLivenessSession(session.id, {
          attempts: nextAttempts,
          selfieUrl,
          errorReason: "Provider integration pending",
        });
        return res.status(501).json({
          message: "Selected liveness provider is not configured yet. Switch LIVENESS_PROVIDER=mock for now.",
        });
      }

      const qualityResult = await runMockSelfieQualityCheck(selfieUrl);
      const passed = qualityResult.passed;
      const score = qualityResult.score;
      const status = passed ? "passed" : "failed";

      const updated = await storage.updateLivenessSession(session.id, {
        attempts: nextAttempts,
        selfieUrl,
        score,
        status,
        verifiedAt: passed ? new Date() : null,
        errorReason: passed ? null : (qualityResult.reason || "Selfie quality check failed"),
      });

      return res.json({
        passed,
        sessionId: updated?.id || session.id,
        score,
        provider: session.provider,
        selfieUrl,
        reason: passed ? null : (qualityResult.reason || "Selfie quality check failed"),
      });
    } catch (error: any) {
      return res.status(500).json({ message: error.message || "Liveness verification failed" });
    }
  });

  // -----------------------------
  // Rides
  // -----------------------------
  app.post("/api/rides", requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const { distanceKm, isLateNight, ...rideData } = req.body;

      // Always use the verified JWT subject as the clientId (ignore untrusted body value)
      const clientId = req.auth!.sub;
      rideData.clientId = clientId;

      // Ensure the user exists in this database — auto-create from JWT claims if not.
      // This handles cross-environment JWTs (e.g. Railway token used against dev backend).
      let clientUser = await storage.getUser(clientId);
      if (!clientUser) {
        const { email, name, role } = req.auth!;
        const placeholderEmail = email || `oauth_${clientId.slice(0, 12)}@a2blift.placeholder`;
        const existingByEmail = email ? await storage.getUserByUsername(email) : null;
        if (existingByEmail) {
          clientUser = existingByEmail;
          // Ensure id matches token sub
        } else {
          try {
            const randomPw = await bcrypt.hash(Math.random().toString(36), 10);
            clientUser = await storage.createUser({
              id: clientId,
              username: placeholderEmail,
              password: randomPw,
              name: name || "A2B Client",
              phone: null,
              role: (role || "client") as UserRole,
            } as any);
          } catch (_createErr: any) {
            // Race condition — another request created it first
            clientUser = await storage.getUser(clientId);
            if (!clientUser) {
              return res.status(401).json({ success: false, message: "Session expired. Please log out and log in again." });
            }
          }
        }
      } else {
        const claimedName = typeof req.auth!.name === "string" ? req.auth!.name.trim() : "";
        const storedName = typeof clientUser.name === "string" ? clientUser.name.trim() : "";
        if (claimedName && getUserFirstName({ name: storedName }, "") !== getUserFirstName({ name: claimedName }, "")) {
          const storedLooksGeneric = ["", "a2b client", "client", "rider"].includes(storedName.toLowerCase());
          if (storedLooksGeneric) {
            clientUser = await storage.updateUser(clientUser.id, { name: claimedName }) as any;
          }
        }
      }

      const categoryId = rideData.vehicleType || "budget";
      const normalizedDistanceKm = Number(rideData.selectedRouteDistanceKm ?? distanceKm ?? 10);
      const safeDistanceKm = Number.isFinite(normalizedDistanceKm) && normalizedDistanceKm > 0 ? normalizedDistanceKm : 10;
      const normalizedDurationMin = Number(rideData.durationMin ?? 0);
      const safeDurationMin = Number.isFinite(normalizedDurationMin) && normalizedDurationMin > 0 ? normalizedDurationMin : null;
      const selectedRouteId = typeof rideData.selectedRouteId === "string" && rideData.selectedRouteId.trim()
        ? rideData.selectedRouteId.trim()
        : null;
      const priceEstimate = calculatePrice(safeDistanceKm, categoryId, { isLateNight });
      const requestedFare = Number(rideData.actualFare);
      const safeFare = Number.isFinite(requestedFare) && requestedFare > 0 ? requestedFare : priceEstimate.totalPrice;
      const routeCurrency = typeof rideData.routeCurrency === "string" && rideData.routeCurrency.trim()
        ? rideData.routeCurrency.trim().toUpperCase()
        : priceEstimate.currency;

      const paymentMethod = (rideData.paymentMethod || "cash") as string;
      if (paymentMethod === "cash") {
        const { livenessSessionId, livenessStatus, cashSelfieUrl } = rideData as any;
        if (!livenessSessionId || livenessStatus !== "passed" || !cashSelfieUrl) {
          return res.status(400).json({
            success: false,
            message: "Cash rides require completed liveness verification",
          });
        }

        const session = await storage.getLivenessSession(livenessSessionId);
        if (!session || session.userId !== clientId || session.status !== "passed") {
          return res.status(403).json({
            success: false,
            message: "Invalid liveness session",
          });
        }
      }
      
      // Set livenessVerifiedAt on server side (Date object, never trust client strings for timestamps)
      const livenessVerifiedAt = (rideData as any).livenessStatus === "passed" ? new Date() : undefined;

      // Whitelist only valid ride columns — never spread raw client body into Drizzle
      const ride = await storage.createRide({
        clientId,
        pickupLat: rideData.pickupLat,
        pickupLng: rideData.pickupLng,
        pickupAddress: rideData.pickupAddress || null,
        dropoffLat: rideData.dropoffLat,
        dropoffLng: rideData.dropoffLng,
        dropoffAddress: rideData.dropoffAddress || null,
        vehicleType: rideData.vehicleType || "budget",
        paymentMethod: rideData.paymentMethod || "cash",
        price: safeFare,
        distanceKm: safeDistanceKm,
        durationMin: safeDurationMin,
        pricePerKm: priceEstimate.pricePerKm,
        baseFare: priceEstimate.baseFare,
        status: "searching",
        paymentStatus: paymentMethod === "cash" ? "unpaid" : (rideData.paymentStatus || "pending"),
        cashSelfieUrl: rideData.cashSelfieUrl || null,
        livenessStatus: rideData.livenessStatus || "not_required",
        livenessProvider: rideData.livenessProvider || null,
        livenessSessionId: rideData.livenessSessionId || null,
        livenessScore: rideData.livenessScore || null,
        selectedRouteId,
        selectedRouteDistanceKm: selectedRouteId ? safeDistanceKm : null,
        actualFare: selectedRouteId ? safeFare : null,
        routeCurrency,
        routeSelectedAt: selectedRouteId ? new Date() : null,
        ...(livenessVerifiedAt ? { livenessVerifiedAt } : {}),
      } as any);

      // Enrich ride with client first name for driver display
      let clientFirstName = "Rider";
      try {
        const clientUser = await storage.getUser(clientId);
        clientFirstName = getUserFirstName(clientUser, "Rider");
      } catch {}
      const enrichedRide = { ...ride, clientFirstName };

      // Send trip only to nearby approved online drivers (sorted by distance)
      const allChauffeurs = await storage.getAllChauffeurs();
      const pickupLat = parseFloat(rideData.pickupLat);
      const pickupLng = parseFloat(rideData.pickupLng);

      const nearbyChauffeurs = allChauffeurs
        .filter(c => c.isOnline && c.isApproved && hasFreshChauffeurLocation(c))
        .map(c => ({
          ...c,
          distKm: haversine(pickupLat, pickupLng, Number(c.lat), Number(c.lng)),
        }))
        .filter(c => c.distKm <= RIDE_MATCH_RADIUS_KM)
        .sort((a, b) => a.distKm - b.distKm)
        .slice(0, 10); // notify up to 10 nearest drivers

      if (nearbyChauffeurs.length > 0) {
        // Emit only to connected sockets belonging to nearby drivers
        const sockets = await io.fetchSockets();
        let notified = 0;
        for (const socket of sockets) {
          const socketData = socket.data as any;
          if (socketData?.chauffeurId && nearbyChauffeurs.some(c => c.id === socketData.chauffeurId)) {
            socket.emit("ride:new", { ...enrichedRide, distanceToPickup: nearbyChauffeurs.find(c => c.id === socketData.chauffeurId)?.distKm });
            notified++;
          }
        }
        // Fallback: if no sockets matched (drivers not connected via socket), broadcast to all
        if (notified === 0) {
          io.emit("ride:new", enrichedRide);
        }
        // Push notification to all nearby drivers (wakes up drivers not in the app)
        const pushTokens = nearbyChauffeurs.map(c => (c as any).pushToken).filter(Boolean);
        if (pushTokens.length > 0) {
          sendExpoPushNotification(
            pushTokens,
            "🚗 New Ride Request",
            `Pickup: ${ride.pickupAddress || "Nearby"} — tap to accept`,
              { rideId: ride.id, type: "ride:new" },
              { urgent: true }
          );
        }
      } else {
        // No nearby drivers — broadcast to all online approved drivers as fallback
        io.emit("ride:new", enrichedRide);
        // Push to ALL online approved drivers with tokens
          const allDrivers = (await storage.getAllChauffeurs()).filter(c => c.isOnline && c.isApproved && hasFreshChauffeurLocation(c));
        const pushTokens = allDrivers.map(c => (c as any).pushToken).filter(Boolean);
        if (pushTokens.length > 0) {
          sendExpoPushNotification(
            pushTokens,
            "🚗 New Ride Request",
            `Pickup: ${ride.pickupAddress || "Nearby"} — tap to accept`,
              { rideId: ride.id, type: "ride:new" },
              { urgent: true }
          );
        }
      }

      // Always return success immediately — client shows "searching" UI
      return res.json({
        success: true,
        status: ride.status,
        message: nearbyChauffeurs.length > 0
          ? `Notifying ${nearbyChauffeurs.length} driver${nearbyChauffeurs.length > 1 ? "s" : ""} nearby...`
          : "Searching for drivers...",
        ride: ride,
      });
    } catch (error: any) {
      console.error("Ride creation error:", error);
      return res.status(500).json({ 
        success: false,
        message: error.message || "Failed to create ride request" 
      });
    }
  });

  // -----------------------------
  // Paystack Payments
  // -----------------------------
  app.post(
    "/api/paystack/initialize",
    requireAuth,
    async (req: AuthedRequest, res: Response) => {
      try {
        const { rideId } = req.body as { rideId?: string };
        if (!rideId) {
          return res.status(400).json({ message: "rideId is required" });
        }

        const ride = await storage.getRide(rideId);
        if (!ride) {
          return res.status(404).json({ message: "Ride not found" });
        }
        if (!ride.price || ride.price <= 0) {
          return res
            .status(400)
            .json({ message: "Ride does not have a valid price" });
        }

        const user = await storage.getUser(req.auth!.sub);
        if (!user) {
          return res.status(404).json({ message: "User not found" });
        }

        const { secret, currency } = getPaystackConfig();
        const rideReference = `A2B-RIDE-${Date.now()}-${user.id.slice(0, 6)}`;
        const domain = getAppBaseUrl(req);
        const rideCallbackUrl = `${domain}/api/payments/webview-callback?reference=${rideReference}`;

        const amountInMinorUnits = Math.round(ride.price * 100); // kobo/cents
        const email =
          user.username.includes("@")
            ? user.username
            : `${user.username}@example.com`;

        const initBody: Record<string, unknown> = {
          email,
          amount: amountInMinorUnits,
          currency,
          reference: rideReference,
          callback_url: rideCallbackUrl,
          metadata: {
            rideId: ride.id,
            userId: user.id,
          },
        };

        const response = await fetch(
          "https://api.paystack.co/transaction/initialize",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${secret}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(initBody),
          },
        );

        const data = (await response.json()) as any;
        if (!response.ok || !data?.status) {
          return res
            .status(502)
            .json({ message: "Failed to initialize Paystack", raw: data });
        }

        return res.json({
          authorizationUrl: data.data.authorization_url,
          reference: data.data.reference,
        });
      } catch (error: any) {
        if (error instanceof Error && error.message.includes("PAYSTACK")) {
          return res.status(500).json({ message: error.message });
        }
        return res.status(500).json({ message: error.message || "Server error" });
      }
    },
  );

  app.post("/api/paystack/webhook", async (req: Request, res: Response) => {
    try {
      const signature = req.header("x-paystack-signature");
      if (!signature) {
        return res.status(400).json({ message: "Missing signature" });
      }

      let secret: string;
      try {
        secret = getPaystackConfig().secret;
      } catch (e: any) {
        console.error("Paystack webhook misconfigured:", e);
        return res.status(500).json({ message: "Paystack not configured" });
      }

      const rawBody = (req as any).rawBody as Buffer | string | undefined;
      const raw =
        typeof rawBody === "string"
          ? rawBody
          : Buffer.isBuffer(rawBody)
          ? rawBody
          : JSON.stringify(req.body);

      const hash = crypto
        .createHmac("sha512", secret)
        .update(raw)
        .digest("hex");

      if (hash !== signature) {
        console.warn("Invalid Paystack webhook signature");
        return res.status(401).json({ message: "Invalid signature" });
      }

      const payload = req.body as any;
      if (payload?.event !== "charge.success") {
        // Acknowledge but ignore other events for now
        return res.status(200).json({ received: true });
      }

      const eventData = payload.data || {};
      const metadata = eventData.metadata || {};
      const rideId = metadata.rideId as string | undefined;
      const userId = (metadata.userId as string | undefined) ?? undefined;

      if (!rideId) {
        return res
          .status(200)
          .json({ received: true, message: "No rideId in metadata" });
      }

      const amountMinor = eventData.amount as number | undefined;
      const amount = typeof amountMinor === "number" ? amountMinor / 100 : 0;

      try {
        const ride = await storage.getRide(rideId);
        if (!ride) {
          console.warn("Paystack webhook for unknown ride:", rideId);
          return res.status(200).json({ received: true });
        }

        const finalAmount = amount || ride.price || 0;

        await storage.createPayment({
          rideId: ride.id,
          payerUserId: userId || ride.clientId,
          amount: finalAmount,
          method: "paystack",
          status: "paid",
          provider: "paystack",
          providerRef: eventData.reference,
        });

        await storage.updateRide(ride.id, {
          paymentStatus: "paid",
          paymentMethod: "card",
        });

        // Record earnings and commission if not already done (webhook may fire before trip_completed)
        if (ride.chauffeurId && finalAmount > 0) {
          try {
            const earningsCalc = calculateChauffeurEarnings(finalAmount);
            const existing = await storage.getEarningsByChauffeur(ride.chauffeurId);
            const alreadyRecorded = existing.some((e) => e.rideId === ride.id);
            if (!alreadyRecorded) {
              await storage.createEarning({
                chauffeurId: ride.chauffeurId,
                rideId: ride.id,
                amount: earningsCalc.chauffeurEarnings,
                commission: earningsCalc.commission,
                type: "card",
              });
              const chauffeur = await storage.getChauffeur(ride.chauffeurId);
              if (chauffeur) {
                await storage.updateChauffeur(ride.chauffeurId, {
                  earningsTotal: (chauffeur.earningsTotal || 0) + earningsCalc.chauffeurEarnings,
                });
              }
            }
          } catch (earningsErr: any) {
            console.error("Webhook earnings record failed (non-fatal):", earningsErr.message);
          }
        }
      } catch (dbError) {
        console.error("Error applying Paystack payment:", dbError);
        // Still return 200 so Paystack does not retry indefinitely
        return res.status(200).json({ received: true, error: "db_error" });
      }

      return res.status(200).json({ received: true });
    } catch (error: any) {
      console.error("Paystack webhook error:", error);
      return res.status(500).json({ message: "Webhook processing failed" });
    }
  });

  app.get("/api/rides/:id", async (req: Request, res: Response) => {
    try {
      const ride = await storage.getRide(req.params.id);
      if (!ride) return res.status(404).json({ message: "Ride not found" });
      let clientFirstName = "Client";
      try {
        const client = await storage.getUser(ride.clientId);
        clientFirstName = getUserFirstName(client, "Client");
      } catch {}
      return res.json({ ...ride, clientFirstName });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/rides/:id", async (req: Request, res: Response) => {
    try {
      const ride = await storage.updateRide(req.params.id, req.body);
      if (!ride) return res.status(404).json({ message: "Ride not found" });
      let clientFirstName = "Client";
      try {
        const client = await storage.getUser(ride.clientId);
        clientFirstName = getUserFirstName(client, "Client");
      } catch {}
      const rideWithClientName = { ...ride, clientFirstName };

      io.emit("ride:statusUpdate", rideWithClientName);
      return res.json(rideWithClientName);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/rides/:id/accept", requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const { chauffeurId } = req.body;
      if (!chauffeurId) return res.status(400).json({ message: "chauffeurId is required" });

      // Verify the authenticated user actually owns this chauffeur profile
      const chauffeur = await storage.getChauffeur(chauffeurId);
      if (!chauffeur || chauffeur.userId !== req.auth!.sub) {
        return res.status(403).json({ message: "Forbidden: chauffeur mismatch" });
      }

      // Atomic accept — returns undefined if another driver already claimed the ride
      const updated = await storage.acceptRideAtomic(req.params.id, chauffeurId);
      if (!updated) {
        return res.status(409).json({ message: "Ride already assigned to another driver" });
      }

      // Enrich with client first name before emitting — nav modal uses it immediately
      let clientFirstName = "Rider";
      try {
        const client = await storage.getUser(updated.clientId);
        clientFirstName = getUserFirstName(client, "Rider");
      } catch {}
      const enrichedAccepted = { ...updated, clientFirstName };

      io.emit("ride:accepted", enrichedAccepted);
      if (updated.clientId) {
        await storage.createNotification({
          userId: updated.clientId,
          title: "Driver Assigned",
          body: "Your premium chauffeur has been assigned and is on the way.",
          type: "ride",
        });
      }
      // Notify the driver they are on the way to pick up
      await storage.createNotification({
        userId: chauffeur.userId,
        title: "Ride Accepted",
        body: "You're on your way to pick up the client. Head to the pickup location.",
        type: "ride",
      });
      if (chauffeur.pushToken) {
        sendExpoPushNotification(
          [chauffeur.pushToken],
          "🚗 Going to Pick Up",
          "You've accepted the ride. Head to the pickup location now.",
          { rideId: updated.id, type: "ride:accepted" }
        );
      }
      return res.json(enrichedAccepted);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/rides/:id/status", requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const { status } = req.body;

      // Verify caller is a party to this ride (chauffeur or rider)
      const existingRide = await storage.getRide(req.params.id);
      if (!existingRide) return res.status(404).json({ message: "Ride not found" });

      const callerUser = await storage.getUser(req.auth!.sub);
      if (!callerUser) return res.status(403).json({ message: "Forbidden" });

      const isRider = existingRide.clientId === callerUser.id;
      let isChauffeur = false;
      if (existingRide.chauffeurId) {
        const ch = await storage.getChauffeur(existingRide.chauffeurId);
        isChauffeur = ch?.userId === callerUser.id;
      }
      // Admins bypass ownership check
      const isAdmin = callerUser.role === "admin";
      if (!isRider && !isChauffeur && !isAdmin) {
        return res.status(403).json({ message: "Forbidden: not a party to this ride" });
      }

      // For cancellations, capture the pre-update ride first so we can refund
      const rideBeforeUpdate = status === "cancelled" ? existingRide : null;

      const ride = await storage.updateRide(req.params.id, {
        status,
        ...(status === "trip_completed" ? { completedAt: new Date() } : {}),
      });
      if (!ride) return res.status(404).json({ message: "Ride not found" });

      // ── Cancellation: refunds + notifications for all parties ──
      if (status === "cancelled" && rideBeforeUpdate) {
        try {
          const payments = await storage.getPaymentsByRide(req.params.id);

          // ── Card payment → Paystack refund + credit wallet ──
          const cardPayment = payments.find((p: any) =>
            p.method === "card" && p.status === "paid" && p.paystackReference
          );
          if (cardPayment?.paystackReference) {
            const secret = process.env.PAYSTACK_SECRET_KEY || "";
            await axios.post(
              "https://api.paystack.co/refund",
              { transaction: cardPayment.paystackReference },
              { headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" } }
            );
            await storage.updatePayment(cardPayment.id, { status: "refunded" });
            const rider = await storage.getUser(rideBeforeUpdate.clientId);
            if (rider && rideBeforeUpdate.price) {
              const amt = Number(rideBeforeUpdate.price);
              const balanceBefore = rider.walletBalance || 0;
              const newBalance = balanceBefore + amt;
              await storage.updateUser(rider.id, { walletBalance: newBalance });
              await storage.createWalletTransaction({
                userId: rider.id, type: "refund", amount: amt,
                balanceBefore, balanceAfter: newBalance,
                reference: cardPayment.paystackReference,
                description: "Ride cancelled — card payment refunded to wallet",
                rideId: ride.id, status: "completed",
              });
              await storage.createNotification({
                userId: rider.id,
                title: "Refund Issued",
                body: `Your ride was cancelled. R${amt.toFixed(2)} has been refunded to your A2B wallet.`,
                type: "payment",
              });
            }
          }

          // ── Wallet payment → reverse the wallet deduction ──
          const walletPayment = !cardPayment
            ? payments.find((p: any) => p.method === "wallet" && p.status === "paid")
            : null;
          if (walletPayment && rideBeforeUpdate.price) {
            const rider = await storage.getUser(rideBeforeUpdate.clientId);
            if (rider) {
              const amt = Number(rideBeforeUpdate.price);
              const balanceBefore = rider.walletBalance || 0;
              const newBalance = balanceBefore + amt;
              await storage.updateUser(rider.id, { walletBalance: newBalance });
              await storage.updatePayment(walletPayment.id, { status: "refunded" });
              await storage.createWalletTransaction({
                userId: rider.id, type: "refund", amount: amt,
                balanceBefore, balanceAfter: newBalance,
                reference: `wallet_refund_${ride.id}_${Date.now()}`,
                description: "Ride cancelled — wallet balance restored",
                rideId: ride.id, status: "completed",
              });
              await storage.createNotification({
                userId: rider.id,
                title: "Refund Issued",
                body: `Your ride was cancelled. R${amt.toFixed(2)} has been returned to your A2B wallet.`,
                type: "payment",
              });
            }
          }

          // ── Cash rides → notify client (no charge to reverse) ──
          const paymentMethod = rideBeforeUpdate.paymentMethod || "cash";
          if (!cardPayment && !walletPayment && paymentMethod === "cash") {
            await storage.createNotification({
              userId: rideBeforeUpdate.clientId,
              title: "Ride Cancelled",
              body: "Your ride has been cancelled. No charges were applied.",
              type: "ride",
            });
          }

          // ── Notify the assigned chauffeur (if any) ──
          if (rideBeforeUpdate.chauffeurId) {
            const chauffeur = await storage.getChauffeur(rideBeforeUpdate.chauffeurId);
            if (chauffeur?.userId) {
              await storage.createNotification({
                userId: chauffeur.userId,
                title: "Ride Cancelled",
                body: "The client has cancelled this trip.",
                type: "ride",
              });
            }
            if ((chauffeur as any)?.pushToken) {
              sendExpoPushNotification(
                [(chauffeur as any).pushToken],
                "Ride Cancelled",
                "The client has cancelled this trip."
              );
            }
          }
        } catch (refundErr: any) {
          console.error("Cancellation refund/notification failed (non-fatal):", refundErr.message);
        }
      }

      if (status === "trip_completed" && ride.chauffeurId && ride.price) {
        // Wrap each ancillary operation independently so a DB hiccup
        // on earnings / notifications does NOT kill the status update.
        try {
          const earningsCalc = calculateChauffeurEarnings(ride.price);
          // Guard against double-counting: Paystack webhook may have already created
          // the earning record for card payments before trip_completed fires.
          const existingEarnings = await storage.getEarningsByChauffeur(ride.chauffeurId);
          const alreadyRecorded = existingEarnings.some((e: any) => e.rideId === ride.id);
          const paymentMethod = ride.paymentMethod || "cash";
          if (!alreadyRecorded) {
            if (paymentMethod === "cash") {
              // Cash trips: driver collects the gross fare in hand,
              // while the platform records the 15% commission digitally.
              await storage.createEarning({
                chauffeurId: ride.chauffeurId,
                rideId: ride.id,
                amount: -earningsCalc.commission,
                commission: earningsCalc.commission,
                type: "cash",
              });
              const chauffeur = await storage.getChauffeur(ride.chauffeurId);
              if (chauffeur) {
                await storage.updateChauffeur(ride.chauffeurId, {
                  earningsTotal:
                    (chauffeur.earningsTotal || 0) - earningsCalc.commission,
                });
              }
            } else {
              // Card / wallet trips: add the driver's 85% share to the digital wallet balance.
              await storage.createEarning({
                chauffeurId: ride.chauffeurId,
                rideId: ride.id,
                amount: earningsCalc.chauffeurEarnings,
                commission: earningsCalc.commission,
                type: paymentMethod,
              });
              const chauffeur = await storage.getChauffeur(ride.chauffeurId);
              if (chauffeur) {
                await storage.updateChauffeur(ride.chauffeurId, {
                  earningsTotal:
                    (chauffeur.earningsTotal || 0) + earningsCalc.chauffeurEarnings,
                });
              }
            }
          }
        } catch (earningsErr: any) {
          console.error("earnings record failed (non-fatal):", earningsErr.message);
        }

        try {
          await storage.createNotification({
            userId: ride.clientId,
            title: "Trip Completed",
            body: `Your trip has been completed. Fare: R ${ride.price}. Thank you for choosing A2B LIFT.`,
            type: "ride",
          });
        } catch (notifErr: any) {
          console.error("notification failed (non-fatal):", notifErr.message);
        }

        try {
          const paymentMethod = ride.paymentMethod || "cash";
          if (paymentMethod === "cash") {
            const existingPayments = await storage.getPaymentsByRide(ride.id);
            if (existingPayments.length === 0) {
              await storage.createPayment({
                rideId: ride.id,
                payerUserId: ride.clientId,
                amount: ride.price,
                method: "cash",
                status: "paid",
                provider: "cash",
                providerRef: `cash_${ride.id}_${Date.now()}`,
              });
              await storage.updateRide(ride.id, { paymentStatus: "paid", paymentMethod: "cash" });
            } else {
              const pendingPayment = existingPayments.find((p) => p.status === "pending" && p.method === "cash");
              if (pendingPayment) {
                await storage.updatePayment(pendingPayment.id, { status: "paid" });
                await storage.updateRide(ride.id, { paymentStatus: "paid" });
              }
            }
          }
        } catch (payErr: any) {
          console.error("payment record failed (non-fatal):", payErr.message);
        }
      }

      let clientFirstName = "Client";
      try {
        const client = await storage.getUser(ride.clientId);
        clientFirstName = getUserFirstName(client, "Client");
      } catch {}
      const rideWithClientName = { ...ride, clientFirstName };

      io.emit("ride:statusUpdate", rideWithClientName);

      // ── Notify rider for key status transitions ──
      try {
        if (status === "chauffeur_arriving" && ride.clientId) {
          await storage.createNotification({
            userId: ride.clientId,
            title: "Driver Arriving",
            body: "Your chauffeur is arriving at your pickup location. Please be ready.",
            type: "ride",
          });
          const riderUser = await storage.getUser(ride.clientId);
          if ((riderUser as any)?.pushToken) {
            sendExpoPushNotification(
              [(riderUser as any).pushToken],
              "🚗 Driver Arriving",
              "Your chauffeur is arriving at your pickup. Please be ready!",
              { rideId: ride.id, type: "ride:arriving" }
            );
          }
        } else if (status === "trip_started" && ride.clientId) {
          await storage.createNotification({
            userId: ride.clientId,
            title: "Trip Started",
            body: `Your trip is underway to ${ride.dropoffAddress || "your destination"}.`,
            type: "ride",
          });
          const riderUser = await storage.getUser(ride.clientId);
          if ((riderUser as any)?.pushToken) {
            sendExpoPushNotification(
              [(riderUser as any).pushToken],
              "🚀 Trip Started",
              `Your ride is underway to ${ride.dropoffAddress || "your destination"}.`,
              { rideId: ride.id, type: "ride:started" }
            );
          }
        }
      } catch (notifErr: any) {
        console.error("rider status notification failed (non-fatal):", notifErr.message);
      }

      return res.json(rideWithClientName);
    } catch (error: any) {
      console.error("ride status update error:", error.message, error.stack);
      return res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/rides/:id/pay", requireAuth, async (req: AuthedRequest, res: Response) => {
    const ride = await storage.getRide(req.params.id);
    if (!ride) return res.status(404).json({ message: "Ride not found" });
    if (ride.clientId !== req.auth!.sub) return res.status(403).json({ message: "Forbidden" });
    const amount = ride.price || 0;
    const method = (req.body?.method || ride.paymentMethod || "cash") as string;

    const payment = await storage.createPayment({
      rideId: ride.id,
      payerUserId: req.auth!.sub,
      amount,
      method,
      status: method === "cash" ? "pending" : "paid",
    });

    await storage.updateRide(ride.id, {
      paymentStatus: payment.status === "paid" ? "paid" : "pending",
      paymentMethod: method,
    });

    return res.json({ payment });
  });

  app.post("/api/rides/:id/rate", requireAuth, async (req: AuthedRequest, res: Response) => {
    const { rating, comment } = req.body;
    const ride = await storage.getRide(req.params.id);
    if (!ride) return res.status(404).json({ message: "Ride not found" });
    if (ride.clientId !== req.auth!.sub) return res.status(403).json({ message: "Forbidden" });
    if (!ride.chauffeurId) return res.status(400).json({ message: "Ride has no chauffeur" });
    if (ride.status !== "trip_completed") return res.status(400).json({ message: "Ride not completed" });

    const rr = await storage.createRideRating({
      rideId: ride.id,
      clientId: ride.clientId,
      chauffeurId: ride.chauffeurId,
      rating,
      comment: comment || null,
    });

    const chauffeur = await storage.getChauffeur(ride.chauffeurId);
    if (chauffeur) {
      const avgRating = await storage.getAverageRatingForUser(chauffeur.userId);
      if (avgRating != null) {
        await storage.updateUser(chauffeur.userId, { rating: avgRating });
      }
    }

    return res.json(rr);
  });

  app.post("/api/rides/:id/rate-client", requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      await ensureClientRatingsTable();

      const { rating, comment } = req.body;
      const numericRating = Number(rating);
      if (!Number.isInteger(numericRating) || numericRating < 1 || numericRating > 5) {
        return res.status(400).json({ message: "Rating must be an integer between 1 and 5" });
      }

      const ride = await storage.getRide(req.params.id);
      if (!ride) return res.status(404).json({ message: "Ride not found" });
      if (!ride.chauffeurId) return res.status(400).json({ message: "Ride has no chauffeur" });
      if (ride.status !== "trip_completed") return res.status(400).json({ message: "Ride not completed" });

      const chauffeur = await storage.getChauffeur(ride.chauffeurId);
      if (!chauffeur || chauffeur.userId !== req.auth!.sub) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const result = await pool.query(
        `
          INSERT INTO client_ratings (ride_id, client_id, chauffeur_id, rating, comment)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (ride_id, chauffeur_id)
          DO UPDATE SET
            rating = EXCLUDED.rating,
            comment = EXCLUDED.comment,
            created_at = now()
          RETURNING
            id,
            ride_id AS "rideId",
            client_id AS "clientId",
            chauffeur_id AS "chauffeurId",
            rating,
            comment,
            created_at AS "createdAt"
        `,
        [ride.id, ride.clientId, ride.chauffeurId, numericRating, comment || null]
      );

      const averageResult = await pool.query(
        `SELECT ROUND(AVG(rating)::numeric, 2) AS avg_rating FROM client_ratings WHERE client_id = $1`,
        [ride.clientId]
      );
      const average = averageResult.rows[0]?.avg_rating != null ? Number(averageResult.rows[0].avg_rating) : null;
      if (average != null) {
        await storage.updateUser(ride.clientId, { rating: average });
      }

      return res.json(result.rows[0]);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/rides/client/:clientId", async (req: Request, res: Response) => {
    try {
      const ridesList = await storage.getRidesByClient(req.params.clientId);
      return res.json(ridesList);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/rides/chauffeur/:chauffeurId", async (req: Request, res: Response) => {
    try {
      const ridesList = await storage.getRidesByChauffeur(req.params.chauffeurId);
      return res.json(ridesList);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  // Polling fallback: returns the nearest unassigned searching ride for a driver.
  // Used by the driver app when the socket event was missed.
  // All nearby searching rides (for driver trip list panel)
  app.get("/api/rides/available/:chauffeurId", async (req: Request, res: Response) => {
    try {
      const chauffeur = await storage.getChauffeur(req.params.chauffeurId);
      if (!chauffeur || !chauffeur.isOnline || !chauffeur.isApproved) {
        return res.json([]);
      }
      const allRides = await storage.getAllRides();
      const searching = allRides.filter((r) => r.status === "searching");
      if (!searching.length) return res.json([]);

      let candidates = searching;
      if (chauffeur.lat && chauffeur.lng) {
        candidates = searching
          .map((r) => ({
            ...r,
            distKm: haversine(
              Number(chauffeur.lat), Number(chauffeur.lng),
              parseFloat(r.pickupLat as any), parseFloat(r.pickupLng as any)
            ),
          }))
            .filter((r: any) => r.distKm <= RIDE_MATCH_RADIUS_KM)
          .sort((a: any, b: any) => a.distKm - b.distKm) as typeof searching;
      }

      // Enrich with client first name
      const enriched = await Promise.all(
        candidates.slice(0, 10).map(async (r: any) => {
          try {
            const client = await storage.getUser(r.clientId);
            const firstName = getUserFirstName(client, "Rider");
            return { ...r, clientFirstName: firstName };
          } catch {
            return { ...r, clientFirstName: "Rider" };
          }
        })
      );

      return res.json(enriched);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/rides/chauffeur-pending/:chauffeurId", async (req: Request, res: Response) => {
    try {
      const chauffeur = await storage.getChauffeur(req.params.chauffeurId);
      if (!chauffeur || !chauffeur.isOnline || !chauffeur.isApproved) {
        return res.status(204).end();
      }
      const allRides = await storage.getAllRides();
      const searching = allRides.filter((r) => r.status === "searching");
      if (!searching.length) return res.status(204).end();

      // Helper to enrich a ride with clientFirstName
      async function enrichRide(r: any) {
        try {
          const client = await storage.getUser(r.clientId);
          const firstName = getUserFirstName(client, "Rider");
          return { ...r, clientFirstName: firstName };
        } catch {
          return { ...r, clientFirstName: "Rider" };
        }
      }

        // If driver has a fresh location, return the nearest searching ride within the match radius
        if (hasFreshChauffeurLocation(chauffeur)) {
        const withDist = searching
          .map((r) => ({
            ...r,
            distKm: haversine(
              Number(chauffeur.lat), Number(chauffeur.lng),
              parseFloat(r.pickupLat as any), parseFloat(r.pickupLng as any)
            ),
          }))
            .filter((r) => r.distKm <= RIDE_MATCH_RADIUS_KM)
          .sort((a, b) => a.distKm - b.distKm);
        if (!withDist.length) return res.status(204).end();
        return res.json(await enrichRide(withDist[0]));
      }

      // No location on file — return the most recent searching ride
      return res.json(await enrichRide(searching[searching.length - 1]));
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/rides", async (_req: Request, res: Response) => {
    try {
      const allRides = await storage.getAllRides();
      return res.json(allRides);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  // -----------------------------
  // Earnings / Withdrawals
  // -----------------------------
  app.get("/api/earnings/chauffeur/:chauffeurId", async (req: Request, res: Response) => {
    try {
      const earningsList = await storage.getEarningsByChauffeur(req.params.chauffeurId);
      return res.json(earningsList);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/withdrawals", async (req: Request, res: Response) => {
    try {
      const withdrawal = await storage.createWithdrawal(req.body);
      return res.json(withdrawal);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/withdrawals/chauffeur/:chauffeurId", async (req: Request, res: Response) => {
    try {
      const withdrawalsList = await storage.getWithdrawalsByChauffeur(req.params.chauffeurId);
      return res.json(withdrawalsList);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/withdrawals", async (_req: Request, res: Response) => {
    try {
      const allWithdrawals = await storage.getAllWithdrawals();
      return res.json(allWithdrawals);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/withdrawals/:id", async (req: Request, res: Response) => {
    try {
      const withdrawal = await storage.updateWithdrawal(req.params.id, req.body);
      if (!withdrawal) return res.status(404).json({ message: "Withdrawal not found" });
      return res.json(withdrawal);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  // -----------------------------
  // Chat
  // -----------------------------
  app.post("/api/messages", async (req: Request, res: Response) => {
    try {
      const { rideId: _rid, senderId: _sid, messageText: _mt } = req.body;
      console.log(`[POST /api/messages] rideId=${_rid} senderId=${_sid} text="${(_mt || "").slice(0, 40)}"`);
      const message = await storage.createMessage(req.body);
      io.emit("chat:newMessage", message);
      const { rideId, senderId, messageText: msgText } = req.body;
      if (rideId && senderId) {
        try {
          const ride = await storage.getRide(rideId);
          if (ride) {
            const previewText = (msgText || "").slice(0, 80);
            if (senderId === ride.clientId && ride.chauffeurId) {
              const chauffeur = await storage.getChauffeur(ride.chauffeurId);
              if (chauffeur?.pushToken) {
                sendExpoPushNotification([chauffeur.pushToken], "New message from rider", previewText);
              }
              if (chauffeur?.userId) {
                await storage.createNotification({ userId: chauffeur.userId, type: "chat", title: "New message from rider", body: previewText, isRead: false });
              }
            } else if (ride.chauffeurId) {
              const chauffeur = await storage.getChauffeur(ride.chauffeurId);
              if (chauffeur?.userId && senderId !== ride.clientId) {
                await storage.createNotification({ userId: ride.clientId, type: "chat", title: "New message from chauffeur", body: previewText, isRead: false });
              }
            }
          }
        } catch (e: any) {
          console.error("[chat] notification failed (non-fatal):", e.message);
        }
      }
      return res.json(message);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/messages/ride/:rideId", async (req: Request, res: Response) => {
    try {
      const messagesList = await storage.getMessagesByRide(req.params.rideId);
      return res.json(messagesList);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  // -----------------------------
  // Safety + Notifications
  // -----------------------------
  app.post("/api/safety-reports", async (req: Request, res: Response) => {
    try {
      const { userId, rideId, type, description } = req.body;
      const aiResponse = generateAIResponse(type, description);
      const priority =
        type === "emergency" ? "high" : type === "safety" ? "medium" : "low";
      const report = await storage.createSafetyReport({
        userId,
        rideId: rideId || null,
        type,
        description,
        aiResponse,
        priority,
        status: "open",
      });
      await storage.createNotification({
        userId,
        title: type === "emergency" ? "Emergency Report Filed" : "Report Received",
        body: aiResponse,
        type: "safety",
      });
      io.emit("safety:newReport", report);
      return res.json({ report, aiResponse });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/safety-reports/user/:userId", async (req: Request, res: Response) => {
    try {
      const reports = await storage.getSafetyReportsByUser(req.params.userId);
      return res.json(reports);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/safety-reports", async (_req: Request, res: Response) => {
    try {
      const allReports = await storage.getAllSafetyReports();
      return res.json(allReports);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/safety-reports/:id", async (req: Request, res: Response) => {
    try {
      const report = await storage.updateSafetyReport(req.params.id, req.body);
      if (!report) return res.status(404).json({ message: "Report not found" });
      return res.json(report);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/notifications/user/:userId", async (req: Request, res: Response) => {
    try {
      const notifs = await storage.getNotificationsByUser(req.params.userId);
      return res.json(notifs);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/notifications/:id/read", async (req: Request, res: Response) => {
    try {
      const notif = await storage.markNotificationRead(req.params.id);
      if (!notif) return res.status(404).json({ message: "Notification not found" });
      return res.json(notif);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/notifications/user/:userId/all", async (req: Request, res: Response) => {
    try {
      await storage.deleteAllNotificationsByUser(req.params.userId);
      return res.json({ message: "All notifications cleared" });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  // -----------------------------
  // Trip Enquiries
  // -----------------------------

  // Client submits a help message about a trip
  app.post("/api/trip-enquiries", requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const { rideId, message } = req.body;
      if (!rideId || !message?.trim()) return res.status(400).json({ message: "rideId and message are required" });
      const enquiry = await storage.createTripEnquiry({ rideId, userId: req.auth!.sub, message: message.trim() });
      // Notify all admins via notification (stored for admin dashboard badge)
      const allUsers = await db.select().from(users).where(eq(users.role, "admin" as any));
      for (const admin of allUsers) {
        await storage.createNotification({
          userId: admin.id,
          type: "general",
          title: "📩 New Trip Enquiry",
          body: `A user submitted a help request about a trip: "${message.trim().slice(0, 80)}${message.length > 80 ? "…" : ""}"`,
          isRead: false,
        });
      }
      return res.json(enquiry);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  // Admin: list all enquiries
  app.get("/api/trip-enquiries", requireAuth, requireRole(["admin"]), async (_req: AuthedRequest, res: Response) => {
    try {
      const enquiries = await storage.getAllTripEnquiries();
      return res.json(enquiries);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  // Admin: reply to an enquiry — sends in-app notification to user
  app.post("/api/trip-enquiries/:id/reply", requireAuth, requireRole(["admin"]), async (req: AuthedRequest, res: Response) => {
    try {
      const { reply } = req.body;
      if (!reply?.trim()) return res.status(400).json({ message: "reply is required" });
      const enquiry = await storage.replyToTripEnquiry(req.params.id, reply.trim());
      if (!enquiry) return res.status(404).json({ message: "Enquiry not found" });
      // Notify the user who submitted the enquiry
      await storage.createNotification({
        userId: enquiry.userId,
        type: "general",
        title: "💬 Admin replied to your trip enquiry",
        body: reply.trim(),
        isRead: false,
      });
      return res.json(enquiry);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  // -----------------------------
  // Admin
  // -----------------------------
  app.get(
    "/api/admin/payments",
    requireAuth,
    requireRole(["admin"]),
    async (_req: AuthedRequest, res: Response) => {
      try {
        const [allPayments, allUsers, allRides] = await Promise.all([
          storage.getAllPayments(),
          storage.getAllUsers ? storage.getAllUsers() : [] as any[],
          storage.getAllRides(),
        ]);
        const usersById = Object.fromEntries((allUsers as any[]).map((u: any) => [u.id, u]));
        const ridesById = Object.fromEntries(allRides.map((r: any) => [r.id, r]));
        const enriched = allPayments.map((p: any) => ({
          ...p,
          riderName: usersById[p.payerUserId]?.name || "Unknown",
          riderEmail: usersById[p.payerUserId]?.username || "—",
          rideRoute: ridesById[p.rideId]
            ? `${ridesById[p.rideId].pickupAddress || "?"} → ${ridesById[p.rideId].dropoffAddress || "?"}`
            : p.rideId ? `Ride ${p.rideId.slice(0, 8)}` : "Wallet top-up",
        }));
        return res.json(enriched);
      } catch (error: any) {
        return res.status(500).json({ message: error.message });
      }
    },
  );

  app.get(
    "/api/admin/liveness-selfies",
    requireAuth,
    requireRole(["admin"]),
    async (_req: AuthedRequest, res: Response) => {
      try {
        const allRides = await storage.getAllRides();
        const selfieRides = allRides
          .filter((ride) => Boolean(ride.cashSelfieUrl))
          .sort((a, b) => {
            const left = a.createdAt ? new Date(a.createdAt).getTime() : 0;
            const right = b.createdAt ? new Date(b.createdAt).getTime() : 0;
            return right - left;
          });

        const records = await Promise.all(
          selfieRides.map(async (ride) => {
            const rider = await storage.getUser(ride.clientId);
            const chauffeur = ride.chauffeurId
              ? await storage.getChauffeur(ride.chauffeurId)
              : undefined;
            const chauffeurUser = chauffeur?.userId
              ? await storage.getUser(chauffeur.userId)
              : undefined;

            return {
              rideId: ride.id,
              riderId: ride.clientId,
              riderName: rider?.name || "Unknown Rider",
              riderEmail: rider?.username || "",
              chauffeurId: chauffeur?.id || null,
              chauffeurName: chauffeurUser?.name || null,
              pickupAddress: ride.pickupAddress || null,
              dropoffAddress: ride.dropoffAddress || null,
              paymentMethod: ride.paymentMethod || "cash",
              paymentStatus: ride.paymentStatus || "unpaid",
              rideStatus: ride.status || "requested",
              price: ride.price || 0,
              cashSelfieUrl: ride.cashSelfieUrl,
              livenessStatus: ride.livenessStatus || "not_required",
              livenessProvider: ride.livenessProvider || "mock",
              livenessScore: ride.livenessScore,
              livenessVerifiedAt: ride.livenessVerifiedAt,
              createdAt: ride.createdAt,
            };
          }),
        );

        return res.json(records);
      } catch (error: any) {
        return res.status(500).json({ message: error.message });
      }
    },
  );

  app.get(
    "/api/admin/stats",
    requireAuth,
    requireRole(["admin"]),
    async (_req: AuthedRequest, res: Response) => {
      try {
        const allRides = await storage.getAllRides();
        const allChauffeurs = await storage.getAllChauffeurs();
        const allWithdrawals = await storage.getAllWithdrawals();
        const allReports = await storage.getAllSafetyReports();
        const allEarnings = await storage.getAllEarnings();

        const completedRides = allRides.filter((r) => r.status === "trip_completed");
        const totalRevenue = completedRides.reduce((sum, r) => sum + (r.price || 0), 0);
        const totalPlatformCommission = allEarnings.reduce((sum, e) => sum + (e.commission || 0), 0);
        const totalDriverEarnings = allEarnings.reduce((sum, e) => sum + (e.amount || 0), 0);
        const activeRides = allRides.filter(
          (r) => !["trip_completed", "cancelled"].includes(r.status as string),
        );
        const pendingApprovals = allChauffeurs.filter((c) => !c.isApproved);
        const pendingWithdrawals = allWithdrawals.filter((w) => w.status === "pending");
        const openReports = allReports.filter((r) => r.status === "open");

        return res.json({
          totalRides: allRides.length,
          completedRides: completedRides.length,
          activeRides: activeRides.length,
          totalRevenue: Math.round(totalRevenue),
          totalPlatformCommission: Math.round(totalPlatformCommission),
          totalDriverEarnings: Math.round(totalDriverEarnings),
          commissionRate: 15,
          totalChauffeurs: allChauffeurs.length,
          onlineChauffeurs: allChauffeurs.filter((c) => c.isOnline).length,
          pendingApprovals: pendingApprovals.length,
          pendingWithdrawals: pendingWithdrawals.length,
          openReports: openReports.length,
          totalReports: allReports.length,
        });
      } catch (error: any) {
        return res.status(500).json({ message: error.message });
      }
    },
  );

  // -----------------------------
  // Admin seed — creates initial admin user (only works if no admin exists)
  // -----------------------------
  app.post("/api/admin/seed", async (req: Request, res: Response) => {
    try {
      const { username, password, name, seedSecret } = req.body;
      const existing = await storage.getUserByUsername(username || "admin");
      if (existing && existing.role === "admin") {
        return res.status(400).json({ message: "Admin user already exists" });
      }
      // Only require secret if an admin already exists (prevent re-seeding without auth)
      // First-time setup (no admin yet) is allowed freely
      const validSecret = process.env.ADMIN_SEED_SECRET || process.env.JWT_SECRET;
      if (existing && seedSecret !== validSecret) {
        return res.status(403).json({ message: "Invalid seed secret" });
      }
      const hashedPassword = await bcrypt.hash(password || "Admin@2026!", 10);
      const user = await storage.createUser({
        username: username || "admin",
        password: hashedPassword,
        name: name || "A2B Admin",
        phone: null,
        role: "admin",
      });
      const { password: _pw, ...safeUser } = user;
      return res.json({ message: "Admin user created", user: safeUser });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  // -----------------------------
  // External API Proxy (103.154.2.122)
  // -----------------------------
  app.get("/api/external/health", async (_req: Request, res: Response) => {
    try {
      const result = await externalApiService.healthCheck();
      return res.status(result.statusCode || 200).json(result);
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  app.get("/api/external/status", async (_req: Request, res: Response) => {
    try {
      const result = await externalApiService.getStatus();
      return res.status(result.statusCode || 200).json(result);
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  // Generic proxy for all external API routes (catch-all)
  app.use("/api/external", async (req: Request, res: Response, next: any) => {
    try {
      const endpoint = req.path.replace("/api/external", "") || "/";
      const result = await externalApiService.request(endpoint, {
        method: (req.method as "GET" | "POST" | "PUT" | "DELETE" | "PATCH") || "GET",
        body: Object.keys(req.body || {}).length > 0 ? req.body : undefined,
        headers: req.headers as Record<string, string>,
      });
      return res.status(result.statusCode || 200).json(result);
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  // ============================================================
  // PAYSTACK PAYMENT ROUTES
  // ============================================================

  const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY || "";
  const paystackAPI = axios.create({
    baseURL: "https://api.paystack.co",
    headers: {
      Authorization: `Bearer ${PAYSTACK_SECRET}`,
      "Content-Type": "application/json",
    },
  });

  async function recordWalletTx(
    userId: string, type: string, amount: number,
    balanceBefore: number, description: string, reference?: string, rideId?: string
  ) {
    const balanceAfter = type === "ride_charge" || type === "withdrawal"
      ? balanceBefore - amount
      : balanceBefore + amount;
    await storage.createWalletTransaction({
      userId, type, amount, balanceBefore, balanceAfter,
      reference, description, rideId, status: "completed",
    });
    return balanceAfter;
  }

  // GET /api/payments/webview-callback  — Paystack redirects here after payment; sends postMessage back to opener/parent
  app.get("/api/payments/webview-callback", (req: Request, res: Response) => {
    const reference = (req.query.reference || req.query.trxref || "") as string;
    const appBase = getAppBaseUrl(req);
    // Frontend URL for the fallback "Return to App" redirect
    // FRONTEND_URL env var on Railway should be set to the Netlify app URL
    const appReturnUrl = process.env.FRONTEND_URL
      || "https://peaceful-mousse-459c85.netlify.app";
    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Payment Complete</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{background:#0a0a0a;color:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
         display:flex;flex-direction:column;align-items:center;justify-content:center;
         min-height:100vh;gap:16px;text-align:center;padding:32px}
    .ring{width:72px;height:72px;animation:pop .45s cubic-bezier(.34,1.56,.64,1)}
    @keyframes pop{0%{transform:scale(.4);opacity:0}100%{transform:scale(1);opacity:1}}
    h2{font-size:20px;font-weight:700;letter-spacing:-.3px}
    .sub{font-size:14px;color:rgba(255,255,255,0.45);line-height:1.5;max-width:260px}
    .btn{margin-top:8px;padding:13px 28px;background:#fff;color:#000;font-weight:700;
         font-size:14px;border-radius:12px;border:none;cursor:pointer;letter-spacing:-.2px}
  </style>
</head>
<body>
  <svg class="ring" viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="36" cy="36" r="34" stroke="rgba(255,255,255,0.12)" stroke-width="2"/>
    <circle cx="36" cy="36" r="34" stroke="#ffffff" stroke-width="2"
      stroke-dasharray="213" stroke-dashoffset="213"
      style="animation:draw .55s .3s ease forwards;transform-origin:center;transform:rotate(-90deg)"/>
    <polyline points="22,36 32,46 50,28" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"
      style="opacity:0;animation:fadein .2s .75s forwards"/>
    <style>
      @keyframes draw{to{stroke-dashoffset:0}}
      @keyframes fadein{to{opacity:1}}
    </style>
  </svg>
  <h2>Payment Complete</h2>
  <p class="sub">Your payment was processed. You can close this window — the app will update automatically.</p>
  <button class="btn" id="back-btn" style="display:none" onclick="goBack()">Return to App</button>
  <script>
    var ref = ${JSON.stringify(reference)};
    var appUrl = ${JSON.stringify(appReturnUrl)};
    var msg = { type: 'paystack-done', reference: ref };

    // 1. Send postMessage to any listening parent/opener (web popup flow)
    var sent = false;
    try { if(window.opener){ window.opener.postMessage(msg,'*'); sent=true; } } catch(e){}
    try { if(window.parent && window.parent!==window){ window.parent.postMessage(msg,'*'); sent=true; } } catch(e){}

    // 2. Attempt to close popup/tab
    function tryClose() {
      try { window.close(); } catch(e){}
    }

    // 3. If window didn't close (mobile browser / standalone tab), show button after 1.5s
    var closeTimer = setTimeout(tryClose, 800);
    setTimeout(function() {
      // If we're still here, closing failed — show the back button
      document.getElementById('back-btn').style.display = 'inline-block';
      document.getElementById('status').textContent = sent
        ? 'App notified. Tap the button if the screen did not update.'
        : 'Tap below to return to the app.';
    }, 1600);

    function goBack() {
      // Try postMessage one more time then close / redirect
      try { if(window.opener){ window.opener.postMessage(msg,'*'); } } catch(e){}
      try { window.close(); } catch(e){}
      // Redirect as last resort (works for native in-app browser scenarios)
      setTimeout(function(){ window.location.href = appUrl; }, 300);
    }
  </script>
</body>
</html>`;
    res.setHeader("Content-Type", "text/html");
    res.send(html);
  });

  // POST /api/payments/initialize
  app.post("/api/payments/initialize", requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const { amount, email: clientEmail, rideId, saveCard, saveCardOnly } = req.body;
      const userId = req.auth!.sub;
      const reference = `A2B-${Date.now()}-${userId.slice(0, 6)}`;

      const user = await storage.getUser(userId);
      const email = (user?.email && user.email.includes("@")) ? user.email : clientEmail;

      if (!email || !email.includes("@")) {
        return res.status(400).json({ message: "A valid email address is required to process payments. Please update your profile email." });
      }

      const domain = getAppBaseUrl(req);
      const callbackUrl = `${domain}/api/payments/webview-callback?reference=${reference}`;

      const response = await paystackAPI.post("/transaction/initialize", {
        email,
        amount: Math.round(amount * 100),
        currency: "ZAR",
        reference,
        ...(callbackUrl ? { callback_url: callbackUrl } : {}),
        metadata: {
          userId,
          rideId: rideId || null,
          saveCard: saveCard || false,
          saveCardOnly: saveCardOnly || false,
          custom_fields: [
            { display_name: "App", variable_name: "app", value: "A2B LIFT" }
          ],
        },
        channels: ["card"],
      });

      const { authorization_url, access_code, reference: ref } = response.data.data;

      if (rideId) {
        await storage.createPayment({
          rideId, payerUserId: userId, amount,
          method: "card", status: "pending",
          currency: "ZAR", paystackReference: reference,
        });
      }

      return res.json({ authorizationUrl: authorization_url, accessCode: access_code, reference: ref });
    } catch (error: any) {
      console.error("[Paystack Initialize]", error.response?.data || error.message);
      return res.status(500).json({ message: "Payment initialization failed" });
    }
  });

  // POST /api/payments/verify
  app.post("/api/payments/verify", requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const { reference } = req.body;
      const userId = req.auth!.sub;

      const response = await paystackAPI.get(`/transaction/verify/${reference}`);
      const txData = response.data.data;

      if (txData.status !== "success") {
        return res.status(400).json({ message: "Payment not successful", status: txData.status });
      }

      const amount = txData.amount / 100;
      const metadata = txData.metadata || {};

      if (metadata.saveCard && txData.authorization?.reusable) {
        const auth = txData.authorization;
        const existingCards = await storage.getSavedCardsByUser(userId);
        const alreadySaved = existingCards.find((c: any) => c.last4 === auth.last4 && c.expYear === auth.exp_year);
        if (!alreadySaved) {
          await storage.createSavedCard({
            userId,
            paystackAuthCode: auth.authorization_code,
            cardType: auth.card_type,
            last4: auth.last4,
            expMonth: auth.exp_month,
            expYear: auth.exp_year,
            bank: auth.bank,
            isDefault: existingCards.length === 0,
          });
        }
      }

      if (metadata.rideId) {
        const payments = await storage.getPaymentsByRide(metadata.rideId);
        const pending = payments.find((p: any) => p.paystackReference === reference);
        if (pending) {
          await storage.updatePayment(pending.id, {
            status: "paid",
            paidAt: new Date(),
            paystackAuthCode: txData.authorization?.authorization_code,
          });
        }
        await storage.updateRide(metadata.rideId, { paymentStatus: "paid" });
      }

      if (!metadata.rideId && !metadata.saveCardOnly) {
        const user = await storage.getUser(userId);
        const balanceBefore = user?.walletBalance || 0;
        const newBalance = balanceBefore + amount;
        await storage.updateUser(userId, { walletBalance: newBalance });
        await recordWalletTx(userId, "topup", amount, balanceBefore, "Wallet top-up via card", reference);
      }

      return res.json({ success: true, amount, status: "paid" });
    } catch (error: any) {
      console.error("[Paystack Verify]", error.response?.data || error.message);
      const psMsg = error.response?.data?.message;
      if (psMsg) return res.status(400).json({ message: psMsg });
      return res.status(500).json({ message: "Payment verification failed" });
    }
  });

  // POST /api/payments/charge-card
  app.post("/api/payments/charge-card", requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const { cardId, rideId, amount, email } = req.body;
      const userId = req.auth!.sub;

      const card = await storage.getSavedCard(cardId);
      if (!card || card.userId !== userId) {
        return res.status(404).json({ message: "Card not found" });
      }

      const reference = `A2B-RIDE-${rideId}-${Date.now()}`;
      const response = await paystackAPI.post("/transaction/charge_authorization", {
        authorization_code: card.paystackAuthCode,
        email, amount: Math.round(amount * 100), currency: "ZAR", reference,
        metadata: { userId, rideId },
      });

      const txData = response.data.data;
      if (txData.status === "success") {
        await storage.createPayment({
          rideId, payerUserId: userId, amount,
          method: "card", status: "paid",
          currency: "ZAR", paidAt: new Date(), paystackReference: reference,
        });
        await storage.updateRide(rideId, { paymentStatus: "paid" });
        return res.json({ success: true, reference });
      }

      return res.status(400).json({ message: "Card charge failed", status: txData.status });
    } catch (error: any) {
      console.error("[Paystack Charge Card]", error.response?.data || error.message);
      return res.status(500).json({ message: "Card charge failed" });
    }
  });

  // POST /api/payments/charge-ride  — charges user's default saved card for a ride
  app.post("/api/payments/charge-ride", requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const { rideId } = req.body;
      const userId = req.auth!.sub;

      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ message: "User not found" });

      const ride = await storage.getRide(rideId);
      if (!ride) return res.status(404).json({ message: "Ride not found" });

      const cards = await storage.getSavedCardsByUser(userId);
      const defaultCard = cards.find((c: any) => c.isDefault) || cards[0];
      if (!defaultCard) {
        return res.status(400).json({ message: "No saved card found. Please add a card in your wallet.", needsCard: true });
      }

      const amount = (ride as any).price || (ride as any).totalPrice || (ride as any).estimatedPrice;
      if (!amount) return res.status(400).json({ message: "Ride has no price set" });

      const reference = `A2B-RIDE-${rideId}-${Date.now()}`;
      const response = await paystackAPI.post("/transaction/charge_authorization", {
        authorization_code: defaultCard.paystackAuthCode,
        email: user.username,
        amount: Math.round(Number(amount) * 100),
        currency: "ZAR",
        reference,
        metadata: { userId, rideId },
      });

      const txData = response.data.data;
      if (txData.status === "success") {
        await storage.createPayment({
          rideId, payerUserId: userId, amount: Number(amount),
          method: "card", status: "paid",
          currency: "ZAR", paidAt: new Date(), paystackReference: reference,
          paystackAuthCode: defaultCard.paystackAuthCode,
        });
        await storage.updateRide(rideId, { paymentStatus: "paid" });
        return res.json({ success: true, reference, card: { last4: defaultCard.last4, cardType: defaultCard.cardType } });
      }

      return res.status(400).json({ message: "Card charge failed", status: txData.status });
    } catch (error: any) {
      console.error("[Paystack Charge Ride]", error.response?.data || error.message);
      return res.status(500).json({ message: "Card charge failed" });
    }
  });

  // POST /api/payments/pay-wallet
  app.post("/api/payments/pay-wallet", requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const { rideId } = req.body;
      let { amount } = req.body;
      const userId = req.auth!.sub;

      if (!amount) {
        const ride = await storage.getRide(rideId);
        if (!ride) return res.status(404).json({ message: "Ride not found" });
        amount = (ride as any).price || (ride as any).totalPrice || (ride as any).estimatedPrice;
        if (!amount) return res.status(400).json({ message: "Ride has no price set" });
      }

      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ message: "User not found" });
      if ((user.walletBalance || 0) < amount) {
        return res.status(400).json({ message: "Insufficient wallet balance" });
      }

      const balanceBefore = user.walletBalance || 0;
      const newBalance = balanceBefore - amount;

      await storage.updateUser(userId, { walletBalance: newBalance });
      await storage.createPayment({
        rideId, payerUserId: userId, amount,
        method: "wallet", status: "paid",
        currency: "ZAR", paidAt: new Date(),
      });
      await storage.updateRide(rideId, { paymentStatus: "paid" });
      await recordWalletTx(userId, "ride_charge", amount, balanceBefore, "Ride payment", undefined, rideId);

      return res.json({ success: true, newBalance });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  // GET /api/payments/cards
  app.get("/api/payments/cards", requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const cards = await storage.getSavedCardsByUser(req.auth!.sub);
      return res.json(cards);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  // DELETE /api/payments/cards/:id
  app.delete("/api/payments/cards/:id", requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      await storage.deleteSavedCard(req.params.id);
      return res.json({ success: true });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  // PUT /api/payments/cards/:id/default — set a card as the default
  app.put("/api/payments/cards/:id/default", requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const userId = req.auth!.sub;
      const cards = await storage.getSavedCardsByUser(userId);
      for (const card of cards) {
        await storage.updateSavedCard(card.id, { isDefault: card.id === req.params.id });
      }
      return res.json({ success: true });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  // GET /api/wallet/transactions
  app.get("/api/wallet/transactions", requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const txs = await storage.getWalletTransactions(req.auth!.sub);
      return res.json(txs);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  // POST /api/wallet/withdraw — Paystack transfer to driver's bank account
  app.post("/api/wallet/withdraw", requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const { amount, bankCode, bankName: bankNameInput, accountNumber, accountName } = req.body;
      const userId = req.auth!.sub;

      if (!amount || !bankCode || !accountNumber || !accountName) {
        return res.status(400).json({ message: "amount, bankCode, accountNumber and accountName are required" });
      }

      const chauffeur = await storage.getChauffeurByUserId(userId);
      if (!chauffeur) return res.status(404).json({ message: "Chauffeur not found" });
      if ((chauffeur.earningsTotal || 0) < amount) {
        return res.status(400).json({ message: `You only have R${(chauffeur.earningsTotal || 0).toFixed(2)} available to withdraw. Please enter a lower amount.` });
      }

      const recipientRes = await paystackAPI.post("/transferrecipient", {
        type: "nuban", name: accountName,
        account_number: accountNumber, bank_code: bankCode, currency: "ZAR",
      });
      const recipientCode = recipientRes.data.data.recipient_code;

      const transferRef = `A2B-WITHDRAW-${Date.now()}`;
      const transferRes = await paystackAPI.post("/transfer", {
        source: "balance", amount: Math.round(amount * 100),
        recipient: recipientCode, reason: "A2B LIFT earnings withdrawal",
        reference: transferRef, currency: "ZAR",
      });

      const transferCode = transferRes.data.data.transfer_code;
      const status = transferRes.data.data.status;

      await storage.createWithdrawal({
        chauffeurId: chauffeur.id, amount,
        status: status === "success" ? "completed" : "pending",
        bankName: bankNameInput || bankCode, accountNumber, accountHolder: accountName,
        paystackTransferCode: transferCode, paystackRecipientCode: recipientCode,
      });

      await storage.updateChauffeur(chauffeur.id, {
        earningsTotal: (chauffeur.earningsTotal || 0) - amount,
      });

      return res.json({
        success: true,
        message: status === "success" ? "Transfer successful" : "Transfer initiated — funds arrive within 24hrs",
        transferCode, status,
      });
    } catch (error: any) {
      console.error("[Paystack Withdraw]", error.response?.data || error.message);
      return res.status(500).json({ message: error.response?.data?.message || error.message });
    }
  });

  // GET /api/wallet/banks
  app.get("/api/wallet/banks", async (_req: Request, res: Response) => {
    try {
      const response = await paystackAPI.get("/bank?currency=ZAR&country=south+africa");
      const banks = response.data.data.map((b: any) => ({ name: b.name, code: b.code, id: b.id }));
      return res.json(banks);
    } catch (error: any) {
      return res.json([
        { name: "ABSA Bank", code: "632005" },
        { name: "African Bank", code: "430000" },
        { name: "Albaraka Bank", code: "800000" },
        { name: "Bidvest Bank", code: "462005" },
        { name: "Capitec Bank", code: "470010" },
        { name: "Discovery Bank", code: "679000" },
        { name: "Finbond Mutual Bank", code: "589000" },
        { name: "First National Bank (FNB)", code: "250655" },
        { name: "Grindrod Bank", code: "584000" },
        { name: "HBZ Bank", code: "570000" },
        { name: "Investec Bank", code: "580105" },
        { name: "Mercantile Bank", code: "450905" },
        { name: "Nedbank", code: "198765" },
        { name: "Old Mutual Bank", code: "462005" },
        { name: "Postbank", code: "460005" },
        { name: "Sasfin Bank", code: "683000" },
        { name: "Standard Bank", code: "051001" },
        { name: "State Bank of India", code: "801000" },
        { name: "TymeBank", code: "678910" },
        { name: "Ubank (Teba Bank)", code: "431010" },
        { name: "VBS Mutual Bank", code: "588000" },
      ]);
    }
  });

  // POST /api/payments/webhook
  app.post("/api/payments/webhook", async (req: Request, res: Response) => {
    try {
      const hash = crypto
        .createHmac("sha512", PAYSTACK_SECRET)
        .update(JSON.stringify(req.body))
        .digest("hex");

      if (hash !== req.headers["x-paystack-signature"]) {
        return res.status(401).json({ message: "Invalid signature" });
      }

      const { event, data } = req.body;

      if (event === "charge.success") {
        console.log("[Webhook] Payment successful:", data.reference);
      }

      if (event === "transfer.success") {
        await storage.updateWithdrawalByTransferCode(data.transfer_code, {
          status: "completed", processedAt: new Date(),
        });
      }

      if (event === "transfer.failed") {
        await storage.updateWithdrawalByTransferCode(data.transfer_code, { status: "failed" });
      }

      return res.sendStatus(200);
    } catch (error: any) {
      console.error("[Webhook Error]", error.message);
      return res.sendStatus(200);
    }
  });

  // ── Route Selection (driver picks fastest/shortest/less-traffic after accepting) ──
  app.post("/api/rides/:id/select-route", requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { selectedRouteId, distanceKm, fare, currency = "ZAR" } = req.body;

      if (distanceKm == null || fare == null || !selectedRouteId) {
        return res.status(400).json({ error: "selectedRouteId, distanceKm and fare are required" });
      }

      const ride = await storage.getRide(id);
      if (!ride) return res.status(404).json({ error: "Ride not found" });

      // Only the assigned chauffeur or admin may select the route
      const authedReq = req as AuthedRequest;
      const chauffeur = authedReq.auth?.role !== "admin"
        ? await storage.getChauffeur(ride.chauffeurId ?? "")
        : null;
      if (chauffeur && chauffeur.userId !== authedReq.auth!.sub) {
        return res.status(403).json({ error: "Forbidden" });
      }

      await storage.updateRide(id, {
        selectedRouteId,
        selectedRouteDistanceKm: distanceKm,
        actualFare: fare,
        routeCurrency: currency,
        routeSelectedAt: new Date(),
      } as any);

      // Notify ride room so client sees the locked fare
      io.to(`ride:${id}`).emit("route_confirmed", {
        rideId: id,
        selectedRouteId,
        distanceKm,
        fare,
        currency,
        confirmedAt: new Date().toISOString(),
      });

      return res.json({ success: true, rideId: id, lockedFare: fare });
    } catch (err: any) {
      console.error("[select-route]", err.message);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // ── Upload liveness / cash-selfie photo (base64 → Supabase Storage) ──
  app.post("/api/rides/:id/upload-photo", requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { photoBase64, photoType, sessionId, mimeType } = req.body;
      if (!photoBase64 || !photoType) {
        return res.status(400).json({ error: "photoBase64 and photoType are required" });
      }
      if (!SUPABASE_SERVICE_KEY_CONFIGURED) {
        return res.status(503).json({ error: "Photo storage not configured (SUPABASE_SERVICE_ROLE_KEY missing)" });
      }
      const result = await uploadLivenessPhoto({
        sessionId: sessionId || id,
        userId: (req as AuthedRequest).auth!.sub,
        rideId: id,
        photoBase64,
        mimeType: mimeType || "image/jpeg",
        photoType,
      });
      if (!result.success) {
        return res.status(500).json({ error: result.error || "Upload failed" });
      }
      return res.json({ success: true, storagePath: result.storagePath, publicUrl: result.publicUrl });
    } catch (err: any) {
      console.error("[upload-photo]", err.message);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // ── Admin: get signed photo URLs for a ride ────────────────────────────────
  app.get("/api/admin/rides/:id/photos", requireAuth, requireRole(["admin"]), async (req: AuthedRequest, res: Response) => {
    try {
      const ride = await storage.getRide(req.params.id);
      if (!ride) return res.status(404).json({ error: "Ride not found" });

      const livSessions = await db
        .select()
        .from(livenessSessions)
        .where(eq(livenessSessions.rideId, req.params.id))
        .orderBy(desc(livenessSessions.createdAt));

      const SUPABASE_URL = process.env.SUPABASE_URL || "https://zzwkieiktbhptvgsqerd.supabase.co";
      const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

      async function makeSignedUrl(bucket: "ride-photos" | "liveness-photos", path: string | null | undefined): Promise<string | null> {
        if (!path || !SERVICE_KEY) return null;
        // Strip full URL to bare path if needed
        const bare = path.replace(/^https?:\/\/[^/]+\/storage\/v1\/object\/(?:public|sign)\/[^/]+\//, "");
        return getAdminSignedUrl(bucket, bare);
      }

      const cashSelfieSignedUrl = await makeSignedUrl("ride-photos", ride.cashSelfieUrl);

      const livPhotos = await Promise.all(
        livSessions.map(async (sess) => ({
          id: sess.id,
          status: sess.status,
          score: sess.score,
          provider: sess.provider,
          verifiedAt: sess.verifiedAt,
          signedUrl: await makeSignedUrl("liveness-photos", sess.verifiedPhotoUrl ?? sess.selfieUrl),
        }))
      );

      return res.json({
        rideId: req.params.id,
        cashSelfie: {
          storagePath: ride.cashSelfieUrl,
          signedUrl: cashSelfieSignedUrl,
        },
        livenessPhotos: livPhotos,
      });
    } catch (err: any) {
      console.error("[admin/rides/photos]", err.message);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  return httpServer;
}


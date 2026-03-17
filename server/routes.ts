import type { Express, Request, Response } from "express";
import { createServer, type Server } from "node:http";
import { Server as SocketIOServer } from "socket.io";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { storage } from "./storage";
import {
  calculatePrice,
  calculateChauffeurEarnings,
  getPricingConfig,
  getVehicleCategories,
} from "./luxuryPricingEngine";
import { authOptional, requireAuth, requireRole, type AuthedRequest } from "./auth-middleware";
import { signAccessToken, type UserRole } from "./auth";
import { externalApiService } from "./external-api-service";

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

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);

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

    socket.on("chauffeur:location", async (data) => {
      const { chauffeurId, lat, lng } = data;
      if (chauffeurId) {
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

    socket.on("ride:accept", async (data) => {
      io.emit("ride:accepted", data);
    });

    socket.on("ride:status", async (data) => {
      io.emit("ride:statusUpdate", data);
    });

    socket.on("chat:message", async (data) => {
      io.emit("chat:newMessage", data);
    });

    socket.on("disconnect", () => {
      console.log("Socket disconnected:", socket.id);
    });
  });

  // -----------------------------
  // Auth (JWT)
  // -----------------------------
  app.post("/api/auth/register", async (req: Request, res: Response) => {
    try {
      const { username, password, name, phone, role } = req.body;
      
      // Validate required fields
      if (!username || !password || !name) {
        return res.status(400).json({ message: "Username, password, and name are required" });
      }
      
      // Check if username already exists
      const existing = await storage.getUserByUsername(username);
      if (existing) {
        return res.status(400).json({ message: "Username already exists" });
      }
      
      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);
      
      // Create user
      const user = await storage.createUser({
        username: username.trim(),
        password: hashedPassword,
        name: name.trim(),
        phone: phone ? phone.trim() : null,
        role: (role || "client") as UserRole,
      });
      
      // Generate JWT token
      const token = signAccessToken({ sub: user.id, role: user.role as UserRole });
      setAuthCookie(res, token);
      
      // Return user without password
      const { password: _pw, ...safeUser } = user;
      return res.json({ user: safeUser, accessToken: token });
    } catch (error: any) {
      console.error("Registration error:", error);
      console.error("Error stack:", error.stack);
      
      // Handle specific database errors
      if (error.code === "23505") {
        // PostgreSQL unique constraint violation
        return res.status(400).json({ message: "Username already exists" });
      }
      if (error.code === "42P01") {
        // Table doesn't exist
        return res.status(500).json({ message: "Database table not found. Please run: npm run db:push" });
      }
      if (error.message?.includes("relation") && error.message?.includes("does not exist")) {
        return res.status(500).json({ message: "Database tables not initialized. Please run: npm run db:push" });
      }
      
      return res.status(500).json({ 
        message: error.message || "Registration failed. Please try again.",
        error: process.env.NODE_ENV === "development" ? error.message : undefined
      });
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
      const token = signAccessToken({ sub: user.id, role: user.role as UserRole });
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
  // Maps helpers
  // -----------------------------
  app.get("/api/geocode", async (req: Request, res: Response) => {
    try {
      const address = req.query.address as string;
      if (!address) {
        return res.status(400).json({ message: "Address is required" });
      }
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`,
        { headers: { "User-Agent": "A2BLIFT/1.0" } },
      );
      const results = (await response.json()) as any[];
      if (results.length > 0) {
        return res.json({
          lat: parseFloat(results[0].lat),
          lng: parseFloat(results[0].lon),
        });
      }
      return res.status(404).json({ message: "Location not found" });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  // Autocomplete using Nominatim — returns coords inline so no separate details call needed
  app.get("/api/places/autocomplete", async (req: Request, res: Response) => {
    try {
      const input = req.query.input as string;
      if (!input || input.trim().length < 2) {
        return res.json({ predictions: [] });
      }
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(input)}&limit=6&countrycodes=za&addressdetails=1`;
      const response = await fetch(url, {
        headers: { "User-Agent": "A2BLIFT/1.0 (contact@a2blift.co.za)" },
      });
      const results = (await response.json()) as any[];
      return res.json({
        predictions: results.map((r: any) => {
          const addr = r.address || {};
          const mainText = addr.road || addr.suburb || addr.city || addr.town || r.display_name.split(",")[0];
          const secondaryParts = [addr.suburb, addr.city || addr.town, addr.state].filter(Boolean);
          const secondaryText = secondaryParts.join(", ");
          return {
            placeId: r.place_id,
            description: r.display_name,
            mainText,
            secondaryText,
            lat: parseFloat(r.lat),
            lng: parseFloat(r.lon),
          };
        }),
      });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  // Details endpoint — Nominatim lookup by osm id (placeId)
  app.get("/api/places/details", async (req: Request, res: Response) => {
    try {
      const placeId = req.query.placeId as string;
      if (!placeId) return res.status(400).json({ message: "placeId is required" });
      const url = `https://nominatim.openstreetmap.org/lookup?osm_ids=N${placeId},W${placeId},R${placeId}&format=json&addressdetails=1`;
      const response = await fetch(url, {
        headers: { "User-Agent": "A2BLIFT/1.0 (contact@a2blift.co.za)" },
      });
      const results = (await response.json()) as any[];
      if (!results || results.length === 0) {
        return res.status(404).json({ message: "Place not found" });
      }
      const r = results[0];
      return res.json({
        lat: parseFloat(r.lat),
        lng: parseFloat(r.lon),
        address: r.display_name,
      });
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
      const apiKey = process.env.GOOGLE_MAPS_API_KEY;
      if (!apiKey) {
        return res
          .status(500)
          .json({ message: "Google Maps API key not configured" });
      }
      const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${originLat},${originLng}&destination=${destLat},${destLng}&key=${apiKey}`;
      const response = await fetch(url);
      const data = (await response.json()) as any;
      if (data.status === "OK" && data.routes?.length > 0) {
        const route = data.routes[0];
        const leg = route.legs[0];
        return res.json({
          polyline: route.overview_polyline.points,
          distanceKm: leg.distance.value / 1000,
          durationMin: Math.ceil(leg.duration.value / 60),
          durationText: leg.duration.text,
        });
      }
      return res.status(404).json({ message: "No route found" });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  // -----------------------------
  // Users
  // -----------------------------
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

  // -----------------------------
  // Chauffeurs
  // -----------------------------
  app.post("/api/chauffeurs", async (req: Request, res: Response) => {
    try {
      const chauffeur = await storage.createChauffeur(req.body);
      await storage.updateUser(req.body.userId, { role: "chauffeur" });

      // Create/ensure a driver application (pending) for admin review
      const existing = await storage.getDriverApplicationByUserId(req.body.userId);
      if (!existing) {
        await storage.createDriverApplication({
          userId: req.body.userId,
          chauffeurId: chauffeur.id,
          status: "pending",
        });
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

  app.get("/api/chauffeurs/:id", async (req: Request, res: Response) => {
    try {
      const chauffeur = await storage.getChauffeur(req.params.id);
      if (!chauffeur) return res.status(404).json({ message: "Chauffeur not found" });
      return res.json(chauffeur);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/chauffeurs/:id/details", async (req: Request, res: Response) => {
    try {
      const chauffeur = await storage.getChauffeur(req.params.id);
      if (!chauffeur) return res.status(404).json({ message: "Chauffeur not found" });
      const user = await storage.getUser(chauffeur.userId);
      return res.json({
        ...chauffeur,
        driverName: user?.name || "Chauffeur",
        driverPhone: chauffeur.phone || user?.phone || null,
        driverRating: user?.rating || 5.0,
      });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/chauffeurs/:id", async (req: Request, res: Response) => {
    try {
      const chauffeur = await storage.updateChauffeur(req.params.id, req.body);
      if (!chauffeur) return res.status(404).json({ message: "Chauffeur not found" });
      return res.json(chauffeur);
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
      return res.json(allChauffeurs);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  // -----------------------------
  // Driver Applications + Documents (Admin + Driver)
  // -----------------------------
  app.get("/api/driver/applications/me", requireAuth, async (req: AuthedRequest, res: Response) => {
    const appRow = await storage.getDriverApplicationByUserId(req.auth!.sub);
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

  app.post("/api/driver/documents", requireAuth, async (req: AuthedRequest, res: Response) => {
    const { applicationId, chauffeurId, type, url } = req.body;
    if (!type || !url) return res.status(400).json({ message: "type and url are required" });
    const doc = await storage.createDocument({
      userId: req.auth!.sub,
      applicationId: applicationId || null,
      chauffeurId: chauffeurId || null,
      type,
      url,
      status: "pending",
    });
    return res.json(doc);
  });

  app.get("/api/driver/documents", requireAuth, async (req: AuthedRequest, res: Response) => {
    const docs = await storage.getDocumentsByUser(req.auth!.sub);
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
  // Rides
  // -----------------------------
  app.post("/api/rides", async (req: Request, res: Response) => {
    try {
      const { distanceKm, isLateNight, ...rideData } = req.body;
      const categoryId = rideData.vehicleType || "budget";
      const priceEstimate = calculatePrice(distanceKm || 10, categoryId, { isLateNight });
      
      // Always create the ride with "searching" status
      const ride = await storage.createRide({
        ...rideData,
        price: priceEstimate.totalPrice,
        distanceKm: distanceKm || 10,
        pricePerKm: priceEstimate.pricePerKm,
        baseFare: priceEstimate.baseFare,
        status: "searching",
        paymentStatus: "unpaid",
      });

      // Broadcast to all online drivers so they can accept the ride
      io.emit("ride:new", ride);

      // Always return success immediately — client shows "searching" UI
      return res.json({
        success: true,
        status: ride.status,
        message: "Searching for drivers nearby...",
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

        const { secret, currency, callbackUrl } = getPaystackConfig();

        const amountInMinorUnits = Math.round(ride.price * 100); // kobo/cents
        const email =
          user.username.includes("@")
            ? user.username
            : `${user.username}@example.com`;

        const initBody: Record<string, unknown> = {
          email,
          amount: amountInMinorUnits,
          currency,
          metadata: {
            rideId: ride.id,
            userId: user.id,
          },
        };
        if (callbackUrl) {
          initBody.callback_url = callbackUrl;
        }

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

        await storage.createPayment({
          rideId: ride.id,
          payerUserId: userId || ride.clientId,
          amount: amount || ride.price || 0,
          method: "paystack",
          status: "paid",
          provider: "paystack",
          providerRef: eventData.reference,
        });

        await storage.updateRide(ride.id, {
          paymentStatus: "paid",
          paymentMethod: "card",
        });
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
      return res.json(ride);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/rides/:id", async (req: Request, res: Response) => {
    try {
      const ride = await storage.updateRide(req.params.id, req.body);
      if (!ride) return res.status(404).json({ message: "Ride not found" });
      io.emit("ride:statusUpdate", ride);
      return res.json(ride);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/rides/:id/accept", async (req: Request, res: Response) => {
    try {
      const { chauffeurId } = req.body;
      const ride = await storage.getRide(req.params.id);
      if (!ride) return res.status(404).json({ message: "Ride not found" });
      // Allow accepting rides that are "requested" or "searching"
      if (ride.status !== "requested" && ride.status !== "searching") {
        return res.status(400).json({ message: "Ride already assigned" });
      }
      const updated = await storage.updateRide(req.params.id, {
        chauffeurId,
        status: "chauffeur_assigned",
      });
      io.emit("ride:accepted", updated);
      if (ride.clientId) {
        await storage.createNotification({
          userId: ride.clientId,
          title: "Chauffeur Assigned",
          body: "Your premium chauffeur has been assigned and is on the way.",
          type: "ride",
        });
      }
      return res.json(updated);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/rides/:id/status", async (req: Request, res: Response) => {
    try {
      const { status } = req.body;
      const ride = await storage.updateRide(req.params.id, {
        status,
        ...(status === "trip_completed" ? { completedAt: new Date() } : {}),
      });
      if (!ride) return res.status(404).json({ message: "Ride not found" });

      if (status === "trip_completed" && ride.chauffeurId && ride.price) {
        const earningsCalc = calculateChauffeurEarnings(ride.price);
        await storage.createEarning({
          chauffeurId: ride.chauffeurId,
          rideId: ride.id,
          amount: earningsCalc.chauffeurEarnings,
          commission: earningsCalc.commission,
        });
        const chauffeur = await storage.getChauffeur(ride.chauffeurId);
        if (chauffeur) {
          await storage.updateChauffeur(ride.chauffeurId, {
            earningsTotal:
              (chauffeur.earningsTotal || 0) + earningsCalc.chauffeurEarnings,
          });
        }
        await storage.createNotification({
          userId: ride.clientId,
          title: "Trip Completed",
          body: `Your trip has been completed. Fare: R ${ride.price}. Thank you for choosing A2B LIFT.`,
          type: "ride",
        });

        // Auto-handle cash payments: if payment method is cash and no payment record exists, create one and mark as paid
        const paymentMethod = ride.paymentMethod || "cash";
        if (paymentMethod === "cash" && ride.price) {
          // Check if payment already exists
          const existingPayments = await storage.getPaymentsByRide(ride.id);
          if (existingPayments.length === 0) {
            // Create cash payment record and mark as paid
            await storage.createPayment({
              rideId: ride.id,
              payerUserId: ride.clientId,
              amount: ride.price,
              method: "cash",
              status: "paid",
              provider: "cash",
              providerRef: `cash_${ride.id}_${Date.now()}`,
            });

            // Update ride payment status
            await storage.updateRide(ride.id, {
              paymentStatus: "paid",
              paymentMethod: "cash",
            });
          } else {
            // If payment exists but status is pending, mark as paid
            const pendingPayment = existingPayments.find((p) => p.status === "pending" && p.method === "cash");
            if (pendingPayment) {
              await storage.updatePayment(pendingPayment.id, {
                status: "paid",
              });
              await storage.updateRide(ride.id, {
                paymentStatus: "paid",
              });
            }
          }
        }
      }

      io.emit("ride:statusUpdate", ride);
      return res.json(ride);
    } catch (error: any) {
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
      const message = await storage.createMessage(req.body);
      io.emit("chat:newMessage", message);
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

  // -----------------------------
  // Admin
  // -----------------------------
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

        const completedRides = allRides.filter((r) => r.status === "trip_completed");
        const totalRevenue = completedRides.reduce((sum, r) => sum + (r.price || 0), 0);
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

  return httpServer;
}


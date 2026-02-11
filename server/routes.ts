import type { Express, Request, Response } from "express";
import { createServer, type Server } from "node:http";
import { Server as SocketIOServer } from "socket.io";
import bcrypt from "bcryptjs";
import { storage } from "./storage";
import { calculatePrice, calculateChauffeurEarnings, getPricingConfig } from "./luxuryPricingEngine";

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
  return options[Math.floor(Math.random() * options.length)];
}

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);

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

  app.post("/api/auth/register", async (req: Request, res: Response) => {
    try {
      const { username, password, name, phone, role } = req.body;
      const existing = await storage.getUserByUsername(username);
      if (existing) {
        return res.status(400).json({ message: "Username already exists" });
      }
      const hashedPassword = await bcrypt.hash(password, 10);
      const user = await storage.createUser({
        username,
        password: hashedPassword,
        name,
        phone,
        role: role || "client",
      });
      const { password: _, ...safeUser } = user;
      return res.json(safeUser);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
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
      const { password: _, ...safeUser } = user;
      return res.json(safeUser);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/users/:id", async (req: Request, res: Response) => {
    try {
      const user = await storage.getUser(req.params.id);
      if (!user) return res.status(404).json({ message: "User not found" });
      const { password: _, ...safeUser } = user;
      return res.json(safeUser);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/users/:id", async (req: Request, res: Response) => {
    try {
      const user = await storage.updateUser(req.params.id, req.body);
      if (!user) return res.status(404).json({ message: "User not found" });
      const { password: _, ...safeUser } = user;
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
      const { password: _, ...safeUser } = user;
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
      const updated = await storage.updateUser(req.params.id, { walletBalance: newBalance });
      if (!updated) return res.status(500).json({ message: "Failed to update balance" });
      await storage.createNotification({
        userId: req.params.id,
        title: "Wallet Top Up",
        body: `R ${amount.toFixed(2)} has been added to your wallet. New balance: R ${newBalance.toFixed(2)}`,
        type: "wallet",
      });
      const { password: _, ...safeUser } = updated;
      return res.json(safeUser);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/chauffeurs", async (req: Request, res: Response) => {
    try {
      const chauffeur = await storage.createChauffeur(req.body);
      await storage.updateUser(req.body.userId, { role: "chauffeur" });
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

  app.post("/api/pricing/estimate", async (req: Request, res: Response) => {
    try {
      const { distanceKm, durationMin, isAirport, isLateNight } = req.body;
      const estimate = calculatePrice(distanceKm, durationMin, { isAirport, isLateNight });
      return res.json(estimate);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/pricing/config", async (_req: Request, res: Response) => {
    return res.json(getPricingConfig());
  });

  app.post("/api/rides", async (req: Request, res: Response) => {
    try {
      const { distanceKm, durationMin, isAirport, isLateNight, ...rideData } = req.body;
      const priceEstimate = calculatePrice(distanceKm || 10, durationMin || 15, {
        isAirport,
        isLateNight,
      });
      const ride = await storage.createRide({
        ...rideData,
        price: priceEstimate.totalPrice,
        distanceKm: distanceKm || 10,
        durationMin: durationMin || 15,
        status: "requested",
      });
      io.emit("ride:new", ride);
      return res.json(ride);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
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
      if (ride.status !== "requested") {
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
            earningsTotal: (chauffeur.earningsTotal || 0) + earningsCalc.chauffeurEarnings,
          });
        }
        await storage.createNotification({
          userId: ride.clientId,
          title: "Trip Completed",
          body: `Your trip has been completed. Fare: R ${ride.price}. Thank you for choosing A2B LIFT.`,
          type: "ride",
        });
      }

      io.emit("ride:statusUpdate", ride);
      return res.json(ride);
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

  app.get("/api/rides", async (_req: Request, res: Response) => {
    try {
      const allRides = await storage.getAllRides();
      return res.json(allRides);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

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

  app.post("/api/safety-reports", async (req: Request, res: Response) => {
    try {
      const { userId, rideId, type, description } = req.body;
      const aiResponse = generateAIResponse(type, description);
      const priority = type === "emergency" ? "high" : type === "safety" ? "medium" : "low";
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

  app.get("/api/admin/stats", async (_req: Request, res: Response) => {
    try {
      const allRides = await storage.getAllRides();
      const allChauffeurs = await storage.getAllChauffeurs();
      const allWithdrawals = await storage.getAllWithdrawals();
      const allReports = await storage.getAllSafetyReports();

      const completedRides = allRides.filter((r) => r.status === "trip_completed");
      const totalRevenue = completedRides.reduce((sum, r) => sum + (r.price || 0), 0);
      const activeRides = allRides.filter(
        (r) => !["trip_completed", "cancelled"].includes(r.status)
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
  });

  return httpServer;
}

import { drizzle } from "drizzle-orm/node-postgres";
import { eq, and, desc } from "drizzle-orm";
import {
  users,
  chauffeurs,
  rides,
  earnings,
  withdrawals,
  messages,
  safetyReports,
  notifications,
  type User,
  type InsertUser,
  type Chauffeur,
  type Ride,
  type Earning,
  type Withdrawal,
  type Message,
  type SafetyReport,
  type Notification,
} from "@shared/schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}

const db = drizzle(process.env.DATABASE_URL);

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, data: Partial<User>): Promise<User | undefined>;

  getChauffeur(id: string): Promise<Chauffeur | undefined>;
  getChauffeurByUserId(userId: string): Promise<Chauffeur | undefined>;
  createChauffeur(data: any): Promise<Chauffeur>;
  updateChauffeur(id: string, data: Partial<Chauffeur>): Promise<Chauffeur | undefined>;
  getOnlineChauffeurs(): Promise<Chauffeur[]>;
  getAllChauffeurs(): Promise<Chauffeur[]>;

  createRide(data: any): Promise<Ride>;
  getRide(id: string): Promise<Ride | undefined>;
  updateRide(id: string, data: Partial<Ride>): Promise<Ride | undefined>;
  getRidesByClient(clientId: string): Promise<Ride[]>;
  getRidesByChauffeur(chauffeurId: string): Promise<Ride[]>;
  getActiveRides(): Promise<Ride[]>;
  getAllRides(): Promise<Ride[]>;

  createEarning(data: any): Promise<Earning>;
  getEarningsByChauffeur(chauffeurId: string): Promise<Earning[]>;

  createWithdrawal(data: any): Promise<Withdrawal>;
  getWithdrawalsByChauffeur(chauffeurId: string): Promise<Withdrawal[]>;
  getAllWithdrawals(): Promise<Withdrawal[]>;
  updateWithdrawal(id: string, data: Partial<Withdrawal>): Promise<Withdrawal | undefined>;

  createMessage(data: any): Promise<Message>;
  getMessagesByRide(rideId: string): Promise<Message[]>;

  createSafetyReport(data: any): Promise<SafetyReport>;
  getSafetyReportsByUser(userId: string): Promise<SafetyReport[]>;
  getAllSafetyReports(): Promise<SafetyReport[]>;
  updateSafetyReport(id: string, data: Partial<SafetyReport>): Promise<SafetyReport | undefined>;

  createNotification(data: any): Promise<Notification>;
  getNotificationsByUser(userId: string): Promise<Notification[]>;
  markNotificationRead(id: string): Promise<Notification | undefined>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async updateUser(id: string, data: Partial<User>): Promise<User | undefined> {
    const [user] = await db.update(users).set(data).where(eq(users.id, id)).returning();
    return user;
  }

  async getChauffeur(id: string): Promise<Chauffeur | undefined> {
    const [chauffeur] = await db.select().from(chauffeurs).where(eq(chauffeurs.id, id));
    return chauffeur;
  }

  async getChauffeurByUserId(userId: string): Promise<Chauffeur | undefined> {
    const [chauffeur] = await db.select().from(chauffeurs).where(eq(chauffeurs.userId, userId));
    return chauffeur;
  }

  async createChauffeur(data: any): Promise<Chauffeur> {
    const [chauffeur] = await db.insert(chauffeurs).values(data).returning();
    return chauffeur;
  }

  async updateChauffeur(id: string, data: Partial<Chauffeur>): Promise<Chauffeur | undefined> {
    const [chauffeur] = await db.update(chauffeurs).set(data).where(eq(chauffeurs.id, id)).returning();
    return chauffeur;
  }

  async getOnlineChauffeurs(): Promise<Chauffeur[]> {
    return db.select().from(chauffeurs).where(
      and(eq(chauffeurs.isOnline, true), eq(chauffeurs.isApproved, true))
    );
  }

  async getAllChauffeurs(): Promise<Chauffeur[]> {
    return db.select().from(chauffeurs).orderBy(desc(chauffeurs.createdAt));
  }

  async createRide(data: any): Promise<Ride> {
    const [ride] = await db.insert(rides).values(data).returning();
    return ride;
  }

  async getRide(id: string): Promise<Ride | undefined> {
    const [ride] = await db.select().from(rides).where(eq(rides.id, id));
    return ride;
  }

  async updateRide(id: string, data: Partial<Ride>): Promise<Ride | undefined> {
    const [ride] = await db.update(rides).set(data).where(eq(rides.id, id)).returning();
    return ride;
  }

  async getRidesByClient(clientId: string): Promise<Ride[]> {
    return db.select().from(rides).where(eq(rides.clientId, clientId)).orderBy(desc(rides.createdAt));
  }

  async getRidesByChauffeur(chauffeurId: string): Promise<Ride[]> {
    return db.select().from(rides).where(eq(rides.chauffeurId, chauffeurId)).orderBy(desc(rides.createdAt));
  }

  async getActiveRides(): Promise<Ride[]> {
    return db.select().from(rides).orderBy(desc(rides.createdAt));
  }

  async getAllRides(): Promise<Ride[]> {
    return db.select().from(rides).orderBy(desc(rides.createdAt));
  }

  async createEarning(data: any): Promise<Earning> {
    const [earning] = await db.insert(earnings).values(data).returning();
    return earning;
  }

  async getEarningsByChauffeur(chauffeurId: string): Promise<Earning[]> {
    return db.select().from(earnings).where(eq(earnings.chauffeurId, chauffeurId)).orderBy(desc(earnings.createdAt));
  }

  async createWithdrawal(data: any): Promise<Withdrawal> {
    const [withdrawal] = await db.insert(withdrawals).values(data).returning();
    return withdrawal;
  }

  async getWithdrawalsByChauffeur(chauffeurId: string): Promise<Withdrawal[]> {
    return db.select().from(withdrawals).where(eq(withdrawals.chauffeurId, chauffeurId)).orderBy(desc(withdrawals.createdAt));
  }

  async getAllWithdrawals(): Promise<Withdrawal[]> {
    return db.select().from(withdrawals).orderBy(desc(withdrawals.createdAt));
  }

  async updateWithdrawal(id: string, data: Partial<Withdrawal>): Promise<Withdrawal | undefined> {
    const [withdrawal] = await db.update(withdrawals).set(data).where(eq(withdrawals.id, id)).returning();
    return withdrawal;
  }

  async createMessage(data: any): Promise<Message> {
    const [message] = await db.insert(messages).values(data).returning();
    return message;
  }

  async getMessagesByRide(rideId: string): Promise<Message[]> {
    return db.select().from(messages).where(eq(messages.rideId, rideId)).orderBy(messages.createdAt);
  }

  async createSafetyReport(data: any): Promise<SafetyReport> {
    const [report] = await db.insert(safetyReports).values(data).returning();
    return report;
  }

  async getSafetyReportsByUser(userId: string): Promise<SafetyReport[]> {
    return db.select().from(safetyReports).where(eq(safetyReports.userId, userId)).orderBy(desc(safetyReports.createdAt));
  }

  async getAllSafetyReports(): Promise<SafetyReport[]> {
    return db.select().from(safetyReports).orderBy(desc(safetyReports.createdAt));
  }

  async updateSafetyReport(id: string, data: Partial<SafetyReport>): Promise<SafetyReport | undefined> {
    const [report] = await db.update(safetyReports).set(data).where(eq(safetyReports.id, id)).returning();
    return report;
  }

  async createNotification(data: any): Promise<Notification> {
    const [notification] = await db.insert(notifications).values(data).returning();
    return notification;
  }

  async getNotificationsByUser(userId: string): Promise<Notification[]> {
    return db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt));
  }

  async markNotificationRead(id: string): Promise<Notification | undefined> {
    const [notification] = await db.update(notifications).set({ isRead: true }).where(eq(notifications.id, id)).returning();
    return notification;
  }
}

export const storage = new DatabaseStorage();

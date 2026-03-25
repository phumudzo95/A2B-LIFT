import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { eq, and, desc, avg, sql } from "drizzle-orm";
import {
  users,
  chauffeurs,
  rides,
  payments,
  driverApplications,
  documents,
  rideRatings,
  earnings,
  withdrawals,
  messages,
  safetyReports,
  notifications,
  tripEnquiries,
  savedCards,
  walletTransactions,
  type TripEnquiry,
  type User,
  type InsertUser,
  type Chauffeur,
  type Ride,
  type Payment,
  type DriverApplication,
  type Document,
  type RideRating,
  type Earning,
  type Withdrawal,
  type Message,
  type SafetyReport,
  type Notification,
  type SavedCard,
  type WalletTransaction,
} from "../shared/schema";

const dbUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
if (!dbUrl) {
  throw new Error("SUPABASE_DB_URL or DATABASE_URL is not set");
}

console.log(`[Storage] Using DB: ${dbUrl.includes("supabase") ? "SUPABASE ✅" : "LOCAL ❌"} | ${dbUrl.replace(/:([^:@]+)@/, ":***@")}`);

const requireSsl = dbUrl.includes("supabase") || dbUrl.includes("neon.tech");
const pool = new Pool({
  connectionString: dbUrl,
  ssl: requireSsl ? { rejectUnauthorized: false } : false,
});

const db = drizzle(pool);

export interface IStorage {
  // Users / Auth
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, data: Partial<User>): Promise<User | undefined>;

  // Chauffeurs (Drivers)
  getChauffeur(id: string): Promise<Chauffeur | undefined>;
  getChauffeurByUserId(userId: string): Promise<Chauffeur | undefined>;
  createChauffeur(data: any): Promise<Chauffeur>;
  updateChauffeur(id: string, data: Partial<Chauffeur>): Promise<Chauffeur | undefined>;
  deleteChauffeur(id: string): Promise<boolean>;
  getOnlineChauffeurs(): Promise<Chauffeur[]>;
  getAllChauffeurs(): Promise<Chauffeur[]>;

  // Driver Applications + Documents
  createDriverApplication(data: any): Promise<DriverApplication>;
  getDriverApplication(id: string): Promise<DriverApplication | undefined>;
  getDriverApplications(): Promise<DriverApplication[]>;
  getDriverApplicationByUserId(userId: string): Promise<DriverApplication | undefined>;
  updateDriverApplication(
    id: string,
    data: Partial<DriverApplication>,
  ): Promise<DriverApplication | undefined>;
  deleteDriverApplication(id: string): Promise<boolean>;

  createDocument(data: any): Promise<Document>;
  getDocumentsByApplication(applicationId: string): Promise<Document[]>;
  getDocumentsByUser(userId: string): Promise<Document[]>;
  getAllDocuments(): Promise<Document[]>;
  updateDocument(id: string, data: Partial<Document>): Promise<Document | undefined>;

  // Rides
  createRide(data: any): Promise<Ride>;
  getRide(id: string): Promise<Ride | undefined>;
  updateRide(id: string, data: Partial<Ride>): Promise<Ride | undefined>;
  getRidesByClient(clientId: string): Promise<Ride[]>;
  getRidesByChauffeur(chauffeurId: string): Promise<Ride[]>;
  getActiveRides(): Promise<Ride[]>;
  getAllRides(): Promise<Ride[]>;

  // Payments
  createPayment(data: any): Promise<Payment>;
  getAllUsers(): Promise<User[]>;
  getAllPayments(): Promise<Payment[]>;
  getPaymentsByRide(rideId: string): Promise<Payment[]>;
  updatePayment(id: string, data: Partial<Payment>): Promise<Payment | undefined>;

  // Ratings
  createRideRating(data: any): Promise<RideRating>;
  getRatingsByChauffeur(chauffeurId: string): Promise<RideRating[]>;
  getAverageRatingForUser(userId: string): Promise<number | null>;

  // Earnings / withdrawals
  createEarning(data: any): Promise<Earning>;
  getEarningsByChauffeur(chauffeurId: string): Promise<Earning[]>;
  getAllEarnings(): Promise<Earning[]>;

  createWithdrawal(data: any): Promise<Withdrawal>;
  getWithdrawalsByChauffeur(chauffeurId: string): Promise<Withdrawal[]>;
  getAllWithdrawals(): Promise<Withdrawal[]>;
  updateWithdrawal(id: string, data: Partial<Withdrawal>): Promise<Withdrawal | undefined>;

  // Chat
  createMessage(data: any): Promise<Message>;
  getMessagesByRide(rideId: string): Promise<Message[]>;

  // Safety + Notifications
  createSafetyReport(data: any): Promise<SafetyReport>;
  getSafetyReportsByUser(userId: string): Promise<SafetyReport[]>;
  getAllSafetyReports(): Promise<SafetyReport[]>;
  updateSafetyReport(
    id: string,
    data: Partial<SafetyReport>,
  ): Promise<SafetyReport | undefined>;

  createNotification(data: any): Promise<Notification>;
  getNotificationsByUser(userId: string): Promise<Notification[]>;
  markNotificationRead(id: string): Promise<Notification | undefined>;

  // Saved Cards (Paystack)
  getSavedCard(id: string): Promise<SavedCard | undefined>;
  getSavedCardsByUser(userId: string): Promise<SavedCard[]>;
  createSavedCard(data: any): Promise<SavedCard>;
  updateSavedCard(id: string, data: Partial<SavedCard>): Promise<SavedCard>;
  deleteSavedCard(id: string): Promise<void>;

  // Wallet Transactions
  createWalletTransaction(data: any): Promise<WalletTransaction>;
  getWalletTransactions(userId: string): Promise<WalletTransaction[]>;

  // Withdrawal (extended)
  updateWithdrawalByTransferCode(transferCode: string, data: any): Promise<Withdrawal | undefined>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const normalised = username.toLowerCase().trim();
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.username, normalised));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async updateUser(id: string, data: Partial<User>): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set(data)
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async getChauffeur(id: string): Promise<Chauffeur | undefined> {
    const [chauffeur] = await db
      .select()
      .from(chauffeurs)
      .where(eq(chauffeurs.id, id));
    return chauffeur;
  }

  async getChauffeurByUserId(userId: string): Promise<Chauffeur | undefined> {
    const [chauffeur] = await db
      .select()
      .from(chauffeurs)
      .where(eq(chauffeurs.userId, userId));
    return chauffeur;
  }

  async createChauffeur(data: any): Promise<Chauffeur> {
    const [chauffeur] = await db.insert(chauffeurs).values(data).returning();
    return chauffeur;
  }

  async updateChauffeur(
    id: string,
    data: Partial<Chauffeur>,
  ): Promise<Chauffeur | undefined> {
    const [chauffeur] = await db
      .update(chauffeurs)
      .set(data)
      .where(eq(chauffeurs.id, id))
      .returning();
    return chauffeur;
  }

  async deleteChauffeur(id: string): Promise<boolean> {
    const deleted = await db.delete(chauffeurs).where(eq(chauffeurs.id, id)).returning();
    return deleted.length > 0;
  }

  async getOnlineChauffeurs(): Promise<Chauffeur[]> {
    return db
      .select()
      .from(chauffeurs)
      .where(and(eq(chauffeurs.isOnline, true), eq(chauffeurs.isApproved, true)));
  }

  async getAllChauffeurs(): Promise<Chauffeur[]> {
    return db.select().from(chauffeurs).orderBy(desc(chauffeurs.createdAt));
  }

  async createDriverApplication(data: any): Promise<DriverApplication> {
    const [app] = await db
      .insert(driverApplications)
      .values(data)
      .returning();
    return app;
  }

  async getDriverApplication(id: string): Promise<DriverApplication | undefined> {
    const [app] = await db
      .select()
      .from(driverApplications)
      .where(eq(driverApplications.id, id));
    return app;
  }

  async getDriverApplications(): Promise<DriverApplication[]> {
    return db
      .select()
      .from(driverApplications)
      .orderBy(desc(driverApplications.submittedAt));
  }

  async getDriverApplicationByUserId(
    userId: string,
  ): Promise<DriverApplication | undefined> {
    const [app] = await db
      .select()
      .from(driverApplications)
      .where(eq(driverApplications.userId, userId))
      .orderBy(desc(driverApplications.submittedAt));
    return app;
  }

  async updateDriverApplication(
    id: string,
    data: Partial<DriverApplication>,
  ): Promise<DriverApplication | undefined> {
    const [app] = await db
      .update(driverApplications)
      .set(data)
      .where(eq(driverApplications.id, id))
      .returning();
    return app;
  }

  async deleteDriverApplication(id: string): Promise<boolean> {
    const deleted = await db.delete(driverApplications).where(eq(driverApplications.id, id)).returning();
    return deleted.length > 0;
  }

  async createDocument(data: any): Promise<Document> {
    const [doc] = await db.insert(documents).values(data).returning();
    return doc;
  }

  async getDocumentsByApplication(applicationId: string): Promise<Document[]> {
    return db
      .select()
      .from(documents)
      .where(eq(documents.applicationId, applicationId))
      .orderBy(desc(documents.uploadedAt));
  }

  async getDocumentsByUser(userId: string): Promise<Document[]> {
    return db
      .select()
      .from(documents)
      .where(eq(documents.userId, userId))
      .orderBy(desc(documents.uploadedAt));
  }

  async getAllDocuments(): Promise<Document[]> {
    return db.select().from(documents).orderBy(desc(documents.uploadedAt));
  }

  async updateDocument(
    id: string,
    data: Partial<Document>,
  ): Promise<Document | undefined> {
    const [doc] = await db
      .update(documents)
      .set(data)
      .where(eq(documents.id, id))
      .returning();
    return doc;
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
    const [ride] = await db
      .update(rides)
      .set(data)
      .where(eq(rides.id, id))
      .returning();
    return ride;
  }

  async getRidesByClient(clientId: string): Promise<Ride[]> {
    return db
      .select()
      .from(rides)
      .where(eq(rides.clientId, clientId))
      .orderBy(desc(rides.createdAt));
  }

  async getRidesByChauffeur(chauffeurId: string): Promise<Ride[]> {
    return db
      .select()
      .from(rides)
      .where(eq(rides.chauffeurId, chauffeurId))
      .orderBy(desc(rides.createdAt));
  }

  async getActiveRides(): Promise<Ride[]> {
    return db.select().from(rides).orderBy(desc(rides.createdAt));
  }

  async getAllRides(): Promise<Ride[]> {
    return db.select().from(rides).orderBy(desc(rides.createdAt));
  }

  async createPayment(data: any): Promise<Payment> {
    const [payment] = await db.insert(payments).values(data).returning();
    return payment;
  }

  async getAllUsers(): Promise<User[]> {
    return db.select().from(users).orderBy(desc(users.createdAt));
  }

  async getAllPayments(): Promise<Payment[]> {
    return db.select().from(payments).orderBy(desc(payments.createdAt));
  }

  async getPaymentsByRide(rideId: string): Promise<Payment[]> {
    return db
      .select()
      .from(payments)
      .where(eq(payments.rideId, rideId))
      .orderBy(desc(payments.createdAt));
  }

  async updatePayment(id: string, data: Partial<Payment>): Promise<Payment | undefined> {
    const [payment] = await db
      .update(payments)
      .set(data)
      .where(eq(payments.id, id))
      .returning();
    return payment;
  }

  async createRideRating(data: any): Promise<RideRating> {
    const [rating] = await db.insert(rideRatings).values(data).returning();
    return rating;
  }

  async getRatingsByChauffeur(chauffeurId: string): Promise<RideRating[]> {
    return db
      .select()
      .from(rideRatings)
      .where(eq(rideRatings.chauffeurId, chauffeurId))
      .orderBy(desc(rideRatings.createdAt));
  }

  async getAverageRatingForUser(userId: string): Promise<number | null> {
    // Average based on all ratings where the rated chauffeur belongs to the userId.
    const chauffeur = await this.getChauffeurByUserId(userId);
    if (!chauffeur) return null;
    const [row] = await db
      .select({ value: avg(rideRatings.rating) })
      .from(rideRatings)
      .where(eq(rideRatings.chauffeurId, chauffeur.id));
    const value = (row?.value as unknown as number | null) ?? null;
    return value;
  }

  async createEarning(data: any): Promise<Earning> {
    const [earning] = await db.insert(earnings).values(data).returning();
    return earning;
  }

  async getEarningsByChauffeur(chauffeurId: string): Promise<Earning[]> {
    return db
      .select()
      .from(earnings)
      .where(eq(earnings.chauffeurId, chauffeurId))
      .orderBy(desc(earnings.createdAt));
  }

  async getAllEarnings(): Promise<Earning[]> {
    return db.select().from(earnings).orderBy(desc(earnings.createdAt));
  }

  async createWithdrawal(data: any): Promise<Withdrawal> {
    const [withdrawal] = await db.insert(withdrawals).values(data).returning();
    return withdrawal;
  }

  async getWithdrawalsByChauffeur(chauffeurId: string): Promise<Withdrawal[]> {
    return db
      .select()
      .from(withdrawals)
      .where(eq(withdrawals.chauffeurId, chauffeurId))
      .orderBy(desc(withdrawals.createdAt));
  }

  async getAllWithdrawals(): Promise<Withdrawal[]> {
    return db.select().from(withdrawals).orderBy(desc(withdrawals.createdAt));
  }

  async updateWithdrawal(
    id: string,
    data: Partial<Withdrawal>,
  ): Promise<Withdrawal | undefined> {
    const [withdrawal] = await db
      .update(withdrawals)
      .set(data)
      .where(eq(withdrawals.id, id))
      .returning();
    return withdrawal;
  }

  async createMessage(data: any): Promise<Message> {
    const [message] = await db.insert(messages).values(data).returning();
    return message;
  }

  async getMessagesByRide(rideId: string): Promise<Message[]> {
    return db
      .select()
      .from(messages)
      .where(eq(messages.rideId, rideId))
      .orderBy(messages.createdAt);
  }

  async createSafetyReport(data: any): Promise<SafetyReport> {
    const [report] = await db.insert(safetyReports).values(data).returning();
    return report;
  }

  async getSafetyReportsByUser(userId: string): Promise<SafetyReport[]> {
    return db
      .select()
      .from(safetyReports)
      .where(eq(safetyReports.userId, userId))
      .orderBy(desc(safetyReports.createdAt));
  }

  async getAllSafetyReports(): Promise<SafetyReport[]> {
    return db.select().from(safetyReports).orderBy(desc(safetyReports.createdAt));
  }

  async updateSafetyReport(
    id: string,
    data: Partial<SafetyReport>,
  ): Promise<SafetyReport | undefined> {
    const [report] = await db
      .update(safetyReports)
      .set(data)
      .where(eq(safetyReports.id, id))
      .returning();
    return report;
  }

  async createNotification(data: any): Promise<Notification> {
    const [notification] = await db
      .insert(notifications)
      .values(data)
      .returning();
    return notification;
  }

  async getNotificationsByUser(userId: string): Promise<Notification[]> {
    return db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt));
  }

  async markNotificationRead(id: string): Promise<Notification | undefined> {
    const [notification] = await db
      .update(notifications)
      .set({ isRead: true })
      .where(eq(notifications.id, id))
      .returning();
    return notification;
  }

  async getSavedCard(id: string): Promise<SavedCard | undefined> {
    const [card] = await db.select().from(savedCards).where(eq(savedCards.id, id));
    return card;
  }

  async getSavedCardsByUser(userId: string): Promise<SavedCard[]> {
    return db.select().from(savedCards)
      .where(eq(savedCards.userId, userId))
      .orderBy(desc(savedCards.createdAt));
  }

  async createSavedCard(data: any): Promise<SavedCard> {
    const [card] = await db.insert(savedCards).values(data).returning();
    return card;
  }

  async updateSavedCard(id: string, data: Partial<SavedCard>): Promise<SavedCard> {
    const [card] = await db.update(savedCards).set(data).where(eq(savedCards.id, id)).returning();
    return card;
  }

  async deleteSavedCard(id: string): Promise<void> {
    await db.delete(savedCards).where(eq(savedCards.id, id));
  }

  async createWalletTransaction(data: any): Promise<WalletTransaction> {
    const [tx] = await db.insert(walletTransactions).values(data).returning();
    return tx;
  }

  async getWalletTransactions(userId: string): Promise<WalletTransaction[]> {
    return db.select().from(walletTransactions)
      .where(eq(walletTransactions.userId, userId))
      .orderBy(desc(walletTransactions.createdAt))
      .limit(50);
  }

  async updateWithdrawalByTransferCode(transferCode: string, data: any): Promise<Withdrawal | undefined> {
    const [w] = await db.update(withdrawals)
      .set(data)
      .where(eq(withdrawals.paystackTransferCode, transferCode))
      .returning();
    return w;
  }

  async createTripEnquiry(data: { rideId: string; userId: string; message: string }): Promise<TripEnquiry> {
    const [enquiry] = await db.insert(tripEnquiries).values(data).returning();
    return enquiry;
  }

  async getAllTripEnquiries(): Promise<TripEnquiry[]> {
    return db.select().from(tripEnquiries).orderBy(desc(tripEnquiries.createdAt));
  }

  async replyToTripEnquiry(id: string, adminReply: string): Promise<TripEnquiry | undefined> {
    const [enquiry] = await db
      .update(tripEnquiries)
      .set({ adminReply, status: "replied", repliedAt: new Date() })
      .where(eq(tripEnquiries.id, id))
      .returning();
    return enquiry;
  }
}

export const storage = new DatabaseStorage();


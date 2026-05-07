import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { eq, and, desc, avg, sql } from "drizzle-orm";
import { users, chauffeurs, rides, payments, driverApplications, documents, rideRatings, earnings, withdrawals, messages, safetyReports, notifications, tripEnquiries, livenessSessions, savedCards, walletTransactions, } from "../shared/schema";
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
export class DatabaseStorage {
    async getUser(id) {
        const [user] = await db.select().from(users).where(eq(users.id, id));
        return user;
    }
    async getUserByUsername(username) {
        const normalised = username.toLowerCase().trim();
        const [user] = await db
            .select()
            .from(users)
            .where(eq(users.username, normalised));
        return user;
    }
    async createUser(insertUser) {
        const [user] = await db.insert(users).values(insertUser).returning();
        return user;
    }
    async updateUser(id, data) {
        const [user] = await db
            .update(users)
            .set(data)
            .where(eq(users.id, id))
            .returning();
        return user;
    }
    async getChauffeur(id) {
        const [chauffeur] = await db
            .select()
            .from(chauffeurs)
            .where(eq(chauffeurs.id, id));
        return chauffeur;
    }
    async getChauffeurByUserId(userId) {
        const [chauffeur] = await db
            .select()
            .from(chauffeurs)
            .where(eq(chauffeurs.userId, userId));
        return chauffeur;
    }
    async createChauffeur(data) {
        const [chauffeur] = await db.insert(chauffeurs).values(data).returning();
        return chauffeur;
    }
    async updateChauffeur(id, data) {
        const [chauffeur] = await db
            .update(chauffeurs)
            .set(data)
            .where(eq(chauffeurs.id, id))
            .returning();
        return chauffeur;
    }
    async deleteChauffeur(id) {
        const deleted = await db.delete(chauffeurs).where(eq(chauffeurs.id, id)).returning();
        return deleted.length > 0;
    }
    async getOnlineChauffeurs() {
        return db
            .select()
            .from(chauffeurs)
            .where(and(eq(chauffeurs.isOnline, true), eq(chauffeurs.isApproved, true)));
    }
    async getAllChauffeurs() {
        return db.select().from(chauffeurs).orderBy(desc(chauffeurs.createdAt));
    }
    async createDriverApplication(data) {
        const [app] = await db
            .insert(driverApplications)
            .values(data)
            .returning();
        return app;
    }
    async getDriverApplication(id) {
        const [app] = await db
            .select()
            .from(driverApplications)
            .where(eq(driverApplications.id, id));
        return app;
    }
    async getDriverApplications() {
        return db
            .select()
            .from(driverApplications)
            .orderBy(desc(driverApplications.submittedAt));
    }
    async getDriverApplicationByUserId(userId) {
        const [app] = await db
            .select()
            .from(driverApplications)
            .where(eq(driverApplications.userId, userId))
            .orderBy(desc(driverApplications.submittedAt));
        return app;
    }
    async updateDriverApplication(id, data) {
        const [app] = await db
            .update(driverApplications)
            .set(data)
            .where(eq(driverApplications.id, id))
            .returning();
        return app;
    }
    async deleteDriverApplication(id) {
        const deleted = await db.delete(driverApplications).where(eq(driverApplications.id, id)).returning();
        return deleted.length > 0;
    }
    async createDocument(data) {
        const [doc] = await db.insert(documents).values(data).returning();
        return doc;
    }
    async getDocumentsByApplication(applicationId) {
        return db
            .select()
            .from(documents)
            .where(eq(documents.applicationId, applicationId))
            .orderBy(desc(documents.uploadedAt));
    }
    async getDocumentsByUser(userId) {
        return db
            .select()
            .from(documents)
            .where(eq(documents.userId, userId))
            .orderBy(desc(documents.uploadedAt));
    }
    async getAllDocuments() {
        return db.select().from(documents).orderBy(desc(documents.uploadedAt));
    }
    async updateDocument(id, data) {
        const [doc] = await db
            .update(documents)
            .set(data)
            .where(eq(documents.id, id))
            .returning();
        return doc;
    }
    async createRide(data) {
        const [ride] = await db.insert(rides).values(data).returning();
        return ride;
    }
    async getRide(id) {
        const [ride] = await db.select().from(rides).where(eq(rides.id, id));
        return ride;
    }
    async updateRide(id, data) {
        const [ride] = await db
            .update(rides)
            .set(data)
            .where(eq(rides.id, id))
            .returning();
        return ride;
    }
    /** Atomically accepts a ride — the UPDATE only fires when the ride is still in an
     *  acceptable state, preventing two drivers from claiming the same trip. */
    async acceptRideAtomic(rideId, chauffeurId) {
        const [ride] = await db
            .update(rides)
            .set({ chauffeurId, status: "chauffeur_assigned" })
            .where(and(eq(rides.id, rideId), sql `${rides.status} IN ('requested', 'searching')`))
            .returning();
        return ride; // undefined means another driver already grabbed it
    }
    async getRidesByClient(clientId) {
        return db
            .select()
            .from(rides)
            .where(eq(rides.clientId, clientId))
            .orderBy(desc(rides.createdAt));
    }
    async getRidesByChauffeur(chauffeurId) {
        return db
            .select()
            .from(rides)
            .where(eq(rides.chauffeurId, chauffeurId))
            .orderBy(desc(rides.createdAt));
    }
    async getActiveRides() {
        return db.select().from(rides).orderBy(desc(rides.createdAt));
    }
    async getAllRides() {
        return db.select().from(rides).orderBy(desc(rides.createdAt));
    }
    async createLivenessSession(data) {
        const [session] = await db.insert(livenessSessions).values(data).returning();
        return session;
    }
    async getLivenessSession(id) {
        const [session] = await db
            .select()
            .from(livenessSessions)
            .where(eq(livenessSessions.id, id));
        return session;
    }
    async getLatestPendingLivenessSessionByUser(userId) {
        const [session] = await db
            .select()
            .from(livenessSessions)
            .where(and(eq(livenessSessions.userId, userId), eq(livenessSessions.status, "pending")))
            .orderBy(desc(livenessSessions.createdAt));
        return session;
    }
    async updateLivenessSession(id, data) {
        // Drizzle's PgTimestamp requires real Date objects — coerce any strings that
        // may have leaked through JSON serialisation back to Date instances.
        const safe = { ...data };
        for (const key of ["verifiedAt", "expiresAt", "createdAt", "updatedAt"]) {
            if (safe[key] !== null && safe[key] !== undefined && !(safe[key] instanceof Date)) {
                safe[key] = new Date(safe[key]);
            }
        }
        const [session] = await db
            .update(livenessSessions)
            .set({ ...safe, updatedAt: new Date() })
            .where(eq(livenessSessions.id, id))
            .returning();
        return session;
    }
    async createPayment(data) {
        const [payment] = await db.insert(payments).values(data).returning();
        return payment;
    }
    async getAllUsers() {
        return db.select().from(users).orderBy(desc(users.createdAt));
    }
    async getAllPayments() {
        return db.select().from(payments).orderBy(desc(payments.createdAt));
    }
    async getPaymentsByRide(rideId) {
        return db
            .select()
            .from(payments)
            .where(eq(payments.rideId, rideId))
            .orderBy(desc(payments.createdAt));
    }
    async updatePayment(id, data) {
        const [payment] = await db
            .update(payments)
            .set(data)
            .where(eq(payments.id, id))
            .returning();
        return payment;
    }
    async createRideRating(data) {
        const [rating] = await db.insert(rideRatings).values(data).returning();
        return rating;
    }
    async getRatingsByChauffeur(chauffeurId) {
        return db
            .select()
            .from(rideRatings)
            .where(eq(rideRatings.chauffeurId, chauffeurId))
            .orderBy(desc(rideRatings.createdAt));
    }
    async getAverageRatingForUser(userId) {
        // Average based on all ratings where the rated chauffeur belongs to the userId.
        const chauffeur = await this.getChauffeurByUserId(userId);
        if (!chauffeur)
            return null;
        const [row] = await db
            .select({ value: avg(rideRatings.rating) })
            .from(rideRatings)
            .where(eq(rideRatings.chauffeurId, chauffeur.id));
        const value = row?.value ?? null;
        return value;
    }
    async createEarning(data) {
        const [earning] = await db.insert(earnings).values(data).returning();
        return earning;
    }
    async getEarningsByChauffeur(chauffeurId) {
        return db
            .select()
            .from(earnings)
            .where(eq(earnings.chauffeurId, chauffeurId))
            .orderBy(desc(earnings.createdAt));
    }
    async getAllEarnings() {
        return db.select().from(earnings).orderBy(desc(earnings.createdAt));
    }
    async createWithdrawal(data) {
        const [withdrawal] = await db.insert(withdrawals).values(data).returning();
        return withdrawal;
    }
    async getWithdrawalsByChauffeur(chauffeurId) {
        return db
            .select()
            .from(withdrawals)
            .where(eq(withdrawals.chauffeurId, chauffeurId))
            .orderBy(desc(withdrawals.createdAt));
    }
    async getAllWithdrawals() {
        return db.select().from(withdrawals).orderBy(desc(withdrawals.createdAt));
    }
    async updateWithdrawal(id, data) {
        const [withdrawal] = await db
            .update(withdrawals)
            .set(data)
            .where(eq(withdrawals.id, id))
            .returning();
        return withdrawal;
    }
    async createMessage(data) {
        const [message] = await db.insert(messages).values(data).returning();
        return message;
    }
    async getMessagesByRide(rideId) {
        return db
            .select()
            .from(messages)
            .where(eq(messages.rideId, rideId))
            .orderBy(messages.createdAt);
    }
    async createSafetyReport(data) {
        const [report] = await db.insert(safetyReports).values(data).returning();
        return report;
    }
    async getSafetyReportsByUser(userId) {
        return db
            .select()
            .from(safetyReports)
            .where(eq(safetyReports.userId, userId))
            .orderBy(desc(safetyReports.createdAt));
    }
    async getAllSafetyReports() {
        return db.select().from(safetyReports).orderBy(desc(safetyReports.createdAt));
    }
    async updateSafetyReport(id, data) {
        const [report] = await db
            .update(safetyReports)
            .set(data)
            .where(eq(safetyReports.id, id))
            .returning();
        return report;
    }
    async createNotification(data) {
        const [notification] = await db
            .insert(notifications)
            .values(data)
            .returning();
        return notification;
    }
    async getNotificationsByUser(userId) {
        return db
            .select()
            .from(notifications)
            .where(eq(notifications.userId, userId))
            .orderBy(desc(notifications.createdAt));
    }
    async markNotificationRead(id) {
        const [notification] = await db
            .update(notifications)
            .set({ isRead: true })
            .where(eq(notifications.id, id))
            .returning();
        return notification;
    }
    async deleteAllNotificationsByUser(userId) {
        await db.delete(notifications).where(eq(notifications.userId, userId));
    }
    async getSavedCard(id) {
        const [card] = await db.select().from(savedCards).where(eq(savedCards.id, id));
        return card;
    }
    async getSavedCardsByUser(userId) {
        return db.select().from(savedCards)
            .where(eq(savedCards.userId, userId))
            .orderBy(desc(savedCards.createdAt));
    }
    async createSavedCard(data) {
        const [card] = await db.insert(savedCards).values(data).returning();
        return card;
    }
    async updateSavedCard(id, data) {
        const [card] = await db.update(savedCards).set(data).where(eq(savedCards.id, id)).returning();
        return card;
    }
    async deleteSavedCard(id) {
        await db.delete(savedCards).where(eq(savedCards.id, id));
    }
    async createWalletTransaction(data) {
        const [tx] = await db.insert(walletTransactions).values(data).returning();
        return tx;
    }
    async getWalletTransactions(userId) {
        return db.select().from(walletTransactions)
            .where(eq(walletTransactions.userId, userId))
            .orderBy(desc(walletTransactions.createdAt))
            .limit(50);
    }
    async updateWithdrawalByTransferCode(transferCode, data) {
        const [w] = await db.update(withdrawals)
            .set(data)
            .where(eq(withdrawals.paystackTransferCode, transferCode))
            .returning();
        return w;
    }
    async createTripEnquiry(data) {
        const [enquiry] = await db.insert(tripEnquiries).values(data).returning();
        return enquiry;
    }
    async getAllTripEnquiries() {
        return db.select().from(tripEnquiries).orderBy(desc(tripEnquiries.createdAt));
    }
    async replyToTripEnquiry(id, adminReply) {
        const [enquiry] = await db
            .update(tripEnquiries)
            .set({ adminReply, status: "replied", repliedAt: new Date() })
            .where(eq(tripEnquiries.id, id))
            .returning();
        return enquiry;
    }
}
export const storage = new DatabaseStorage();

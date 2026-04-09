"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc3) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc3 = __getOwnPropDesc(from, key)) || desc3.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server/index.ts
var import_config = require("dotenv/config");
var import_express = __toESM(require("express"));

// server/routes.ts
var import_node_http = require("node:http");
var import_socket = require("socket.io");
var import_axios = __toESM(require("axios"));
var import_bcryptjs = __toESM(require("bcryptjs"));
var import_node_crypto = __toESM(require("node:crypto"));

// server/storage.ts
var import_node_postgres = require("drizzle-orm/node-postgres");
var import_pg = require("pg");
var import_drizzle_orm2 = require("drizzle-orm");

// shared/schema.ts
var schema_exports = {};
__export(schema_exports, {
  chauffeurs: () => chauffeurs,
  documents: () => documents,
  driverApplications: () => driverApplications,
  earnings: () => earnings,
  insertChauffeurSchema: () => insertChauffeurSchema,
  insertLivenessSessionSchema: () => insertLivenessSessionSchema,
  insertRideSchema: () => insertRideSchema,
  insertUserSchema: () => insertUserSchema,
  livenessSessions: () => livenessSessions,
  messages: () => messages,
  notifications: () => notifications,
  payments: () => payments,
  rideRatings: () => rideRatings,
  rides: () => rides,
  safetyReports: () => safetyReports,
  savedCards: () => savedCards,
  tripEnquiries: () => tripEnquiries,
  users: () => users,
  walletTransactions: () => walletTransactions,
  withdrawals: () => withdrawals
});
var import_drizzle_orm = require("drizzle-orm");
var import_pg_core = require("drizzle-orm/pg-core");
var import_drizzle_zod = require("drizzle-zod");
var users = (0, import_pg_core.pgTable)("users", {
  id: (0, import_pg_core.varchar)("id").primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
  username: (0, import_pg_core.text)("username").notNull().unique(),
  password: (0, import_pg_core.text)("password").notNull(),
  name: (0, import_pg_core.text)("name").notNull(),
  phone: (0, import_pg_core.text)("phone"),
  pushToken: (0, import_pg_core.text)("push_token"),
  // client (passenger) | chauffeur (driver) | admin
  role: (0, import_pg_core.text)("role").notNull().default("client"),
  rating: (0, import_pg_core.real)("rating").default(5),
  walletBalance: (0, import_pg_core.real)("wallet_balance").default(0),
  createdAt: (0, import_pg_core.timestamp)("created_at").defaultNow()
});
var chauffeurs = (0, import_pg_core.pgTable)("chauffeurs", {
  id: (0, import_pg_core.varchar)("id").primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
  userId: (0, import_pg_core.varchar)("user_id").notNull().unique().references(() => users.id),
  carMake: (0, import_pg_core.text)("car_make"),
  vehicleModel: (0, import_pg_core.text)("vehicle_model").notNull(),
  plateNumber: (0, import_pg_core.text)("plate_number").notNull(),
  vehicleType: (0, import_pg_core.text)("vehicle_type").notNull(),
  carColor: (0, import_pg_core.text)("car_color").notNull(),
  phone: (0, import_pg_core.text)("phone"),
  passengerCapacity: (0, import_pg_core.integer)("passenger_capacity").default(4),
  luggageCapacity: (0, import_pg_core.integer)("luggage_capacity").default(2),
  isOnline: (0, import_pg_core.boolean)("is_online").default(false),
  isApproved: (0, import_pg_core.boolean)("is_approved").default(false),
  earningsTotal: (0, import_pg_core.real)("earnings_total").default(0),
  profilePhoto: (0, import_pg_core.text)("profile_photo"),
  lat: (0, import_pg_core.real)("lat"),
  lng: (0, import_pg_core.real)("lng"),
  locationUpdatedAt: (0, import_pg_core.timestamp)("location_updated_at"),
  pushToken: (0, import_pg_core.text)("push_token"),
  createdAt: (0, import_pg_core.timestamp)("created_at").defaultNow()
});
var rides = (0, import_pg_core.pgTable)("rides", {
  id: (0, import_pg_core.varchar)("id").primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
  clientId: (0, import_pg_core.varchar)("client_id").notNull().references(() => users.id),
  chauffeurId: (0, import_pg_core.varchar)("chauffeur_id").references(() => chauffeurs.id),
  pickupLat: (0, import_pg_core.real)("pickup_lat").notNull(),
  pickupLng: (0, import_pg_core.real)("pickup_lng").notNull(),
  pickupAddress: (0, import_pg_core.text)("pickup_address"),
  dropoffLat: (0, import_pg_core.real)("dropoff_lat").notNull(),
  dropoffLng: (0, import_pg_core.real)("dropoff_lng").notNull(),
  dropoffAddress: (0, import_pg_core.text)("dropoff_address"),
  status: (0, import_pg_core.text)("status").notNull().default("requested"),
  price: (0, import_pg_core.real)("price"),
  pricePerKm: (0, import_pg_core.real)("price_per_km"),
  baseFare: (0, import_pg_core.real)("base_fare"),
  distanceKm: (0, import_pg_core.real)("distance_km"),
  durationMin: (0, import_pg_core.real)("duration_min"),
  vehicleType: (0, import_pg_core.text)("vehicle_type"),
  paymentMethod: (0, import_pg_core.text)("payment_method").default("cash"),
  paymentStatus: (0, import_pg_core.text)("payment_status").notNull().default("unpaid"),
  // unpaid|pending|paid|failed|refunded
  cashSelfieUrl: (0, import_pg_core.text)("cash_selfie_url"),
  livenessStatus: (0, import_pg_core.text)("liveness_status").default("not_required"),
  // not_required|pending|passed|failed
  livenessProvider: (0, import_pg_core.text)("liveness_provider"),
  livenessSessionId: (0, import_pg_core.varchar)("liveness_session_id"),
  livenessScore: (0, import_pg_core.real)("liveness_score"),
  livenessVerifiedAt: (0, import_pg_core.timestamp)("liveness_verified_at"),
  // Route selection (set when driver picks fastest/shortest/least-traffic route)
  selectedRouteId: (0, import_pg_core.text)("selected_route_id"),
  selectedRouteDistanceKm: (0, import_pg_core.real)("selected_route_distance_km"),
  actualFare: (0, import_pg_core.real)("actual_fare"),
  routeCurrency: (0, import_pg_core.text)("route_currency").default("ZAR"),
  routeSelectedAt: (0, import_pg_core.timestamp)("route_selected_at"),
  createdAt: (0, import_pg_core.timestamp)("created_at").defaultNow(),
  completedAt: (0, import_pg_core.timestamp)("completed_at")
});
var livenessSessions = (0, import_pg_core.pgTable)("liveness_sessions", {
  id: (0, import_pg_core.varchar)("id").primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
  userId: (0, import_pg_core.varchar)("user_id").notNull().references(() => users.id),
  provider: (0, import_pg_core.text)("provider").notNull().default("mock"),
  status: (0, import_pg_core.text)("status").notNull().default("pending"),
  // pending|passed|failed|expired
  challengeCode: (0, import_pg_core.text)("challenge_code").notNull(),
  selfieUrl: (0, import_pg_core.text)("selfie_url"),
  verifiedPhotoUrl: (0, import_pg_core.text)("verified_photo_url"),
  rideId: (0, import_pg_core.varchar)("ride_id"),
  score: (0, import_pg_core.real)("score"),
  attempts: (0, import_pg_core.integer)("attempts").notNull().default(0),
  maxAttempts: (0, import_pg_core.integer)("max_attempts").notNull().default(3),
  errorReason: (0, import_pg_core.text)("error_reason"),
  expiresAt: (0, import_pg_core.timestamp)("expires_at").notNull(),
  verifiedAt: (0, import_pg_core.timestamp)("verified_at"),
  createdAt: (0, import_pg_core.timestamp)("created_at").defaultNow(),
  updatedAt: (0, import_pg_core.timestamp)("updated_at").defaultNow()
});
var payments = (0, import_pg_core.pgTable)("payments", {
  id: (0, import_pg_core.varchar)("id").primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
  rideId: (0, import_pg_core.varchar)("ride_id").notNull().references(() => rides.id),
  payerUserId: (0, import_pg_core.varchar)("payer_user_id").notNull().references(() => users.id),
  amount: (0, import_pg_core.real)("amount").notNull(),
  method: (0, import_pg_core.text)("method").notNull().default("cash"),
  status: (0, import_pg_core.text)("status").notNull().default("pending"),
  // pending|paid|failed|refunded
  currency: (0, import_pg_core.text)("currency").default("ZAR"),
  provider: (0, import_pg_core.text)("provider"),
  providerRef: (0, import_pg_core.text)("provider_ref"),
  paystackReference: (0, import_pg_core.varchar)("paystack_reference"),
  paystackAuthCode: (0, import_pg_core.text)("paystack_auth_code"),
  paidAt: (0, import_pg_core.timestamp)("paid_at"),
  createdAt: (0, import_pg_core.timestamp)("created_at").defaultNow()
});
var driverApplications = (0, import_pg_core.pgTable)("driver_applications", {
  id: (0, import_pg_core.varchar)("id").primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
  userId: (0, import_pg_core.varchar)("user_id").notNull().references(() => users.id),
  chauffeurId: (0, import_pg_core.varchar)("chauffeur_id").references(() => chauffeurs.id),
  status: (0, import_pg_core.text)("status").notNull().default("pending"),
  // pending|approved|rejected
  notes: (0, import_pg_core.text)("notes"),
  submittedAt: (0, import_pg_core.timestamp)("submitted_at").defaultNow(),
  reviewedAt: (0, import_pg_core.timestamp)("reviewed_at"),
  reviewerAdminId: (0, import_pg_core.varchar)("reviewer_admin_id").references(() => users.id)
});
var documents = (0, import_pg_core.pgTable)("documents", {
  id: (0, import_pg_core.varchar)("id").primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
  userId: (0, import_pg_core.varchar)("user_id").notNull().references(() => users.id),
  applicationId: (0, import_pg_core.varchar)("application_id").references(() => driverApplications.id),
  chauffeurId: (0, import_pg_core.varchar)("chauffeur_id").references(() => chauffeurs.id),
  type: (0, import_pg_core.text)("type").notNull(),
  url: (0, import_pg_core.text)("url").notNull(),
  status: (0, import_pg_core.text)("status").notNull().default("pending"),
  uploadedAt: (0, import_pg_core.timestamp)("uploaded_at").defaultNow(),
  reviewedAt: (0, import_pg_core.timestamp)("reviewed_at"),
  reviewerAdminId: (0, import_pg_core.varchar)("reviewer_admin_id").references(() => users.id)
});
var rideRatings = (0, import_pg_core.pgTable)("ride_ratings", {
  id: (0, import_pg_core.varchar)("id").primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
  rideId: (0, import_pg_core.varchar)("ride_id").notNull().references(() => rides.id),
  clientId: (0, import_pg_core.varchar)("client_id").notNull().references(() => users.id),
  chauffeurId: (0, import_pg_core.varchar)("chauffeur_id").notNull().references(() => chauffeurs.id),
  rating: (0, import_pg_core.integer)("rating").notNull(),
  comment: (0, import_pg_core.text)("comment"),
  createdAt: (0, import_pg_core.timestamp)("created_at").defaultNow()
});
var earnings = (0, import_pg_core.pgTable)("earnings", {
  id: (0, import_pg_core.varchar)("id").primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
  chauffeurId: (0, import_pg_core.varchar)("chauffeur_id").notNull().references(() => chauffeurs.id),
  rideId: (0, import_pg_core.varchar)("ride_id").references(() => rides.id),
  amount: (0, import_pg_core.real)("amount").notNull(),
  commission: (0, import_pg_core.real)("commission").notNull(),
  type: (0, import_pg_core.text)("type"),
  createdAt: (0, import_pg_core.timestamp)("created_at").defaultNow()
});
var withdrawals = (0, import_pg_core.pgTable)("withdrawals", {
  id: (0, import_pg_core.varchar)("id").primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
  chauffeurId: (0, import_pg_core.varchar)("chauffeur_id").notNull().references(() => chauffeurs.id),
  amount: (0, import_pg_core.real)("amount").notNull(),
  status: (0, import_pg_core.text)("status").notNull().default("pending"),
  bankName: (0, import_pg_core.text)("bank_name"),
  accountNumber: (0, import_pg_core.text)("account_number"),
  accountHolder: (0, import_pg_core.text)("account_holder"),
  paystackTransferCode: (0, import_pg_core.varchar)("paystack_transfer_code"),
  paystackRecipientCode: (0, import_pg_core.varchar)("paystack_recipient_code"),
  processedAt: (0, import_pg_core.timestamp)("processed_at"),
  createdAt: (0, import_pg_core.timestamp)("created_at").defaultNow()
});
var messages = (0, import_pg_core.pgTable)("messages", {
  id: (0, import_pg_core.varchar)("id").primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
  rideId: (0, import_pg_core.varchar)("ride_id").notNull().references(() => rides.id),
  senderId: (0, import_pg_core.varchar)("sender_id").notNull().references(() => users.id),
  messageText: (0, import_pg_core.text)("message_text").notNull(),
  createdAt: (0, import_pg_core.timestamp)("created_at").defaultNow()
});
var safetyReports = (0, import_pg_core.pgTable)("safety_reports", {
  id: (0, import_pg_core.varchar)("id").primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
  userId: (0, import_pg_core.varchar)("user_id").notNull().references(() => users.id),
  rideId: (0, import_pg_core.varchar)("ride_id").references(() => rides.id),
  type: (0, import_pg_core.text)("type").notNull(),
  description: (0, import_pg_core.text)("description").notNull(),
  status: (0, import_pg_core.text)("status").notNull().default("open"),
  aiResponse: (0, import_pg_core.text)("ai_response"),
  priority: (0, import_pg_core.text)("priority").default("medium"),
  createdAt: (0, import_pg_core.timestamp)("created_at").defaultNow()
});
var notifications = (0, import_pg_core.pgTable)("notifications", {
  id: (0, import_pg_core.varchar)("id").primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
  userId: (0, import_pg_core.varchar)("user_id").notNull().references(() => users.id),
  title: (0, import_pg_core.text)("title").notNull(),
  body: (0, import_pg_core.text)("body").notNull(),
  type: (0, import_pg_core.text)("type").notNull().default("general"),
  isRead: (0, import_pg_core.boolean)("is_read").default(false),
  createdAt: (0, import_pg_core.timestamp)("created_at").defaultNow()
});
var tripEnquiries = (0, import_pg_core.pgTable)("trip_enquiries", {
  id: (0, import_pg_core.varchar)("id").primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
  rideId: (0, import_pg_core.varchar)("ride_id").notNull().references(() => rides.id),
  userId: (0, import_pg_core.varchar)("user_id").notNull().references(() => users.id),
  message: (0, import_pg_core.text)("message").notNull(),
  adminReply: (0, import_pg_core.text)("admin_reply"),
  status: (0, import_pg_core.text)("status").notNull().default("open"),
  // open | replied | closed
  createdAt: (0, import_pg_core.timestamp)("created_at").defaultNow(),
  repliedAt: (0, import_pg_core.timestamp)("replied_at")
});
var savedCards = (0, import_pg_core.pgTable)("saved_cards", {
  id: (0, import_pg_core.varchar)("id").primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
  userId: (0, import_pg_core.varchar)("user_id").notNull().references(() => users.id),
  paystackAuthCode: (0, import_pg_core.text)("paystack_auth_code").notNull(),
  cardType: (0, import_pg_core.text)("card_type"),
  last4: (0, import_pg_core.varchar)("last4", { length: 4 }),
  expMonth: (0, import_pg_core.varchar)("exp_month", { length: 2 }),
  expYear: (0, import_pg_core.varchar)("exp_year", { length: 4 }),
  bank: (0, import_pg_core.text)("bank"),
  isDefault: (0, import_pg_core.boolean)("is_default").default(false),
  createdAt: (0, import_pg_core.timestamp)("created_at").defaultNow()
});
var walletTransactions = (0, import_pg_core.pgTable)("wallet_transactions", {
  id: (0, import_pg_core.varchar)("id").primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
  userId: (0, import_pg_core.varchar)("user_id").notNull().references(() => users.id),
  type: (0, import_pg_core.text)("type").notNull(),
  amount: (0, import_pg_core.real)("amount").notNull(),
  balanceBefore: (0, import_pg_core.real)("balance_before").notNull(),
  balanceAfter: (0, import_pg_core.real)("balance_after").notNull(),
  reference: (0, import_pg_core.varchar)("reference"),
  description: (0, import_pg_core.text)("description"),
  rideId: (0, import_pg_core.varchar)("ride_id"),
  status: (0, import_pg_core.text)("status").default("completed"),
  createdAt: (0, import_pg_core.timestamp)("created_at").defaultNow()
});
var insertUserSchema = (0, import_drizzle_zod.createInsertSchema)(users).pick({
  username: true,
  password: true,
  name: true,
  phone: true,
  role: true
});
var insertChauffeurSchema = (0, import_drizzle_zod.createInsertSchema)(chauffeurs).pick({
  userId: true,
  carMake: true,
  vehicleModel: true,
  plateNumber: true,
  vehicleType: true,
  carColor: true,
  phone: true,
  passengerCapacity: true,
  luggageCapacity: true
});
var insertRideSchema = (0, import_drizzle_zod.createInsertSchema)(rides).pick({
  clientId: true,
  pickupLat: true,
  pickupLng: true,
  pickupAddress: true,
  dropoffLat: true,
  dropoffLng: true,
  dropoffAddress: true,
  vehicleType: true,
  paymentMethod: true,
  cashSelfieUrl: true,
  livenessStatus: true,
  livenessProvider: true,
  livenessSessionId: true,
  livenessScore: true,
  livenessVerifiedAt: true
});
var insertLivenessSessionSchema = (0, import_drizzle_zod.createInsertSchema)(livenessSessions).pick({
  userId: true,
  provider: true,
  status: true,
  challengeCode: true,
  selfieUrl: true,
  score: true,
  attempts: true,
  maxAttempts: true,
  errorReason: true,
  expiresAt: true,
  verifiedAt: true
});

// server/storage.ts
var dbUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
if (!dbUrl) {
  throw new Error("SUPABASE_DB_URL or DATABASE_URL is not set");
}
console.log(`[Storage] Using DB: ${dbUrl.includes("supabase") ? "SUPABASE \u2705" : "LOCAL \u274C"} | ${dbUrl.replace(/:([^:@]+)@/, ":***@")}`);
var requireSsl = dbUrl.includes("supabase") || dbUrl.includes("neon.tech");
var pool = new import_pg.Pool({
  connectionString: dbUrl,
  ssl: requireSsl ? { rejectUnauthorized: false } : false
});
var db = (0, import_node_postgres.drizzle)(pool);
var DatabaseStorage = class {
  async getUser(id) {
    const [user] = await db.select().from(users).where((0, import_drizzle_orm2.eq)(users.id, id));
    return user;
  }
  async getUserByUsername(username) {
    const normalised = username.toLowerCase().trim();
    const [user] = await db.select().from(users).where((0, import_drizzle_orm2.eq)(users.username, normalised));
    return user;
  }
  async createUser(insertUser) {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }
  async updateUser(id, data) {
    const [user] = await db.update(users).set(data).where((0, import_drizzle_orm2.eq)(users.id, id)).returning();
    return user;
  }
  async getChauffeur(id) {
    const [chauffeur] = await db.select().from(chauffeurs).where((0, import_drizzle_orm2.eq)(chauffeurs.id, id));
    return chauffeur;
  }
  async getChauffeurByUserId(userId) {
    const [chauffeur] = await db.select().from(chauffeurs).where((0, import_drizzle_orm2.eq)(chauffeurs.userId, userId));
    return chauffeur;
  }
  async createChauffeur(data) {
    const [chauffeur] = await db.insert(chauffeurs).values(data).returning();
    return chauffeur;
  }
  async updateChauffeur(id, data) {
    const [chauffeur] = await db.update(chauffeurs).set(data).where((0, import_drizzle_orm2.eq)(chauffeurs.id, id)).returning();
    return chauffeur;
  }
  async deleteChauffeur(id) {
    const deleted = await db.delete(chauffeurs).where((0, import_drizzle_orm2.eq)(chauffeurs.id, id)).returning();
    return deleted.length > 0;
  }
  async getOnlineChauffeurs() {
    return db.select().from(chauffeurs).where((0, import_drizzle_orm2.and)((0, import_drizzle_orm2.eq)(chauffeurs.isOnline, true), (0, import_drizzle_orm2.eq)(chauffeurs.isApproved, true)));
  }
  async getAllChauffeurs() {
    return db.select().from(chauffeurs).orderBy((0, import_drizzle_orm2.desc)(chauffeurs.createdAt));
  }
  async createDriverApplication(data) {
    const [app2] = await db.insert(driverApplications).values(data).returning();
    return app2;
  }
  async getDriverApplication(id) {
    const [app2] = await db.select().from(driverApplications).where((0, import_drizzle_orm2.eq)(driverApplications.id, id));
    return app2;
  }
  async getDriverApplications() {
    return db.select().from(driverApplications).orderBy((0, import_drizzle_orm2.desc)(driverApplications.submittedAt));
  }
  async getDriverApplicationByUserId(userId) {
    const [app2] = await db.select().from(driverApplications).where((0, import_drizzle_orm2.eq)(driverApplications.userId, userId)).orderBy((0, import_drizzle_orm2.desc)(driverApplications.submittedAt));
    return app2;
  }
  async updateDriverApplication(id, data) {
    const [app2] = await db.update(driverApplications).set(data).where((0, import_drizzle_orm2.eq)(driverApplications.id, id)).returning();
    return app2;
  }
  async deleteDriverApplication(id) {
    const deleted = await db.delete(driverApplications).where((0, import_drizzle_orm2.eq)(driverApplications.id, id)).returning();
    return deleted.length > 0;
  }
  async createDocument(data) {
    const [doc] = await db.insert(documents).values(data).returning();
    return doc;
  }
  async getDocumentsByApplication(applicationId) {
    return db.select().from(documents).where((0, import_drizzle_orm2.eq)(documents.applicationId, applicationId)).orderBy((0, import_drizzle_orm2.desc)(documents.uploadedAt));
  }
  async getDocumentsByUser(userId) {
    return db.select().from(documents).where((0, import_drizzle_orm2.eq)(documents.userId, userId)).orderBy((0, import_drizzle_orm2.desc)(documents.uploadedAt));
  }
  async getAllDocuments() {
    return db.select().from(documents).orderBy((0, import_drizzle_orm2.desc)(documents.uploadedAt));
  }
  async updateDocument(id, data) {
    const [doc] = await db.update(documents).set(data).where((0, import_drizzle_orm2.eq)(documents.id, id)).returning();
    return doc;
  }
  async createRide(data) {
    const [ride] = await db.insert(rides).values(data).returning();
    return ride;
  }
  async getRide(id) {
    const [ride] = await db.select().from(rides).where((0, import_drizzle_orm2.eq)(rides.id, id));
    return ride;
  }
  async updateRide(id, data) {
    const [ride] = await db.update(rides).set(data).where((0, import_drizzle_orm2.eq)(rides.id, id)).returning();
    return ride;
  }
  /** Atomically accepts a ride — the UPDATE only fires when the ride is still in an
   *  acceptable state, preventing two drivers from claiming the same trip. */
  async acceptRideAtomic(rideId, chauffeurId) {
    const [ride] = await db.update(rides).set({ chauffeurId, status: "chauffeur_assigned" }).where(
      (0, import_drizzle_orm2.and)(
        (0, import_drizzle_orm2.eq)(rides.id, rideId),
        import_drizzle_orm2.sql`${rides.status} IN ('requested', 'searching')`
      )
    ).returning();
    return ride;
  }
  async getRidesByClient(clientId) {
    return db.select().from(rides).where((0, import_drizzle_orm2.eq)(rides.clientId, clientId)).orderBy((0, import_drizzle_orm2.desc)(rides.createdAt));
  }
  async getRidesByChauffeur(chauffeurId) {
    return db.select().from(rides).where((0, import_drizzle_orm2.eq)(rides.chauffeurId, chauffeurId)).orderBy((0, import_drizzle_orm2.desc)(rides.createdAt));
  }
  async getActiveRides() {
    return db.select().from(rides).orderBy((0, import_drizzle_orm2.desc)(rides.createdAt));
  }
  async getAllRides() {
    return db.select().from(rides).orderBy((0, import_drizzle_orm2.desc)(rides.createdAt));
  }
  async createLivenessSession(data) {
    const [session] = await db.insert(livenessSessions).values(data).returning();
    return session;
  }
  async getLivenessSession(id) {
    const [session] = await db.select().from(livenessSessions).where((0, import_drizzle_orm2.eq)(livenessSessions.id, id));
    return session;
  }
  async getLatestPendingLivenessSessionByUser(userId) {
    const [session] = await db.select().from(livenessSessions).where((0, import_drizzle_orm2.and)((0, import_drizzle_orm2.eq)(livenessSessions.userId, userId), (0, import_drizzle_orm2.eq)(livenessSessions.status, "pending"))).orderBy((0, import_drizzle_orm2.desc)(livenessSessions.createdAt));
    return session;
  }
  async updateLivenessSession(id, data) {
    const safe = { ...data };
    for (const key of ["verifiedAt", "expiresAt", "createdAt", "updatedAt"]) {
      if (safe[key] !== null && safe[key] !== void 0 && !(safe[key] instanceof Date)) {
        safe[key] = new Date(safe[key]);
      }
    }
    const [session] = await db.update(livenessSessions).set({ ...safe, updatedAt: /* @__PURE__ */ new Date() }).where((0, import_drizzle_orm2.eq)(livenessSessions.id, id)).returning();
    return session;
  }
  async createPayment(data) {
    const [payment] = await db.insert(payments).values(data).returning();
    return payment;
  }
  async getAllUsers() {
    return db.select().from(users).orderBy((0, import_drizzle_orm2.desc)(users.createdAt));
  }
  async getAllPayments() {
    return db.select().from(payments).orderBy((0, import_drizzle_orm2.desc)(payments.createdAt));
  }
  async getPaymentsByRide(rideId) {
    return db.select().from(payments).where((0, import_drizzle_orm2.eq)(payments.rideId, rideId)).orderBy((0, import_drizzle_orm2.desc)(payments.createdAt));
  }
  async updatePayment(id, data) {
    const [payment] = await db.update(payments).set(data).where((0, import_drizzle_orm2.eq)(payments.id, id)).returning();
    return payment;
  }
  async createRideRating(data) {
    const [rating] = await db.insert(rideRatings).values(data).returning();
    return rating;
  }
  async getRatingsByChauffeur(chauffeurId) {
    return db.select().from(rideRatings).where((0, import_drizzle_orm2.eq)(rideRatings.chauffeurId, chauffeurId)).orderBy((0, import_drizzle_orm2.desc)(rideRatings.createdAt));
  }
  async getAverageRatingForUser(userId) {
    const chauffeur = await this.getChauffeurByUserId(userId);
    if (!chauffeur) return null;
    const [row] = await db.select({ value: (0, import_drizzle_orm2.avg)(rideRatings.rating) }).from(rideRatings).where((0, import_drizzle_orm2.eq)(rideRatings.chauffeurId, chauffeur.id));
    const value = row?.value ?? null;
    return value;
  }
  async createEarning(data) {
    const [earning] = await db.insert(earnings).values(data).returning();
    return earning;
  }
  async getEarningsByChauffeur(chauffeurId) {
    return db.select().from(earnings).where((0, import_drizzle_orm2.eq)(earnings.chauffeurId, chauffeurId)).orderBy((0, import_drizzle_orm2.desc)(earnings.createdAt));
  }
  async getAllEarnings() {
    return db.select().from(earnings).orderBy((0, import_drizzle_orm2.desc)(earnings.createdAt));
  }
  async createWithdrawal(data) {
    const [withdrawal] = await db.insert(withdrawals).values(data).returning();
    return withdrawal;
  }
  async getWithdrawalsByChauffeur(chauffeurId) {
    return db.select().from(withdrawals).where((0, import_drizzle_orm2.eq)(withdrawals.chauffeurId, chauffeurId)).orderBy((0, import_drizzle_orm2.desc)(withdrawals.createdAt));
  }
  async getAllWithdrawals() {
    return db.select().from(withdrawals).orderBy((0, import_drizzle_orm2.desc)(withdrawals.createdAt));
  }
  async updateWithdrawal(id, data) {
    const [withdrawal] = await db.update(withdrawals).set(data).where((0, import_drizzle_orm2.eq)(withdrawals.id, id)).returning();
    return withdrawal;
  }
  async createMessage(data) {
    const [message] = await db.insert(messages).values(data).returning();
    return message;
  }
  async getMessagesByRide(rideId) {
    return db.select().from(messages).where((0, import_drizzle_orm2.eq)(messages.rideId, rideId)).orderBy(messages.createdAt);
  }
  async createSafetyReport(data) {
    const [report] = await db.insert(safetyReports).values(data).returning();
    return report;
  }
  async getSafetyReportsByUser(userId) {
    return db.select().from(safetyReports).where((0, import_drizzle_orm2.eq)(safetyReports.userId, userId)).orderBy((0, import_drizzle_orm2.desc)(safetyReports.createdAt));
  }
  async getAllSafetyReports() {
    return db.select().from(safetyReports).orderBy((0, import_drizzle_orm2.desc)(safetyReports.createdAt));
  }
  async updateSafetyReport(id, data) {
    const [report] = await db.update(safetyReports).set(data).where((0, import_drizzle_orm2.eq)(safetyReports.id, id)).returning();
    return report;
  }
  async createNotification(data) {
    const [notification] = await db.insert(notifications).values(data).returning();
    return notification;
  }
  async getNotificationsByUser(userId) {
    return db.select().from(notifications).where((0, import_drizzle_orm2.eq)(notifications.userId, userId)).orderBy((0, import_drizzle_orm2.desc)(notifications.createdAt));
  }
  async markNotificationRead(id) {
    const [notification] = await db.update(notifications).set({ isRead: true }).where((0, import_drizzle_orm2.eq)(notifications.id, id)).returning();
    return notification;
  }
  async deleteAllNotificationsByUser(userId) {
    await db.delete(notifications).where((0, import_drizzle_orm2.eq)(notifications.userId, userId));
  }
  async getSavedCard(id) {
    const [card] = await db.select().from(savedCards).where((0, import_drizzle_orm2.eq)(savedCards.id, id));
    return card;
  }
  async getSavedCardsByUser(userId) {
    return db.select().from(savedCards).where((0, import_drizzle_orm2.eq)(savedCards.userId, userId)).orderBy((0, import_drizzle_orm2.desc)(savedCards.createdAt));
  }
  async createSavedCard(data) {
    const [card] = await db.insert(savedCards).values(data).returning();
    return card;
  }
  async updateSavedCard(id, data) {
    const [card] = await db.update(savedCards).set(data).where((0, import_drizzle_orm2.eq)(savedCards.id, id)).returning();
    return card;
  }
  async deleteSavedCard(id) {
    await db.delete(savedCards).where((0, import_drizzle_orm2.eq)(savedCards.id, id));
  }
  async createWalletTransaction(data) {
    const [tx] = await db.insert(walletTransactions).values(data).returning();
    return tx;
  }
  async getWalletTransactions(userId) {
    return db.select().from(walletTransactions).where((0, import_drizzle_orm2.eq)(walletTransactions.userId, userId)).orderBy((0, import_drizzle_orm2.desc)(walletTransactions.createdAt)).limit(50);
  }
  async updateWithdrawalByTransferCode(transferCode, data) {
    const [w] = await db.update(withdrawals).set(data).where((0, import_drizzle_orm2.eq)(withdrawals.paystackTransferCode, transferCode)).returning();
    return w;
  }
  async createTripEnquiry(data) {
    const [enquiry] = await db.insert(tripEnquiries).values(data).returning();
    return enquiry;
  }
  async getAllTripEnquiries() {
    return db.select().from(tripEnquiries).orderBy((0, import_drizzle_orm2.desc)(tripEnquiries.createdAt));
  }
  async replyToTripEnquiry(id, adminReply) {
    const [enquiry] = await db.update(tripEnquiries).set({ adminReply, status: "replied", repliedAt: /* @__PURE__ */ new Date() }).where((0, import_drizzle_orm2.eq)(tripEnquiries.id, id)).returning();
    return enquiry;
  }
};
var storage = new DatabaseStorage();

// server/db.ts
var import_node_postgres2 = require("drizzle-orm/node-postgres");
var import_pg2 = require("pg");
var dbUrl2 = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
if (!dbUrl2) {
  throw new Error("SUPABASE_DB_URL or DATABASE_URL must be set.");
}
var isSupabase = dbUrl2.includes("supabase");
var maskedUrl = dbUrl2.replace(/:([^:@]+)@/, ":***@");
console.log(`[DB] Connecting to: ${isSupabase ? "SUPABASE \u2705" : "LOCAL/OTHER \u274C"}`);
console.log(`[DB] Full URL: ${maskedUrl}`);
var requireSsl2 = dbUrl2.includes("supabase") || dbUrl2.includes("neon.tech");
var pool2 = new import_pg2.Pool({
  connectionString: dbUrl2,
  ssl: requireSsl2 ? { rejectUnauthorized: false } : false,
  max: 5,
  idleTimeoutMillis: 1e4,
  connectionTimeoutMillis: 5e3
});
var db2 = (0, import_node_postgres2.drizzle)(pool2, { schema: schema_exports });

// server/routes.ts
var import_drizzle_orm4 = require("drizzle-orm");

// server/livenessPhotoService.ts
var import_drizzle_orm3 = require("drizzle-orm");
var SUPABASE_URL = process.env.SUPABASE_URL || "https://zzwkieiktbhptvgsqerd.supabase.co";
var SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
async function uploadLivenessPhoto(params) {
  const {
    sessionId,
    userId,
    rideId,
    photoBase64,
    mimeType = "image/jpeg",
    photoType
  } = params;
  const base64Data = photoBase64.replace(/^data:image\/\w+;base64,/, "");
  const buffer = Buffer.from(base64Data, "base64");
  const bucket = photoType === "cash_selfie" ? "ride-photos" : "liveness-photos";
  const ext = mimeType.split("/")[1];
  const timestamp2 = Date.now();
  const safeSession = sessionId.replace(/[^a-zA-Z0-9_-]/g, "");
  const safeUser = userId.replace(/[^a-zA-Z0-9_-]/g, "");
  const storagePath = photoType === "cash_selfie" ? `rides/${rideId ?? safeSession}/${safeUser}_cash_selfie_${timestamp2}.${ext}` : `sessions/${safeSession}/${safeUser}_liveness_${timestamp2}.${ext}`;
  const uploadRes = await fetch(
    `${SUPABASE_URL}/storage/v1/object/${bucket}/${storagePath}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        apikey: SUPABASE_SERVICE_KEY,
        "Content-Type": mimeType,
        "x-upsert": "false"
      },
      body: buffer
    }
  );
  if (!uploadRes.ok) {
    const errText = await uploadRes.text().catch(() => uploadRes.statusText);
    console.error("[livenessPhotoService] upload error:", uploadRes.status, errText);
    return { success: false, error: errText };
  }
  const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${storagePath}`;
  try {
    if (photoType === "liveness") {
      await db2.update(livenessSessions).set({
        verifiedPhotoUrl: storagePath,
        rideId: rideId ?? null,
        updatedAt: /* @__PURE__ */ new Date()
      }).where((0, import_drizzle_orm3.eq)(livenessSessions.id, sessionId));
    } else {
      await db2.update(rides).set({ cashSelfieUrl: storagePath }).where((0, import_drizzle_orm3.eq)(rides.id, rideId ?? sessionId));
    }
  } catch (dbErr) {
    console.warn("[livenessPhotoService] DB update error:", dbErr.message);
  }
  return { success: true, storagePath, publicUrl };
}
async function getAdminSignedUrl(bucket, storagePath, expiresInSeconds = 3600) {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/storage/v1/object/sign/${bucket}/${storagePath}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
          apikey: SUPABASE_SERVICE_KEY,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ expiresIn: expiresInSeconds })
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data.signedURL ? `${SUPABASE_URL}/storage/v1${data.signedURL}` : null;
  } catch {
    return null;
  }
}

// server/luxuryPricingEngine.ts
var VEHICLE_CATEGORIES = {
  budget: { name: "Budget", pricePerKm: 7, baseFare: 50, examples: "Toyota Corolla, Toyota Quest" },
  luxury: { name: "Luxury", pricePerKm: 13, baseFare: 100, examples: "BMW 3 Series, Mercedes C Class" },
  business: { name: "Business Class", pricePerKm: 35, baseFare: 150, examples: "BMW 5 Series, Mercedes E Class" },
  van: { name: "Van", pricePerKm: 13, baseFare: 120, examples: "Hyundai H1, Mercedes Vito, Staria" },
  luxury_van: { name: "Luxury Van", pricePerKm: 35, baseFare: 200, examples: "Mercedes V Class" }
};
var PRICING_CONFIG = {
  lateNightPremiumMultiplier: 1.3,
  commissionRate: 0.15
};
function calculatePrice(distanceKm, categoryId, options) {
  const category = VEHICLE_CATEGORIES[categoryId] || VEHICLE_CATEGORIES.budget;
  const baseFare = category.baseFare;
  const distanceFare = distanceKm * category.pricePerKm;
  let subtotal = baseFare + distanceFare;
  let lateNightPremium = 0;
  if (options?.isLateNight) {
    lateNightPremium = subtotal * (PRICING_CONFIG.lateNightPremiumMultiplier - 1);
    subtotal += lateNightPremium;
  }
  return {
    baseFare: Math.round(baseFare),
    distanceFare: Math.round(distanceFare),
    totalPrice: Math.round(subtotal),
    pricePerKm: category.pricePerKm,
    distanceKm: Math.round(distanceKm * 10) / 10,
    category: category.name,
    currency: "ZAR",
    lateNightPremium: Math.round(lateNightPremium)
  };
}
function calculateChauffeurEarnings(totalPrice) {
  const commission = totalPrice * PRICING_CONFIG.commissionRate;
  const chauffeurEarnings = totalPrice - commission;
  return {
    totalPrice,
    commission: Math.round(commission),
    chauffeurEarnings: Math.round(chauffeurEarnings)
  };
}
function getVehicleCategories() {
  return VEHICLE_CATEGORIES;
}
function getPricingConfig() {
  return { ...PRICING_CONFIG, categories: VEHICLE_CATEGORIES };
}

// server/auth.ts
var import_jsonwebtoken = __toESM(require("jsonwebtoken"));
var JWT_ISSUER = "a2b-lift";
function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not set");
  }
  return secret;
}
function signAccessToken(claims) {
  return import_jsonwebtoken.default.sign(claims, getJwtSecret(), {
    algorithm: "HS256",
    expiresIn: "7d",
    issuer: JWT_ISSUER
  });
}
function verifyAccessToken(token) {
  const decoded = import_jsonwebtoken.default.verify(token, getJwtSecret(), {
    algorithms: ["HS256"],
    issuer: JWT_ISSUER
  });
  return decoded;
}

// server/auth-middleware.ts
function extractBearer(req) {
  const header = req.header("authorization") || req.header("Authorization");
  if (!header) return null;
  const [type, token] = header.split(" ");
  if (type?.toLowerCase() !== "bearer" || !token) return null;
  return token;
}
function authOptional(req, _res, next) {
  try {
    const token = extractBearer(req) || req.cookies?.a2b_token || null;
    if (token) {
      req.auth = verifyAccessToken(token);
    }
  } catch {
  }
  next();
}
function requireAuth(req, res, next) {
  const token = extractBearer(req) || req.cookies?.a2b_token || null;
  if (!token) return res.status(401).json({ message: "Unauthorized" });
  try {
    req.auth = verifyAccessToken(token);
    return next();
  } catch {
    return res.status(401).json({ message: "Unauthorized" });
  }
}
function requireRole(roles) {
  return (req, res, next) => {
    if (!req.auth) return res.status(401).json({ message: "Unauthorized" });
    if (!roles.includes(req.auth.role)) {
      return res.status(403).json({ message: "Forbidden" });
    }
    return next();
  };
}

// server/external-api-service.ts
var ExternalApiService = class {
  config;
  constructor() {
    const baseUrl = process.env.EXTERNAL_API_URL || "http://103.154.2.122";
    const apiKey = process.env.EXTERNAL_API_KEY;
    this.config = {
      baseUrl: baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl,
      timeout: parseInt(process.env.EXTERNAL_API_TIMEOUT || "30000", 10),
      apiKey
    };
  }
  /**
   * Generic method to make requests to the external API
   */
  async request(endpoint, options = {}) {
    try {
      const url = `${this.config.baseUrl}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;
      const headers = {
        "Content-Type": "application/json",
        ...options.headers
      };
      if (this.config.apiKey) {
        headers["Authorization"] = `Bearer ${this.config.apiKey}`;
        headers["X-API-Key"] = this.config.apiKey;
      }
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);
      const response = await fetch(url, {
        method: options.method || "GET",
        headers,
        body: options.body ? JSON.stringify(options.body) : void 0,
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        return {
          success: false,
          error: data.message || `HTTP ${response.status}`,
          statusCode: response.status
        };
      }
      return {
        success: true,
        data,
        statusCode: response.status
      };
    } catch (error) {
      if (error.name === "AbortError") {
        return {
          success: false,
          error: "Request timeout"
        };
      }
      return {
        success: false,
        error: error.message || "Unknown error"
      };
    }
  }
  /**
   * Health check - test connection to external API
   */
  async healthCheck() {
    return this.request("/health", { method: "GET" });
  }
  /**
   * Get API status/info
   */
  async getStatus() {
    return this.request("/status", { method: "GET" });
  }
  /**
   * Generic GET request
   */
  async get(endpoint, headers) {
    return this.request(endpoint, { method: "GET", headers });
  }
  /**
   * Generic POST request
   */
  async post(endpoint, body, headers) {
    return this.request(endpoint, { method: "POST", body, headers });
  }
  /**
   * Generic PUT request
   */
  async put(endpoint, body, headers) {
    return this.request(endpoint, { method: "PUT", body, headers });
  }
  /**
   * Generic DELETE request
   */
  async delete(endpoint, headers) {
    return this.request(endpoint, { method: "DELETE", headers });
  }
};
var externalApiService = new ExternalApiService();

// server/routes.ts
var RIDE_MATCH_RADIUS_KM = 25;
var CHAUFFEUR_LOCATION_STALE_WINDOW_MS = 10 * 60 * 1e3;
function hasFreshChauffeurLocation(chauffeur) {
  if (chauffeur.lat == null || chauffeur.lng == null) return false;
  if (!chauffeur.locationUpdatedAt) return true;
  const timestamp2 = new Date(chauffeur.locationUpdatedAt).getTime();
  if (!Number.isFinite(timestamp2)) return true;
  return Date.now() - timestamp2 <= CHAUFFEUR_LOCATION_STALE_WINDOW_MS;
}
async function sendExpoPushNotification(tokens, title, body, data, options) {
  const urgent = options?.urgent ?? false;
  const channelId = options?.channelId || (urgent ? "ride-alerts" : void 0);
  const messages2 = tokens.filter((t) => t && t.startsWith("ExponentPushToken[")).map((to) => ({
    to,
    sound: "default",
    title,
    body,
    data: data || {},
    badge: urgent ? 1 : void 0,
    priority: urgent ? "high" : "default",
    ttl: urgent ? 0 : void 0,
    channelId,
    interruptionLevel: urgent ? "time-sensitive" : void 0,
    android: channelId ? { channelId, sound: "default", priority: urgent ? "max" : "high" } : void 0
  }));
  if (messages2.length === 0) return;
  try {
    await import_axios.default.post("https://exp.host/--/api/v2/push/send", messages2, {
      headers: { "Content-Type": "application/json", Accept: "application/json", "Accept-Encoding": "gzip, deflate" },
      timeout: 5e3
    });
  } catch (e) {
    console.error("[push] Failed to send Expo push notification:", e.message);
  }
}
function generateAIResponse(type, description) {
  const responses = {
    safety: [
      "We take your safety seriously. Your report has been logged and our safety team has been notified immediately. If you are in immediate danger, please call emergency services (10111). We will follow up within 24 hours.",
      "Thank you for reporting this safety concern. A safety specialist has been assigned to review your case. Please stay in a safe location. Emergency contacts have been alerted."
    ],
    complaint: [
      "We apologize for the inconvenience. Your complaint has been recorded and will be reviewed by our quality assurance team within 24 hours. We strive to maintain the highest standards of service.",
      "Your feedback is important to us. This complaint has been escalated to our management team for immediate review. You may be eligible for a ride credit pending investigation."
    ],
    emergency: [
      "EMERGENCY ALERT: Your report has been flagged as urgent. Our emergency response team has been notified. If you are in immediate danger, please call 10111 (police) or 10177 (ambulance). Your GPS location has been logged.",
      "This emergency has been escalated to the highest priority. Safety team and local authorities will be contacted. Please remain calm and stay connected. Your location is being tracked for your safety."
    ]
  };
  const options = responses[type] || responses.complaint;
  void description;
  return options[Math.floor(Math.random() * options.length)];
}
function setAuthCookie(res, token) {
  const isProd = process.env.NODE_ENV === "production";
  res.cookie("a2b_token", token, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60 * 1e3
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
function getAppBaseUrl(req) {
  if (process.env.REPLIT_DEV_DOMAIN) {
    return `https://${process.env.REPLIT_DEV_DOMAIN}`;
  }
  if (process.env.RAILWAY_PUBLIC_DOMAIN) {
    return `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
  }
  if (process.env.PAYSTACK_CALLBACK_URL) {
    try {
      const u = new URL(process.env.PAYSTACK_CALLBACK_URL);
      return u.origin;
    } catch {
      return process.env.PAYSTACK_CALLBACK_URL;
    }
  }
  if (req) {
    const proto = req.header("x-forwarded-proto") || req.protocol || "https";
    const host = req.header("x-forwarded-host") || req.get("host") || "";
    return `${proto}://${host}`;
  }
  return "https://api-production-0783.up.railway.app";
}
function getLivenessProvider() {
  const raw = (process.env.LIVENESS_PROVIDER || "mock").toLowerCase().trim();
  return raw === "smile_id" ? "smile_id" : "mock";
}
function buildChallengeCode() {
  const pool3 = ["BLINK", "TURN_LEFT", "TURN_RIGHT", "SMILE"];
  const first = pool3[Math.floor(Math.random() * pool3.length)];
  const second = pool3[Math.floor(Math.random() * pool3.length)];
  return `${first}-${second}`;
}
function challengeLabel(code) {
  const labels = {
    BLINK: "Blink your eyes",
    TURN_LEFT: "Turn your face left",
    TURN_RIGHT: "Turn your face right",
    SMILE: "Give a clear smile"
  };
  return code.split("-").map((part) => labels[part] || part).join(" then ");
}
function isAllowedSelfieUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    if (!["https:"].includes(parsed.protocol)) return false;
    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    if (supabaseUrl) {
      const supabaseHost = new URL(supabaseUrl).host;
      if (parsed.host === supabaseHost) return true;
    }
    return parsed.host.endsWith("supabase.co");
  } catch {
    return false;
  }
}
async function runMockSelfieQualityCheck(selfieUrl, faceData, challenge) {
  if (!isAllowedSelfieUrl(selfieUrl)) {
    return { passed: false, score: 0.05, reason: "Selfie URL is not from a trusted storage domain." };
  }
  if (faceData) {
    const { leftEyeOpenProbability, rightEyeOpenProbability, smilingProbability, yawAngle, rollAngle, bounds } = faceData;
    const faceWidth = bounds.width;
    const faceHeight = bounds.height;
    if (faceWidth < 80 || faceHeight < 80) {
      return { passed: false, score: 0.1, reason: "Face too small or too far. Move closer to the camera." };
    }
    if (faceWidth > 900 || faceHeight > 900) {
      return { passed: false, score: 0.1, reason: "Too close to the camera. Step back slightly." };
    }
    if (Math.abs(rollAngle) > 30) {
      return { passed: false, score: 0.2, reason: "Please keep your head level (don't tilt sideways)." };
    }
    const ch = challenge || "look_straight";
    if (ch === "blink") {
      if (leftEyeOpenProbability > 0.35 || rightEyeOpenProbability > 0.35) {
        return { passed: false, score: 0.35, reason: "Blink not detected. Please blink slowly with both eyes." };
      }
    } else if (ch === "smile") {
      if (smilingProbability < 0.65) {
        return { passed: false, score: 0.35, reason: "Smile not detected. Please smile naturally." };
      }
    } else if (ch === "turn_left") {
      if (yawAngle > -12) {
        return { passed: false, score: 0.35, reason: "Please turn your head slowly to the left." };
      }
    } else if (ch === "turn_right") {
      if (yawAngle < 12) {
        return { passed: false, score: 0.35, reason: "Please turn your head slowly to the right." };
      }
    } else {
      if (Math.abs(yawAngle) > 20) {
        return { passed: false, score: 0.3, reason: "Please look straight into the camera." };
      }
    }
    const sizeScore = Math.min(faceWidth / 220, 1) * 0.3;
    const rollScore = (1 - Math.min(Math.abs(rollAngle) / 30, 1)) * 0.2;
    const challengeScore = 0.5;
    const total = Math.min(sizeScore + rollScore + challengeScore, 1);
    return { passed: true, score: parseFloat(total.toFixed(2)) };
  }
  return {
    passed: false,
    score: 0,
    reason: "No face detection data received. Please use the guided liveness camera."
  };
}
async function registerRoutes(app2) {
  const httpServer = (0, import_node_http.createServer)(app2);
  const SUPABASE_SERVICE_KEY_CONFIGURED = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
  app2.use("/api", authOptional);
  const io = new import_socket.Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });
  io.on("connection", (socket) => {
    console.log("Socket connected:", socket.id);
    socket.on("chauffeur:register", (data) => {
      if (data?.chauffeurId) {
        socket.data.chauffeurId = data.chauffeurId;
      }
    });
    socket.on("chauffeur:location", async (data) => {
      const { chauffeurId, lat, lng } = data;
      if (chauffeurId) {
        socket.data.chauffeurId = chauffeurId;
        await storage.updateChauffeur(chauffeurId, {
          lat,
          lng,
          locationUpdatedAt: /* @__PURE__ */ new Date()
        });
        io.emit("location:update", { chauffeurId, lat, lng });
      }
    });
    socket.on("ride:request", async (data) => {
      io.emit("ride:new", data);
    });
    socket.on("chat:message", async (data) => {
      io.emit("chat:newMessage", data);
    });
    socket.on("disconnect", () => {
      console.log("Socket disconnected:", socket.id);
    });
  });
  app2.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: (/* @__PURE__ */ new Date()).toISOString() });
  });
  function haversine(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
  function getUserFirstName(user, fallback = "Rider") {
    const candidates = [user?.name, user?.username].filter((value) => typeof value === "string" && value.trim().length > 0).map((value) => value.trim());
    for (const candidate of candidates) {
      const normalized = candidate.includes("@") ? candidate.split("@")[0] : candidate;
      const first = normalized.replace(/[._-]+/g, " ").split(/\s+/).find(Boolean);
      if (!first) continue;
      const lowered = first.toLowerCase();
      if (["a2b", "client", "rider", "user", "oauth"].includes(lowered)) continue;
      return first.charAt(0).toUpperCase() + first.slice(1);
    }
    return fallback;
  }
  let clientRatingsReady = null;
  function ensureClientRatingsTable() {
    if (!clientRatingsReady) {
      clientRatingsReady = (async () => {
        await pool2.query(`
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
        await pool2.query(`
          CREATE UNIQUE INDEX IF NOT EXISTS idx_client_ratings_ride_chauffeur_unique
          ON client_ratings (ride_id, chauffeur_id)
        `);
        await pool2.query(`
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
  app2.post("/api/auth/register", async (req, res) => {
    try {
      const { username, password, name, phone, role } = req.body;
      if (!username || !password || !name) {
        return res.status(400).json({ message: "Email, password, and name are required" });
      }
      const email = username.trim().toLowerCase();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ message: "Please enter a valid email address" });
      }
      const existing = await storage.getUserByUsername(email);
      if (existing) {
        return res.status(400).json({ message: "An account with this email already exists" });
      }
      const hashedPassword = await import_bcryptjs.default.hash(password, 10);
      const user = await storage.createUser({
        username: email,
        password: hashedPassword,
        name: name.trim(),
        phone: phone ? phone.trim() : null,
        role: role || "client"
      });
      const token = signAccessToken({ sub: user.id, role: user.role, email: user.username, name: user.name });
      setAuthCookie(res, token);
      const { password: _pw, ...safeUser } = user;
      return res.json({ user: safeUser, accessToken: token });
    } catch (error) {
      if (error.code === "23505") {
        return res.status(400).json({ message: "An account with this email already exists" });
      }
      if (error.code === "42P01") {
        return res.status(500).json({ message: "Database table not found. Please run: npm run db:push" });
      }
      return res.status(500).json({ message: error.message || "Registration failed. Please try again." });
    }
  });
  app2.post("/api/auth/login", async (req, res) => {
    try {
      const { username, password } = req.body;
      const user = await storage.getUserByUsername(username);
      if (!user) {
        return res.status(401).json({ message: "Invalid credentials" });
      }
      const valid = await import_bcryptjs.default.compare(password, user.password);
      if (!valid) {
        return res.status(401).json({ message: "Invalid credentials" });
      }
      const token = signAccessToken({ sub: user.id, role: user.role, email: user.username, name: user.name });
      setAuthCookie(res, token);
      const { password: _pw, ...safeUser } = user;
      return res.json({ user: safeUser, accessToken: token });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/auth/logout", async (_req, res) => {
    res.clearCookie("a2b_token", { path: "/" });
    return res.json({ ok: true });
  });
  app2.get("/api/auth/me", requireAuth, async (req, res) => {
    const user = await storage.getUser(req.auth.sub);
    if (!user) return res.status(404).json({ message: "User not found" });
    const { password: _pw, ...safeUser } = user;
    return res.json(safeUser);
  });
  const GOOGLE_KEY = process.env.GOOGLE_API_KEY || "";
  const NOMINATIM_BASE_URL = "https://nominatim.openstreetmap.org";
  const MAPS_USER_AGENT = "A2B-LIFT/1.0 (support@a2blift.app)";
  const DIRECTIONS_CACHE_TTL_MS = 5 * 60 * 1e3;
  const DIRECTIONS_CACHE_MAX_ENTRIES = 250;
  const directionsCache = /* @__PURE__ */ new Map();
  async function fetchMapsJson(url) {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "Accept-Language": "en-ZA,en;q=0.9",
        "User-Agent": MAPS_USER_AGENT
      }
    });
    return response.json();
  }
  function normalizeCoordinate(raw) {
    const value = Number(raw);
    if (!Number.isFinite(value)) return null;
    return Number(value.toFixed(4));
  }
  function buildDirectionsCacheKey(originLat, originLng, destLat, destLng) {
    const normalized = [originLat, originLng, destLat, destLng].map(normalizeCoordinate);
    if (normalized.some((value) => value == null)) return null;
    return normalized.join(":");
  }
  function getDirectionsCacheEntry(cacheKey) {
    const cached = directionsCache.get(cacheKey);
    if (!cached) return null;
    if (cached.expiresAt <= Date.now()) {
      directionsCache.delete(cacheKey);
      return null;
    }
    return cached.payload;
  }
  function setDirectionsCacheEntry(cacheKey, payload) {
    directionsCache.set(cacheKey, {
      expiresAt: Date.now() + DIRECTIONS_CACHE_TTL_MS,
      payload
    });
    if (directionsCache.size <= DIRECTIONS_CACHE_MAX_ENTRIES) return;
    for (const [key, entry] of directionsCache) {
      if (entry.expiresAt <= Date.now()) {
        directionsCache.delete(key);
      }
    }
    while (directionsCache.size > DIRECTIONS_CACHE_MAX_ENTRIES) {
      const oldestKey = directionsCache.keys().next().value;
      if (!oldestKey) break;
      directionsCache.delete(oldestKey);
    }
  }
  function formatNominatimAddress(address, fallbackDisplayName) {
    const primary = [address?.house_number, address?.road].filter(Boolean).join(" ").trim();
    const locality = [
      address?.suburb,
      address?.city || address?.town || address?.village,
      address?.state
    ].filter(Boolean).join(", ").trim();
    const description = [primary, locality].filter(Boolean).join(", ") || fallbackDisplayName || "";
    return {
      description,
      mainText: primary || fallbackDisplayName?.split(",")[0] || "Pinned location",
      secondaryText: locality || fallbackDisplayName?.split(",").slice(1).join(", ").trim() || "South Africa"
    };
  }
  async function nominatimSearch(query, limit = 6) {
    const url = `${NOMINATIM_BASE_URL}/search?format=jsonv2&addressdetails=1&limit=${limit}&countrycodes=za&q=${encodeURIComponent(query)}`;
    const results = await fetchMapsJson(url);
    if (!Array.isArray(results)) return [];
    return results.map((result) => {
      const formatted = formatNominatimAddress(result.address, result.display_name);
      return {
        placeId: `nominatim:${result.place_id}`,
        description: formatted.description || result.display_name,
        mainText: formatted.mainText,
        secondaryText: formatted.secondaryText,
        lat: result.lat ? Number(result.lat) : null,
        lng: result.lon ? Number(result.lon) : null
      };
    });
  }
  async function nominatimReverse(lat, lng) {
    const url = `${NOMINATIM_BASE_URL}/reverse?format=jsonv2&addressdetails=1&lat=${encodeURIComponent(String(lat))}&lon=${encodeURIComponent(String(lng))}&zoom=18`;
    const result = await fetchMapsJson(url);
    if (!result || !result.address) return null;
    const formatted = formatNominatimAddress(result.address, result.display_name);
    return {
      placeId: `nominatim:${result.place_id || `${lat},${lng}`}`,
      description: formatted.description || result.display_name,
      mainText: formatted.mainText,
      secondaryText: formatted.secondaryText,
      lat: parseFloat(String(lat)),
      lng: parseFloat(String(lng))
    };
  }
  app2.get("/api/geocode", async (req, res) => {
    try {
      const address = req.query.address;
      if (!address) return res.status(400).json({ message: "Address is required" });
      if (GOOGLE_KEY) {
        const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&components=country:ZA&key=${GOOGLE_KEY}`;
        const r = await fetchMapsJson(url);
        if (r.status === "OK" && r.results.length > 0) {
          const loc = r.results[0].geometry.location;
          return res.json({ lat: loc.lat, lng: loc.lng });
        }
        console.warn("[maps] Google geocode fallback engaged:", r.status || "unknown");
      }
      const osmResults = await nominatimSearch(address, 1);
      if (osmResults.length > 0 && osmResults[0].lat != null && osmResults[0].lng != null) {
        return res.json({ lat: osmResults[0].lat, lng: osmResults[0].lng });
      }
      return res.status(404).json({ message: "Location not found" });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/places/autocomplete", async (req, res) => {
    try {
      const input = req.query.input;
      const sessionToken = typeof req.query.sessionToken === "string" ? req.query.sessionToken : typeof req.query.sessiontoken === "string" ? req.query.sessiontoken : "";
      if (!input || input.trim().length < 2) return res.json({ predictions: [] });
      if (GOOGLE_KEY) {
        const tokenQuery = sessionToken ? `&sessiontoken=${encodeURIComponent(sessionToken)}` : "";
        const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(input)}&components=country:za&language=en${tokenQuery}&key=${GOOGLE_KEY}`;
        const r = await fetchMapsJson(url);
        const mappedPredictions = Array.isArray(r.predictions) ? r.predictions.slice(0, 6).map((p) => ({
          placeId: p.place_id,
          description: p.description,
          mainText: p.structured_formatting?.main_text || p.description.split(",")[0],
          secondaryText: p.structured_formatting?.secondary_text || "",
          lat: null,
          lng: null
        })) : [];
        if (r.status === "OK" && r.predictions.length > 0) {
          return res.json({ predictions: mappedPredictions });
        }
        if (input.trim().length >= 3) {
          const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(input)}&components=country:ZA&key=${GOOGLE_KEY}`;
          const geocodeResponse = await fetchMapsJson(geocodeUrl);
          if (geocodeResponse.status === "OK" && Array.isArray(geocodeResponse.results) && geocodeResponse.results.length > 0) {
            return res.json({
              predictions: geocodeResponse.results.slice(0, 5).map((result) => ({
                placeId: result.place_id,
                description: result.formatted_address,
                mainText: result.address_components?.[0]?.long_name || result.formatted_address.split(",")[0],
                secondaryText: result.formatted_address.split(",").slice(1).join(", ").trim(),
                lat: result.geometry?.location?.lat ?? null,
                lng: result.geometry?.location?.lng ?? null
              }))
            });
          }
        }
        console.warn("[maps] Google autocomplete fallback engaged:", r.status || "unknown");
      }
      const osmPredictions = await nominatimSearch(input, 6);
      return res.json({ predictions: osmPredictions });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/places/details", async (req, res) => {
    try {
      const placeId = req.query.placeId;
      const sessionToken = typeof req.query.sessionToken === "string" ? req.query.sessionToken : typeof req.query.sessiontoken === "string" ? req.query.sessiontoken : "";
      if (!placeId) return res.status(400).json({ message: "placeId is required" });
      if (!GOOGLE_KEY) return res.status(500).json({ message: "Google Maps API key not configured" });
      const tokenQuery = sessionToken ? `&sessiontoken=${encodeURIComponent(sessionToken)}` : "";
      const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=geometry,formatted_address,name${tokenQuery}&key=${GOOGLE_KEY}`;
      const r = await (await fetch(url)).json();
      if (r.status === "OK") {
        const loc = r.result.geometry.location;
        return res.json({ lat: loc.lat, lng: loc.lng, address: r.result.formatted_address });
      }
      return res.status(404).json({ message: "Place not found" });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/places/reverse", async (req, res) => {
    try {
      const { lat, lng } = req.query;
      if (!lat || !lng) return res.status(400).json({ message: "lat and lng are required" });
      if (GOOGLE_KEY) {
        const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${GOOGLE_KEY}`;
        const r = await fetchMapsJson(url);
        if (r.status === "OK" && r.results.length > 0) {
          const best = r.results[0];
          const components = best.address_components;
          const get = (type) => components.find((c) => c.types.includes(type))?.long_name || "";
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
            lat: parseFloat(lat),
            lng: parseFloat(lng)
          });
        }
        console.warn("[maps] Google reverse geocode fallback engaged:", r.status || "unknown");
      }
      const osmResult = await nominatimReverse(lat, lng);
      if (osmResult) return res.json(osmResult);
      return res.status(404).json({ message: "Location not found" });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/directions", async (req, res) => {
    try {
      const originLat = typeof req.query.originLat === "string" ? req.query.originLat : "";
      const originLng = typeof req.query.originLng === "string" ? req.query.originLng : "";
      const destLat = typeof req.query.destLat === "string" ? req.query.destLat : "";
      const destLng = typeof req.query.destLng === "string" ? req.query.destLng : "";
      if (!originLat || !originLng || !destLat || !destLng) {
        return res.status(400).json({ message: "Origin and destination coordinates are required" });
      }
      const apiKey = process.env.GOOGLE_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ message: "Google Maps API key not configured" });
      }
      const cacheKey = buildDirectionsCacheKey(originLat, originLng, destLat, destLng);
      if (cacheKey) {
        const cached = getDirectionsCacheEntry(cacheKey);
        if (cached) {
          return res.json(cached);
        }
      }
      const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${originLat},${originLng}&destination=${destLat},${destLng}&alternatives=true&key=${apiKey}`;
      const response = await fetch(url);
      const data = await response.json();
      if (data.status === "OK" && data.routes?.length > 0) {
        const parseRoute = (route, idx) => {
          const leg = route.legs[0];
          const steps = (leg.steps || []).map((step) => ({
            instruction: step.html_instructions.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim(),
            distance: step.distance?.text || "",
            duration: step.duration?.text || "",
            endLat: step.end_location?.lat,
            endLng: step.end_location?.lng,
            maneuver: step.maneuver || "straight"
          }));
          return {
            polyline: route.overview_polyline.points,
            distanceKm: leg.distance.value / 1e3,
            distanceText: leg.distance.text,
            durationMin: Math.ceil(leg.duration.value / 60),
            durationText: leg.duration.text,
            summary: route.summary || `Route ${idx + 1}`,
            steps
          };
        };
        const primary = parseRoute(data.routes[0], 0);
        const alternatives = data.routes.map((r, i) => parseRoute(r, i));
        const payload = { ...primary, alternatives };
        if (cacheKey) {
          setDirectionsCacheEntry(cacheKey, payload);
        }
        return res.json(payload);
      }
      return res.status(404).json({ message: "No route found" });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/users", requireAuth, requireRole(["admin"]), async (_req, res) => {
    try {
      const allUsers = await db2.select().from(users).orderBy((0, import_drizzle_orm4.desc)(users.createdAt));
      return res.json(allUsers);
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/users/:id", async (req, res) => {
    try {
      const user = await storage.getUser(req.params.id);
      if (!user) return res.status(404).json({ message: "User not found" });
      const { password: _pw, ...safeUser } = user;
      return res.json(safeUser);
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.put("/api/users/:id", async (req, res) => {
    try {
      const user = await storage.updateUser(req.params.id, req.body);
      if (!user) return res.status(404).json({ message: "User not found" });
      const { password: _pw, ...safeUser } = user;
      return res.json(safeUser);
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.put("/api/users/:id/push-token", requireAuth, async (req, res) => {
    try {
      if (req.auth.sub !== req.params.id) {
        const caller = await storage.getUser(req.auth.sub);
        if (caller?.role !== "admin") {
          return res.status(403).json({ message: "Forbidden" });
        }
      }
      const { pushToken } = req.body;
      if (!pushToken || typeof pushToken !== "string") {
        return res.status(400).json({ message: "pushToken is required" });
      }
      if (!pushToken.startsWith("ExponentPushToken[")) {
        return res.status(400).json({ message: "Invalid Expo push token" });
      }
      const updatedUser = await storage.updateUser(req.params.id, { pushToken });
      if (!updatedUser) return res.status(404).json({ message: "User not found" });
      return res.json({ success: true });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.put("/api/users/:id/role", async (req, res) => {
    try {
      const { role } = req.body;
      const user = await storage.updateUser(req.params.id, { role });
      if (!user) return res.status(404).json({ message: "User not found" });
      const { password: _pw, ...safeUser } = user;
      return res.json(safeUser);
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/users/:id/topup", async (req, res) => {
    try {
      const { amount } = req.body;
      if (!amount || amount <= 0) {
        return res.status(400).json({ message: "Invalid amount" });
      }
      const user = await storage.getUser(req.params.id);
      if (!user) return res.status(404).json({ message: "User not found" });
      const newBalance = (user.walletBalance || 0) + amount;
      const updated = await storage.updateUser(req.params.id, {
        walletBalance: newBalance
      });
      if (!updated) return res.status(500).json({ message: "Failed to update balance" });
      await storage.createNotification({
        userId: req.params.id,
        title: "Wallet Top Up",
        body: `R ${amount.toFixed(2)} has been added to your wallet. New balance: R ${newBalance.toFixed(2)}`,
        type: "wallet"
      });
      const { password: _pw, ...safeUser } = updated;
      return res.json(safeUser);
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/version", (_req, res) => {
    res.json({ version: "google-oauth-v2", built: (/* @__PURE__ */ new Date()).toISOString() });
  });
  app2.get("/api/auth/google/start", (req, res) => {
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
  app2.get("/api/auth/google/callback", async (req, res) => {
    try {
      const { code, error } = req.query;
      if (error || !code) {
        return res.redirect(`a2blift://auth?error=${encodeURIComponent(error || "cancelled")}`);
      }
      const clientId = process.env.GOOGLE_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
      const callbackUrl = `https://api-production-0783.up.railway.app/api/auth/google/callback`;
      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: callbackUrl, grant_type: "authorization_code" }).toString()
      });
      const tokens = await tokenRes.json();
      if (tokens.error) {
        return res.redirect(`a2blift://auth?error=${encodeURIComponent(tokens.error_description || tokens.error)}`);
      }
      const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${tokens.access_token}` }
      });
      const googleUser = await userInfoRes.json();
      if (!googleUser.email) {
        return res.redirect(`a2blift://auth?error=no_email`);
      }
      const email = googleUser.email.trim().toLowerCase();
      let user = await storage.getUserByUsername(email);
      if (!user) {
        const randomPassword = await import_bcryptjs.default.hash(Math.random().toString(36), 10);
        user = await storage.createUser({ username: email, password: randomPassword, name: googleUser.name || email.split("@")[0], phone: null, role: "client" });
      }
      const appToken = signAccessToken({ sub: user.id, role: user.role, email: user.username, name: user.name });
      const { password: _pw, ...safeUser } = user;
      const payload = encodeURIComponent(JSON.stringify({ user: safeUser, accessToken: appToken }));
      return res.redirect(`a2blift://auth?payload=${payload}`);
    } catch (err) {
      return res.redirect(`a2blift://auth?error=${encodeURIComponent(err.message)}`);
    }
  });
  app2.post("/api/auth/google", async (req, res) => {
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
      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: "authorization_code"
        }).toString()
      });
      const tokens = await tokenRes.json();
      if (tokens.error) {
        return res.status(400).json({ message: `Google token error: ${tokens.error_description || tokens.error}` });
      }
      const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${tokens.access_token}` }
      });
      const googleUser = await userInfoRes.json();
      if (!googleUser.email) {
        return res.status(400).json({ message: "Could not retrieve email from Google" });
      }
      const email = googleUser.email.trim().toLowerCase();
      let user = await storage.getUserByUsername(email);
      if (!user) {
        const randomPassword = await import_bcryptjs.default.hash(Math.random().toString(36), 10);
        user = await storage.createUser({
          username: email,
          password: randomPassword,
          name: googleUser.name || email.split("@")[0],
          phone: null,
          role: "client"
        });
      }
      const token = signAccessToken({ sub: user.id, role: user.role, email: user.username, name: user.name });
      setAuthCookie(res, token);
      const { password: _pw, ...safeUser } = user;
      return res.json({ user: safeUser, accessToken: token });
    } catch (error) {
      console.error("Google OAuth error:", error);
      return res.status(500).json({ message: error.message || "Google authentication failed" });
    }
  });
  app2.post("/api/auth/google-token", async (req, res) => {
    try {
      const { accessToken } = req.body;
      if (!accessToken) {
        return res.status(400).json({ message: "accessToken is required" });
      }
      const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const googleUser = await userInfoRes.json();
      if (!googleUser.email) {
        return res.status(400).json({ message: "Could not retrieve email from Google" });
      }
      const email = googleUser.email.trim().toLowerCase();
      let user = await storage.getUserByUsername(email);
      if (!user) {
        const randomPassword = await import_bcryptjs.default.hash(Math.random().toString(36), 10);
        user = await storage.createUser({
          username: email,
          password: randomPassword,
          name: googleUser.name || email.split("@")[0],
          phone: null,
          role: "client"
        });
      }
      const token = signAccessToken({ sub: user.id, role: user.role, email: user.username, name: user.name });
      setAuthCookie(res, token);
      const { password: _pw, ...safeUser } = user;
      return res.json({ user: safeUser, accessToken: token });
    } catch (error) {
      console.error("Google token auth error:", error);
      return res.status(500).json({ message: error.message || "Google authentication failed" });
    }
  });
  app2.post("/api/chauffeurs", authOptional, async (req, res) => {
    try {
      const userId = req.body.userId;
      if (req.auth && req.auth.role !== "admin" && req.auth.sub !== userId) {
        return res.status(403).json({ message: "You can only register your own chauffeur profile" });
      }
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
            role: "chauffeur"
          });
        }
      }
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
          profilePhoto: req.body.profilePhoto || existingChauffeur.profilePhoto
        });
      } else {
        chauffeur = await storage.createChauffeur(req.body);
      }
      await storage.updateUser(req.body.userId, { role: "chauffeur" });
      const existingApp = await storage.getDriverApplicationByUserId(req.body.userId);
      if (!existingApp) {
        await storage.createDriverApplication({
          userId: req.body.userId,
          chauffeurId: chauffeur.id,
          status: "pending"
        });
      } else if (existingApp.chauffeurId !== chauffeur.id) {
        await storage.updateDriverApplication(existingApp.id, { chauffeurId: chauffeur.id });
      }
      return res.json(chauffeur);
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/chauffeurs/user/:userId", async (req, res) => {
    try {
      const chauffeur = await storage.getChauffeurByUserId(req.params.userId);
      if (!chauffeur) return res.status(404).json({ message: "Chauffeur not found" });
      return res.json(chauffeur);
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.put("/api/chauffeurs/:id/push-token", requireAuth, async (req, res) => {
    try {
      const { pushToken } = req.body;
      const chauffeur = await storage.getChauffeur(req.params.id);
      if (!chauffeur) return res.status(404).json({ message: "Chauffeur not found" });
      if (chauffeur.userId !== req.auth.sub && req.auth.role !== "admin") {
        return res.status(403).json({ message: "Forbidden" });
      }
      await storage.updateChauffeur(req.params.id, { pushToken });
      return res.json({ success: true });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/chauffeurs/:id", async (req, res) => {
    try {
      const chauffeur = await storage.getChauffeur(req.params.id);
      if (!chauffeur) return res.status(404).json({ message: "Chauffeur not found" });
      const [ratings, earningsList] = await Promise.all([
        storage.getRatingsByChauffeur(req.params.id),
        storage.getEarningsByChauffeur(req.params.id).catch(() => [])
      ]);
      const computedRating = ratings.length > 0 ? parseFloat((ratings.reduce((s, r) => s + r.rating, 0) / ratings.length).toFixed(1)) : null;
      const cardEarningsTotal = earningsList.filter((e) => e.type === "card" || e.type === "wallet").reduce((s, e) => s + (e.amount || 0), 0);
      const todayStart = /* @__PURE__ */ new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayCardEarnings = earningsList.filter((e) => e.createdAt && new Date(e.createdAt) >= todayStart && (e.type === "card" || e.type === "wallet")).reduce((s, e) => s + (e.amount || 0), 0);
      const chauffeurRides = await storage.getRidesByChauffeur(req.params.id);
      const todayCashFares = chauffeurRides.filter((r) => r.status === "trip_completed" && r.paymentMethod === "cash" && r.completedAt && new Date(r.completedAt) >= todayStart).reduce((s, r) => s + calculateChauffeurEarnings(r.price || 0).chauffeurEarnings, 0);
      const todayEarnings = Math.round(todayCardEarnings + todayCashFares);
      return res.json({ ...chauffeur, computedRating, totalRatings: ratings.length, cardEarningsTotal, todayEarnings });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/chauffeurs/:id/details", async (req, res) => {
    try {
      const chauffeur = await storage.getChauffeur(req.params.id);
      if (!chauffeur) return res.status(404).json({ message: "Chauffeur not found" });
      const user = await storage.getUser(chauffeur.userId);
      const ratings = await storage.getRatingsByChauffeur(req.params.id);
      const avgRating = ratings.length > 0 ? parseFloat((ratings.reduce((s, r) => s + r.rating, 0) / ratings.length).toFixed(1)) : null;
      return res.json({
        ...chauffeur,
        driverName: user?.name || "Chauffeur",
        driverPhone: chauffeur.phone || user?.phone || null,
        driverRating: avgRating,
        totalRatings: ratings.length
      });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/chauffeurs/:id/profile", async (req, res) => {
    try {
      const chauffeur = await storage.getChauffeur(req.params.id);
      if (!chauffeur) return res.status(404).json({ message: "Chauffeur not found" });
      const user = await storage.getUser(chauffeur.userId);
      const ratings = await storage.getRatingsByChauffeur(req.params.id);
      const avgRating = ratings.length > 0 ? parseFloat((ratings.reduce((s, r) => s + r.rating, 0) / ratings.length).toFixed(2)) : null;
      const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
      ratings.forEach((r) => {
        distribution[r.rating] = (distribution[r.rating] || 0) + 1;
      });
      const uniqueClientIds = [...new Set(ratings.slice(0, 30).map((r) => r.clientId))];
      const reviewerMap = {};
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
        reviewerName: reviewerMap[r.clientId] || "Anonymous"
      }));
      const rides2 = await storage.getRidesByChauffeur(req.params.id);
      const completedTrips = rides2.filter((r) => r.status === "trip_completed").length;
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
        ratings: ratingsWithNames
      });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/clients/:id/profile", async (req, res) => {
    try {
      await ensureClientRatingsTable();
      const client = await storage.getUser(req.params.id);
      if (!client) return res.status(404).json({ message: "Client not found" });
      const rides2 = await storage.getRidesByClient(req.params.id);
      const completedTrips = rides2.filter((ride) => ride.status === "trip_completed").length;
      const [summaryResult, distributionResult, reviewsResult] = await Promise.all([
        pool2.query(
          `
            SELECT ROUND(AVG(rating)::numeric, 2) AS avg_rating,
                   COUNT(*)::int AS total_ratings
            FROM client_ratings
            WHERE client_id = $1
          `,
          [req.params.id]
        ),
        pool2.query(
          `
            SELECT rating, COUNT(*)::int AS count
            FROM client_ratings
            WHERE client_id = $1
            GROUP BY rating
          `,
          [req.params.id]
        ),
        pool2.query(
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
        )
      ]);
      const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
      for (const row of distributionResult.rows) {
        distribution[Number(row.rating)] = Number(row.count);
      }
      const avgRating = summaryResult.rows[0]?.avg_rating != null ? Number(summaryResult.rows[0].avg_rating) : null;
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
        ratings: reviewsResult.rows
      });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.put("/api/chauffeurs/:id", async (req, res) => {
    try {
      const { name, ...chauffeurData } = req.body;
      const chauffeur = await storage.updateChauffeur(req.params.id, chauffeurData);
      if (!chauffeur) return res.status(404).json({ message: "Chauffeur not found" });
      if (name && chauffeur.userId) {
        await storage.updateUser(chauffeur.userId, { name: name.trim() });
      }
      return res.json({ ...chauffeur, userName: name || chauffeur.userName });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.delete("/api/chauffeurs/:id", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const chauffeur = await storage.getChauffeur(req.params.id);
      if (!chauffeur) return res.status(404).json({ message: "Chauffeur not found" });
      if (chauffeur.userId) {
        const app3 = await storage.getDriverApplicationByUserId(chauffeur.userId);
        if (app3) await storage.deleteDriverApplication(app3.id);
      }
      await storage.deleteChauffeur(req.params.id);
      return res.json({ message: "Chauffeur deleted" });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/chauffeurs/:id/approve", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const chauffeur = await storage.getChauffeur(req.params.id);
      if (!chauffeur) return res.status(404).json({ message: "Chauffeur not found" });
      await storage.updateChauffeur(req.params.id, { isApproved: true });
      if (chauffeur.userId) {
        await storage.createNotification({
          userId: chauffeur.userId,
          type: "approval",
          title: "\u{1F389} Application Approved!",
          body: "Congratulations! Your driver application has been approved. You can now go online and start accepting rides.",
          isRead: false
        });
        try {
          const app3 = await storage.getDriverApplicationByUserId(chauffeur.userId);
          if (app3) {
            await storage.updateDriverApplication(app3.id, {
              status: "approved",
              reviewedAt: /* @__PURE__ */ new Date(),
              reviewerAdminId: req.auth.sub
            });
          }
        } catch (e) {
          console.error("[approve] application update failed:", e.message);
        }
        try {
          const docs = await storage.getDocumentsByUser(chauffeur.userId);
          for (const doc of docs) {
            await storage.updateDocument(doc.id, { status: "approved" });
          }
        } catch (e) {
          console.error("[approve] document update failed:", e.message);
        }
        if (chauffeur.pushToken) {
          sendExpoPushNotification([chauffeur.pushToken], "Application Approved \u{1F389}", "You're approved! Go online to start accepting rides.");
        }
      }
      return res.json({ success: true });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/chauffeurs/:id/reject", requireAuth, requireRole(["admin"]), async (req, res) => {
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
          isRead: false
        });
        try {
          const app3 = await storage.getDriverApplicationByUserId(chauffeur.userId);
          if (app3) {
            await storage.updateDriverApplication(app3.id, {
              status: "rejected",
              notes: reason.trim(),
              reviewedAt: /* @__PURE__ */ new Date(),
              reviewerAdminId: req.auth.sub
            });
          }
        } catch {
        }
      }
      return res.json({ success: true });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/chauffeurs/:id/documents", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const chauffeur = await storage.getChauffeur(req.params.id);
      if (!chauffeur) return res.status(404).json({ message: "Chauffeur not found" });
      const docs = chauffeur.userId ? await storage.getDocumentsByUser(chauffeur.userId) : [];
      return res.json(docs);
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.put("/api/chauffeurs/:id/toggle-online", async (req, res) => {
    try {
      const chauffeur = await storage.getChauffeur(req.params.id);
      if (!chauffeur) return res.status(404).json({ message: "Chauffeur not found" });
      const updated = await storage.updateChauffeur(req.params.id, {
        isOnline: !chauffeur.isOnline
      });
      return res.json(updated);
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/chauffeurs", async (_req, res) => {
    try {
      const allChauffeurs = await storage.getAllChauffeurs();
      const enriched = await Promise.all(
        allChauffeurs.map(async (c) => {
          const user = c.userId ? await storage.getUser(c.userId) : null;
          return {
            ...c,
            userName: user?.name || "\u2014",
            userPhone: user?.phone || c.phone || "\u2014",
            userEmail: user?.username || "\u2014"
          };
        })
      );
      return res.json(enriched);
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/driver/applications/me", authOptional, async (req, res) => {
    const userId = req.auth?.sub || req.query.userId;
    if (!userId) return res.status(400).json({ message: "userId required" });
    const appRow = await storage.getDriverApplicationByUserId(userId);
    return res.json(appRow || null);
  });
  app2.get(
    "/api/admin/driver-applications",
    requireAuth,
    requireRole(["admin"]),
    async (_req, res) => {
      const apps = await storage.getDriverApplications();
      return res.json(apps);
    }
  );
  app2.put(
    "/api/admin/driver-applications/:id",
    requireAuth,
    requireRole(["admin"]),
    async (req, res) => {
      const { status, notes } = req.body;
      const updated = await storage.updateDriverApplication(req.params.id, {
        status,
        notes,
        reviewedAt: /* @__PURE__ */ new Date(),
        reviewerAdminId: req.auth.sub
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
    }
  );
  app2.delete(
    "/api/admin/driver-applications/:id",
    requireAuth,
    requireRole(["admin"]),
    async (req, res) => {
      try {
        const deleted = await storage.deleteDriverApplication(req.params.id);
        if (!deleted) return res.status(404).json({ message: "Application not found" });
        return res.json({ message: "Application deleted" });
      } catch (error) {
        return res.status(500).json({ message: error.message });
      }
    }
  );
  app2.post("/api/upload/profile-photo", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const { base64Data, chauffeurId } = req.body;
      if (!base64Data || typeof base64Data !== "string" || !chauffeurId || typeof chauffeurId !== "string") {
        return res.status(400).json({ message: "base64Data and chauffeurId are required" });
      }
      if (base64Data.length > 7e6) {
        return res.status(400).json({ message: "Image too large. Maximum 5 MB." });
      }
      const SUPABASE_URL2 = process.env.SUPABASE_URL || "https://zzwkieiktbhptvgsqerd.supabase.co";
      const SUPABASE_SERVICE_KEY2 = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
      const BUCKET = "driver-documents";
      const safeId = chauffeurId.replace(/[^a-zA-Z0-9_-]/g, "");
      const fileName = `${safeId}/profile_${Date.now()}.jpg`;
      const buffer = Buffer.from(base64Data, "base64");
      const uploadRes = await fetch(
        `${SUPABASE_URL2}/storage/v1/object/${BUCKET}/${fileName}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${SUPABASE_SERVICE_KEY2}`,
            apikey: SUPABASE_SERVICE_KEY2,
            "Content-Type": "image/jpeg",
            "x-upsert": "true"
          },
          body: buffer
        }
      );
      if (!uploadRes.ok) {
        const errText = await uploadRes.text().catch(() => uploadRes.statusText);
        console.error("[upload/profile-photo] Supabase error:", uploadRes.status, errText);
        if (uploadRes.status === 401 || uploadRes.status === 403) {
          return res.status(500).json({ message: "Photo upload failed: Supabase service key not configured. Please add SUPABASE_SERVICE_ROLE_KEY to environment secrets." });
        }
        return res.status(500).json({ message: `Photo upload failed (${uploadRes.status}): ${errText}` });
      }
      const url = `${SUPABASE_URL2}/storage/v1/object/public/${BUCKET}/${fileName}`;
      try {
        await storage.updateChauffeur(chauffeurId, { profilePhoto: url });
      } catch {
      }
      return res.json({ url });
    } catch (error) {
      console.error("[upload/profile-photo] error:", error.message);
      return res.status(500).json({ message: error.message || "Photo upload failed. Please try again." });
    }
  });
  app2.post("/api/upload-document", authOptional, async (req, res) => {
    try {
      const { base64Data, userId, docType } = req.body;
      if (!base64Data || !userId || !docType) {
        return res.status(400).json({ message: "base64Data, userId, and docType are required" });
      }
      const SUPABASE_URL2 = process.env.SUPABASE_URL || "https://zzwkieiktbhptvgsqerd.supabase.co";
      const SUPABASE_ANON_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
      const BUCKET = "driver-documents";
      const fileName = `${userId}/${docType}_${Date.now()}.jpg`;
      const buffer = Buffer.from(base64Data, "base64");
      const uploadRes = await fetch(
        `${SUPABASE_URL2}/storage/v1/object/${BUCKET}/${fileName}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
            apikey: SUPABASE_ANON_KEY,
            "Content-Type": "image/jpeg",
            "x-upsert": "true"
          },
          body: buffer
        }
      );
      if (!uploadRes.ok) {
        const err = await uploadRes.text();
        console.error("[upload-document] Supabase error:", err);
        return res.status(500).json({ message: `Supabase upload failed: ${err}` });
      }
      const url = `${SUPABASE_URL2}/storage/v1/object/public/${BUCKET}/${fileName}`;
      return res.json({ url });
    } catch (error) {
      console.error("[upload-document] error:", error.message);
      return res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/driver/documents", authOptional, async (req, res) => {
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
      status: "pending"
    });
    return res.json(doc);
  });
  app2.get("/api/driver/documents", authOptional, async (req, res) => {
    const userId = req.auth?.sub || req.query.userId;
    if (!userId) return res.status(400).json({ message: "userId required" });
    const docs = await storage.getDocumentsByUser(userId);
    return res.json(docs);
  });
  app2.get(
    "/api/admin/documents",
    requireAuth,
    requireRole(["admin"]),
    async (_req, res) => {
      const docs = await storage.getAllDocuments();
      return res.json(docs);
    }
  );
  app2.put(
    "/api/admin/documents/:id",
    requireAuth,
    requireRole(["admin"]),
    async (req, res) => {
      const { status } = req.body;
      const doc = await storage.updateDocument(req.params.id, {
        status,
        reviewedAt: /* @__PURE__ */ new Date(),
        reviewerAdminId: req.auth.sub
      });
      if (!doc) return res.status(404).json({ message: "Document not found" });
      return res.json(doc);
    }
  );
  app2.post("/api/pricing/estimate", async (req, res) => {
    try {
      const { distanceKm, categoryId, isLateNight } = req.body;
      const estimate = calculatePrice(distanceKm, categoryId || "budget", { isLateNight });
      return res.json(estimate);
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/pricing/config", async (_req, res) => {
    return res.json(getPricingConfig());
  });
  app2.get("/api/pricing/categories", async (_req, res) => {
    return res.json(getVehicleCategories());
  });
  app2.post("/api/liveness/session", requireAuth, async (req, res) => {
    try {
      const provider = getLivenessProvider();
      const userId = req.auth.sub;
      const expiresAt = new Date(Date.now() + 5 * 60 * 1e3);
      const challengeCode = buildChallengeCode();
      const existing = await storage.getLatestPendingLivenessSessionByUser(userId);
      if (existing && existing.expiresAt && new Date(existing.expiresAt).getTime() > Date.now()) {
        return res.json({
          sessionId: existing.id,
          provider: existing.provider,
          expiresAt: existing.expiresAt,
          challenge: challengeLabel(existing.challengeCode),
          maxAttempts: existing.maxAttempts,
          attempts: existing.attempts
        });
      }
      const session = await storage.createLivenessSession({
        userId,
        provider,
        status: "pending",
        challengeCode,
        maxAttempts: 3,
        attempts: 0,
        expiresAt
      });
      return res.json({
        sessionId: session.id,
        provider: session.provider,
        expiresAt: session.expiresAt,
        challenge: challengeLabel(session.challengeCode),
        maxAttempts: session.maxAttempts,
        attempts: session.attempts
      });
    } catch (error) {
      return res.status(500).json({ message: error.message || "Failed to create liveness session" });
    }
  });
  app2.post("/api/liveness/verify", requireAuth, async (req, res) => {
    try {
      const { sessionId, selfieUrl, faceData, challenge } = req.body;
      if (!sessionId || !selfieUrl) {
        return res.status(400).json({ message: "sessionId and selfieUrl are required" });
      }
      const session = await storage.getLivenessSession(sessionId);
      if (!session || session.userId !== req.auth.sub) {
        return res.status(404).json({ message: "Liveness session not found" });
      }
      if (session.status === "passed") {
        return res.json({
          passed: true,
          sessionId: session.id,
          score: session.score || 0.99,
          provider: session.provider,
          selfieUrl: session.selfieUrl || selfieUrl
        });
      }
      if (new Date(session.expiresAt).getTime() <= Date.now()) {
        await storage.updateLivenessSession(session.id, {
          status: "expired",
          errorReason: "Session expired. Please retry liveness."
        });
        return res.status(410).json({ message: "Session expired. Please retry liveness." });
      }
      const nextAttempts = (session.attempts || 0) + 1;
      if (nextAttempts > (session.maxAttempts || 3)) {
        await storage.updateLivenessSession(session.id, {
          status: "failed",
          attempts: nextAttempts,
          errorReason: "Maximum attempts reached"
        });
        return res.status(429).json({ message: "Maximum liveness attempts reached" });
      }
      if (session.provider !== "mock") {
        await storage.updateLivenessSession(session.id, {
          attempts: nextAttempts,
          selfieUrl,
          errorReason: "Provider integration pending"
        });
        return res.status(501).json({
          message: "Selected liveness provider is not configured yet. Switch LIVENESS_PROVIDER=mock for now."
        });
      }
      const qualityResult = await runMockSelfieQualityCheck(selfieUrl, faceData || null, challenge || session.challengeCode || null);
      const passed = qualityResult.passed;
      const score = qualityResult.score;
      const status = passed ? "passed" : "failed";
      const updated = await storage.updateLivenessSession(session.id, {
        attempts: nextAttempts,
        selfieUrl,
        score,
        status,
        verifiedAt: passed ? /* @__PURE__ */ new Date() : null,
        errorReason: passed ? null : qualityResult.reason || "Selfie quality check failed"
      });
      return res.json({
        passed,
        sessionId: updated?.id || session.id,
        score,
        provider: session.provider,
        selfieUrl,
        reason: passed ? null : qualityResult.reason || "Selfie quality check failed"
      });
    } catch (error) {
      return res.status(500).json({ message: error.message || "Liveness verification failed" });
    }
  });
  app2.post("/api/rides", requireAuth, async (req, res) => {
    try {
      const { distanceKm, isLateNight, ...rideData } = req.body;
      const clientId = req.auth.sub;
      rideData.clientId = clientId;
      let clientUser = await storage.getUser(clientId);
      if (!clientUser) {
        const { email, name, role } = req.auth;
        const placeholderEmail = email || `oauth_${clientId.slice(0, 12)}@a2blift.placeholder`;
        const existingByEmail = email ? await storage.getUserByUsername(email) : null;
        if (existingByEmail) {
          clientUser = existingByEmail;
        } else {
          try {
            const randomPw = await import_bcryptjs.default.hash(Math.random().toString(36), 10);
            clientUser = await storage.createUser({
              id: clientId,
              username: placeholderEmail,
              password: randomPw,
              name: name || "A2B Client",
              phone: null,
              role: role || "client"
            });
          } catch (_createErr) {
            clientUser = await storage.getUser(clientId);
            if (!clientUser) {
              return res.status(401).json({ success: false, message: "Session expired. Please log out and log in again." });
            }
          }
        }
      } else {
        const claimedName = typeof req.auth.name === "string" ? req.auth.name.trim() : "";
        const storedName = typeof clientUser.name === "string" ? clientUser.name.trim() : "";
        if (claimedName && getUserFirstName({ name: storedName }, "") !== getUserFirstName({ name: claimedName }, "")) {
          const storedLooksGeneric = ["", "a2b client", "client", "rider"].includes(storedName.toLowerCase());
          if (storedLooksGeneric) {
            clientUser = await storage.updateUser(clientUser.id, { name: claimedName });
          }
        }
      }
      const categoryId = rideData.vehicleType || "budget";
      const normalizedDistanceKm = Number(rideData.selectedRouteDistanceKm ?? distanceKm ?? 10);
      const safeDistanceKm = Number.isFinite(normalizedDistanceKm) && normalizedDistanceKm > 0 ? normalizedDistanceKm : 10;
      const normalizedDurationMin = Number(rideData.durationMin ?? 0);
      const safeDurationMin = Number.isFinite(normalizedDurationMin) && normalizedDurationMin > 0 ? normalizedDurationMin : null;
      const selectedRouteId = typeof rideData.selectedRouteId === "string" && rideData.selectedRouteId.trim() ? rideData.selectedRouteId.trim() : null;
      const priceEstimate = calculatePrice(safeDistanceKm, categoryId, { isLateNight });
      const requestedFare = Number(rideData.actualFare);
      const safeFare = Number.isFinite(requestedFare) && requestedFare > 0 ? requestedFare : priceEstimate.totalPrice;
      const routeCurrency = typeof rideData.routeCurrency === "string" && rideData.routeCurrency.trim() ? rideData.routeCurrency.trim().toUpperCase() : priceEstimate.currency;
      const paymentMethod = rideData.paymentMethod || "cash";
      if (paymentMethod === "cash") {
        const { livenessSessionId, livenessStatus, cashSelfieUrl } = rideData;
        if (!livenessSessionId || livenessStatus !== "passed" || !cashSelfieUrl) {
          return res.status(400).json({
            success: false,
            message: "Cash rides require completed liveness verification"
          });
        }
        const session = await storage.getLivenessSession(livenessSessionId);
        if (!session || session.userId !== clientId || session.status !== "passed") {
          return res.status(403).json({
            success: false,
            message: "Invalid liveness session"
          });
        }
      }
      const livenessVerifiedAt = rideData.livenessStatus === "passed" ? /* @__PURE__ */ new Date() : void 0;
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
        paymentStatus: paymentMethod === "cash" ? "unpaid" : rideData.paymentStatus || "pending",
        cashSelfieUrl: rideData.cashSelfieUrl || null,
        livenessStatus: rideData.livenessStatus || "not_required",
        livenessProvider: rideData.livenessProvider || null,
        livenessSessionId: rideData.livenessSessionId || null,
        livenessScore: rideData.livenessScore || null,
        selectedRouteId,
        selectedRouteDistanceKm: selectedRouteId ? safeDistanceKm : null,
        actualFare: selectedRouteId ? safeFare : null,
        routeCurrency,
        routeSelectedAt: selectedRouteId ? /* @__PURE__ */ new Date() : null,
        ...livenessVerifiedAt ? { livenessVerifiedAt } : {}
      });
      let clientFirstName = "Rider";
      try {
        const clientUser2 = await storage.getUser(clientId);
        clientFirstName = getUserFirstName(clientUser2, "Rider");
      } catch {
      }
      const enrichedRide = { ...ride, clientFirstName };
      const allChauffeurs = await storage.getAllChauffeurs();
      const pickupLat = parseFloat(rideData.pickupLat);
      const pickupLng = parseFloat(rideData.pickupLng);
      const nearbyChauffeurs = allChauffeurs.filter((c) => c.isOnline && c.isApproved && hasFreshChauffeurLocation(c)).map((c) => ({
        ...c,
        distKm: haversine(pickupLat, pickupLng, Number(c.lat), Number(c.lng))
      })).filter((c) => c.distKm <= RIDE_MATCH_RADIUS_KM).sort((a, b) => a.distKm - b.distKm).slice(0, 10);
      if (nearbyChauffeurs.length > 0) {
        const sockets = await io.fetchSockets();
        let notified = 0;
        for (const socket of sockets) {
          const socketData = socket.data;
          if (socketData?.chauffeurId && nearbyChauffeurs.some((c) => c.id === socketData.chauffeurId)) {
            socket.emit("ride:new", { ...enrichedRide, distanceToPickup: nearbyChauffeurs.find((c) => c.id === socketData.chauffeurId)?.distKm });
            notified++;
          }
        }
        if (notified === 0) {
          io.emit("ride:new", enrichedRide);
        }
        const pushTokens = nearbyChauffeurs.map((c) => c.pushToken).filter(Boolean);
        if (pushTokens.length > 0) {
          sendExpoPushNotification(
            pushTokens,
            "\u{1F697} New Ride Request",
            `Pickup: ${ride.pickupAddress || "Nearby"} \u2014 tap to accept`,
            { rideId: ride.id, type: "ride:new" },
            { urgent: true }
          );
        }
      } else {
        io.emit("ride:new", enrichedRide);
        const allDrivers = (await storage.getAllChauffeurs()).filter((c) => c.isOnline && c.isApproved && hasFreshChauffeurLocation(c));
        const pushTokens = allDrivers.map((c) => c.pushToken).filter(Boolean);
        if (pushTokens.length > 0) {
          sendExpoPushNotification(
            pushTokens,
            "\u{1F697} New Ride Request",
            `Pickup: ${ride.pickupAddress || "Nearby"} \u2014 tap to accept`,
            { rideId: ride.id, type: "ride:new" },
            { urgent: true }
          );
        }
      }
      return res.json({
        success: true,
        status: ride.status,
        message: nearbyChauffeurs.length > 0 ? `Notifying ${nearbyChauffeurs.length} driver${nearbyChauffeurs.length > 1 ? "s" : ""} nearby...` : "Searching for drivers...",
        ride
      });
    } catch (error) {
      console.error("Ride creation error:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Failed to create ride request"
      });
    }
  });
  app2.post(
    "/api/paystack/initialize",
    requireAuth,
    async (req, res) => {
      try {
        const { rideId } = req.body;
        if (!rideId) {
          return res.status(400).json({ message: "rideId is required" });
        }
        const ride = await storage.getRide(rideId);
        if (!ride) {
          return res.status(404).json({ message: "Ride not found" });
        }
        if (!ride.price || ride.price <= 0) {
          return res.status(400).json({ message: "Ride does not have a valid price" });
        }
        const user = await storage.getUser(req.auth.sub);
        if (!user) {
          return res.status(404).json({ message: "User not found" });
        }
        const { secret, currency } = getPaystackConfig();
        const rideReference = `A2B-RIDE-${Date.now()}-${user.id.slice(0, 6)}`;
        const domain = getAppBaseUrl(req);
        const rideCallbackUrl = `${domain}/api/payments/webview-callback?reference=${rideReference}`;
        const amountInMinorUnits = Math.round(ride.price * 100);
        const email = user.username.includes("@") ? user.username : `${user.username}@example.com`;
        const initBody = {
          email,
          amount: amountInMinorUnits,
          currency,
          reference: rideReference,
          callback_url: rideCallbackUrl,
          metadata: {
            rideId: ride.id,
            userId: user.id
          }
        };
        const response = await fetch(
          "https://api.paystack.co/transaction/initialize",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${secret}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify(initBody)
          }
        );
        const data = await response.json();
        if (!response.ok || !data?.status) {
          return res.status(502).json({ message: "Failed to initialize Paystack", raw: data });
        }
        return res.json({
          authorizationUrl: data.data.authorization_url,
          reference: data.data.reference
        });
      } catch (error) {
        if (error instanceof Error && error.message.includes("PAYSTACK")) {
          return res.status(500).json({ message: error.message });
        }
        return res.status(500).json({ message: error.message || "Server error" });
      }
    }
  );
  app2.post("/api/paystack/webhook", async (req, res) => {
    try {
      const signature = req.header("x-paystack-signature");
      if (!signature) {
        return res.status(400).json({ message: "Missing signature" });
      }
      let secret;
      try {
        secret = getPaystackConfig().secret;
      } catch (e) {
        console.error("Paystack webhook misconfigured:", e);
        return res.status(500).json({ message: "Paystack not configured" });
      }
      const rawBody = req.rawBody;
      const raw = typeof rawBody === "string" ? rawBody : Buffer.isBuffer(rawBody) ? rawBody : JSON.stringify(req.body);
      const hash = import_node_crypto.default.createHmac("sha512", secret).update(raw).digest("hex");
      if (hash !== signature) {
        console.warn("Invalid Paystack webhook signature");
        return res.status(401).json({ message: "Invalid signature" });
      }
      const payload = req.body;
      if (payload?.event !== "charge.success") {
        return res.status(200).json({ received: true });
      }
      const eventData = payload.data || {};
      const metadata = eventData.metadata || {};
      const rideId = metadata.rideId;
      const userId = metadata.userId ?? void 0;
      if (!rideId) {
        return res.status(200).json({ received: true, message: "No rideId in metadata" });
      }
      const amountMinor = eventData.amount;
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
          providerRef: eventData.reference
        });
        await storage.updateRide(ride.id, {
          paymentStatus: "paid",
          paymentMethod: "card"
        });
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
                type: "card"
              });
              const chauffeur = await storage.getChauffeur(ride.chauffeurId);
              if (chauffeur) {
                await storage.updateChauffeur(ride.chauffeurId, {
                  earningsTotal: (chauffeur.earningsTotal || 0) + earningsCalc.chauffeurEarnings
                });
              }
            }
          } catch (earningsErr) {
            console.error("Webhook earnings record failed (non-fatal):", earningsErr.message);
          }
        }
      } catch (dbError) {
        console.error("Error applying Paystack payment:", dbError);
        return res.status(200).json({ received: true, error: "db_error" });
      }
      return res.status(200).json({ received: true });
    } catch (error) {
      console.error("Paystack webhook error:", error);
      return res.status(500).json({ message: "Webhook processing failed" });
    }
  });
  app2.get("/api/rides/:id", async (req, res) => {
    try {
      const ride = await storage.getRide(req.params.id);
      if (!ride) return res.status(404).json({ message: "Ride not found" });
      let clientFirstName = "Client";
      try {
        const client = await storage.getUser(ride.clientId);
        clientFirstName = getUserFirstName(client, "Client");
      } catch {
      }
      return res.json({ ...ride, clientFirstName });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.put("/api/rides/:id", async (req, res) => {
    try {
      const ride = await storage.updateRide(req.params.id, req.body);
      if (!ride) return res.status(404).json({ message: "Ride not found" });
      let clientFirstName = "Client";
      try {
        const client = await storage.getUser(ride.clientId);
        clientFirstName = getUserFirstName(client, "Client");
      } catch {
      }
      const rideWithClientName = { ...ride, clientFirstName };
      io.emit("ride:statusUpdate", rideWithClientName);
      return res.json(rideWithClientName);
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.put("/api/rides/:id/accept", requireAuth, async (req, res) => {
    try {
      const { chauffeurId } = req.body;
      if (!chauffeurId) return res.status(400).json({ message: "chauffeurId is required" });
      const chauffeur = await storage.getChauffeur(chauffeurId);
      if (!chauffeur || chauffeur.userId !== req.auth.sub) {
        return res.status(403).json({ message: "Forbidden: chauffeur mismatch" });
      }
      const updated = await storage.acceptRideAtomic(req.params.id, chauffeurId);
      if (!updated) {
        return res.status(409).json({ message: "Ride already assigned to another driver" });
      }
      let clientFirstName = "Rider";
      try {
        const client = await storage.getUser(updated.clientId);
        clientFirstName = getUserFirstName(client, "Rider");
      } catch {
      }
      const enrichedAccepted = { ...updated, clientFirstName };
      io.emit("ride:accepted", enrichedAccepted);
      if (updated.clientId) {
        await storage.createNotification({
          userId: updated.clientId,
          title: "Driver Assigned",
          body: "Your premium chauffeur has been assigned and is on the way.",
          type: "ride"
        });
        const riderUser = await storage.getUser(updated.clientId);
        if (riderUser?.pushToken) {
          sendExpoPushNotification(
            [riderUser.pushToken],
            "\u{1F698} Driver Assigned",
            "Your premium chauffeur has been assigned and is on the way.",
            { rideId: updated.id, type: "ride:accepted" },
            { urgent: true, channelId: "client-alerts" }
          );
        }
      }
      await storage.createNotification({
        userId: chauffeur.userId,
        title: "Ride Accepted",
        body: "You're on your way to pick up the client. Head to the pickup location.",
        type: "ride"
      });
      if (chauffeur.pushToken) {
        sendExpoPushNotification(
          [chauffeur.pushToken],
          "\u{1F697} Going to Pick Up",
          "You've accepted the ride. Head to the pickup location now.",
          { rideId: updated.id, type: "ride:accepted" }
        );
      }
      return res.json(enrichedAccepted);
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.put("/api/rides/:id/status", requireAuth, async (req, res) => {
    try {
      const { status } = req.body;
      const existingRide = await storage.getRide(req.params.id);
      if (!existingRide) return res.status(404).json({ message: "Ride not found" });
      const callerUser = await storage.getUser(req.auth.sub);
      if (!callerUser) return res.status(403).json({ message: "Forbidden" });
      const isRider = existingRide.clientId === callerUser.id;
      let isChauffeur = false;
      if (existingRide.chauffeurId) {
        const ch = await storage.getChauffeur(existingRide.chauffeurId);
        isChauffeur = ch?.userId === callerUser.id;
      }
      const isAdmin = callerUser.role === "admin";
      if (!isRider && !isChauffeur && !isAdmin) {
        return res.status(403).json({ message: "Forbidden: not a party to this ride" });
      }
      const rideBeforeUpdate = status === "cancelled" ? existingRide : null;
      const ride = await storage.updateRide(req.params.id, {
        status,
        ...status === "trip_completed" ? { completedAt: /* @__PURE__ */ new Date() } : {}
      });
      if (!ride) return res.status(404).json({ message: "Ride not found" });
      if (status === "cancelled" && rideBeforeUpdate) {
        try {
          const payments2 = await storage.getPaymentsByRide(req.params.id);
          const cardPayment = payments2.find(
            (p) => p.method === "card" && p.status === "paid" && p.paystackReference
          );
          if (cardPayment?.paystackReference) {
            const secret = process.env.PAYSTACK_SECRET_KEY || "";
            await import_axios.default.post(
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
                userId: rider.id,
                type: "refund",
                amount: amt,
                balanceBefore,
                balanceAfter: newBalance,
                reference: cardPayment.paystackReference,
                description: "Ride cancelled \u2014 card payment refunded to wallet",
                rideId: ride.id,
                status: "completed"
              });
              await storage.createNotification({
                userId: rider.id,
                title: "Refund Issued",
                body: `Your ride was cancelled. R${amt.toFixed(2)} has been refunded to your A2B wallet.`,
                type: "payment"
              });
              if (rider?.pushToken) {
                sendExpoPushNotification(
                  [rider.pushToken],
                  "Refund Issued",
                  `R${amt.toFixed(2)} has been refunded to your A2B wallet.`,
                  { rideId: ride.id, type: "ride:cancelled" },
                  { urgent: true, channelId: "client-alerts" }
                );
              }
            }
          }
          const walletPayment = !cardPayment ? payments2.find((p) => p.method === "wallet" && p.status === "paid") : null;
          if (walletPayment && rideBeforeUpdate.price) {
            const rider = await storage.getUser(rideBeforeUpdate.clientId);
            if (rider) {
              const amt = Number(rideBeforeUpdate.price);
              const balanceBefore = rider.walletBalance || 0;
              const newBalance = balanceBefore + amt;
              await storage.updateUser(rider.id, { walletBalance: newBalance });
              await storage.updatePayment(walletPayment.id, { status: "refunded" });
              await storage.createWalletTransaction({
                userId: rider.id,
                type: "refund",
                amount: amt,
                balanceBefore,
                balanceAfter: newBalance,
                reference: `wallet_refund_${ride.id}_${Date.now()}`,
                description: "Ride cancelled \u2014 wallet balance restored",
                rideId: ride.id,
                status: "completed"
              });
              await storage.createNotification({
                userId: rider.id,
                title: "Refund Issued",
                body: `Your ride was cancelled. R${amt.toFixed(2)} has been returned to your A2B wallet.`,
                type: "payment"
              });
              if (rider?.pushToken) {
                sendExpoPushNotification(
                  [rider.pushToken],
                  "Refund Issued",
                  `R${amt.toFixed(2)} has been returned to your A2B wallet.`,
                  { rideId: ride.id, type: "ride:cancelled" },
                  { urgent: true, channelId: "client-alerts" }
                );
              }
            }
          }
          const paymentMethod = rideBeforeUpdate.paymentMethod || "cash";
          if (!cardPayment && !walletPayment && paymentMethod === "cash") {
            await storage.createNotification({
              userId: rideBeforeUpdate.clientId,
              title: "Ride Cancelled",
              body: "Your ride has been cancelled. No charges were applied.",
              type: "ride"
            });
            const rider = await storage.getUser(rideBeforeUpdate.clientId);
            if (rider?.pushToken) {
              sendExpoPushNotification(
                [rider.pushToken],
                "Ride Cancelled",
                "Your ride was cancelled. No charges were applied.",
                { rideId: ride.id, type: "ride:cancelled" },
                { urgent: true, channelId: "client-alerts" }
              );
            }
          }
          if (rideBeforeUpdate.chauffeurId) {
            const chauffeur = await storage.getChauffeur(rideBeforeUpdate.chauffeurId);
            if (chauffeur?.userId) {
              await storage.createNotification({
                userId: chauffeur.userId,
                title: "Ride Cancelled",
                body: "The client has cancelled this trip.",
                type: "ride"
              });
            }
            if (chauffeur?.pushToken) {
              sendExpoPushNotification(
                [chauffeur.pushToken],
                "Ride Cancelled",
                "The client has cancelled this trip."
              );
            }
          }
        } catch (refundErr) {
          console.error("Cancellation refund/notification failed (non-fatal):", refundErr.message);
        }
      }
      if (status === "trip_completed" && ride.chauffeurId && ride.price) {
        try {
          const earningsCalc = calculateChauffeurEarnings(ride.price);
          const existingEarnings = await storage.getEarningsByChauffeur(ride.chauffeurId);
          const alreadyRecorded = existingEarnings.some((e) => e.rideId === ride.id);
          const paymentMethod = ride.paymentMethod || "cash";
          if (!alreadyRecorded) {
            if (paymentMethod === "cash") {
              await storage.createEarning({
                chauffeurId: ride.chauffeurId,
                rideId: ride.id,
                amount: -earningsCalc.commission,
                commission: earningsCalc.commission,
                type: "cash"
              });
              const chauffeur = await storage.getChauffeur(ride.chauffeurId);
              if (chauffeur) {
                await storage.updateChauffeur(ride.chauffeurId, {
                  earningsTotal: (chauffeur.earningsTotal || 0) - earningsCalc.commission
                });
              }
            } else {
              await storage.createEarning({
                chauffeurId: ride.chauffeurId,
                rideId: ride.id,
                amount: earningsCalc.chauffeurEarnings,
                commission: earningsCalc.commission,
                type: paymentMethod
              });
              const chauffeur = await storage.getChauffeur(ride.chauffeurId);
              if (chauffeur) {
                await storage.updateChauffeur(ride.chauffeurId, {
                  earningsTotal: (chauffeur.earningsTotal || 0) + earningsCalc.chauffeurEarnings
                });
              }
            }
          }
        } catch (earningsErr) {
          console.error("earnings record failed (non-fatal):", earningsErr.message);
        }
        try {
          await storage.createNotification({
            userId: ride.clientId,
            title: "Trip Completed",
            body: `Your trip has been completed. Fare: R ${ride.price}. Thank you for choosing A2B LIFT.`,
            type: "ride"
          });
          const riderUser = await storage.getUser(ride.clientId);
          if (riderUser?.pushToken) {
            sendExpoPushNotification(
              [riderUser.pushToken],
              "Trip Completed",
              `Fare: R ${ride.price}. Thank you for choosing A2B LIFT.`,
              { rideId: ride.id, type: "ride:completed" },
              { urgent: true, channelId: "client-alerts" }
            );
          }
        } catch (notifErr) {
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
                providerRef: `cash_${ride.id}_${Date.now()}`
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
        } catch (payErr) {
          console.error("payment record failed (non-fatal):", payErr.message);
        }
      }
      let clientFirstName = "Client";
      try {
        const client = await storage.getUser(ride.clientId);
        clientFirstName = getUserFirstName(client, "Client");
      } catch {
      }
      const rideWithClientName = { ...ride, clientFirstName };
      io.emit("ride:statusUpdate", rideWithClientName);
      try {
        if (status === "chauffeur_arriving" && ride.clientId) {
          await storage.createNotification({
            userId: ride.clientId,
            title: "Driver Arriving",
            body: "Your chauffeur is arriving at your pickup location. Please be ready.",
            type: "ride"
          });
          const riderUser = await storage.getUser(ride.clientId);
          if (riderUser?.pushToken) {
            sendExpoPushNotification(
              [riderUser.pushToken],
              "\u{1F697} Driver Arriving",
              "Your chauffeur is arriving at your pickup. Please be ready!",
              { rideId: ride.id, type: "ride:arriving" },
              { urgent: true, channelId: "client-alerts" }
            );
          }
        } else if (status === "trip_started" && ride.clientId) {
          await storage.createNotification({
            userId: ride.clientId,
            title: "Trip Started",
            body: `Your trip is underway to ${ride.dropoffAddress || "your destination"}.`,
            type: "ride"
          });
          const riderUser = await storage.getUser(ride.clientId);
          if (riderUser?.pushToken) {
            sendExpoPushNotification(
              [riderUser.pushToken],
              "\u{1F680} Trip Started",
              `Your ride is underway to ${ride.dropoffAddress || "your destination"}.`,
              { rideId: ride.id, type: "ride:started" },
              { urgent: true, channelId: "client-alerts" }
            );
          }
        }
      } catch (notifErr) {
        console.error("rider status notification failed (non-fatal):", notifErr.message);
      }
      return res.json(rideWithClientName);
    } catch (error) {
      console.error("ride status update error:", error.message, error.stack);
      return res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/rides/:id/pay", requireAuth, async (req, res) => {
    const ride = await storage.getRide(req.params.id);
    if (!ride) return res.status(404).json({ message: "Ride not found" });
    if (ride.clientId !== req.auth.sub) return res.status(403).json({ message: "Forbidden" });
    const amount = ride.price || 0;
    const method = req.body?.method || ride.paymentMethod || "cash";
    const payment = await storage.createPayment({
      rideId: ride.id,
      payerUserId: req.auth.sub,
      amount,
      method,
      status: method === "cash" ? "pending" : "paid"
    });
    await storage.updateRide(ride.id, {
      paymentStatus: payment.status === "paid" ? "paid" : "pending",
      paymentMethod: method
    });
    return res.json({ payment });
  });
  app2.post("/api/rides/:id/rate", requireAuth, async (req, res) => {
    const { rating, comment } = req.body;
    const ride = await storage.getRide(req.params.id);
    if (!ride) return res.status(404).json({ message: "Ride not found" });
    if (ride.clientId !== req.auth.sub) return res.status(403).json({ message: "Forbidden" });
    if (!ride.chauffeurId) return res.status(400).json({ message: "Ride has no chauffeur" });
    if (ride.status !== "trip_completed") return res.status(400).json({ message: "Ride not completed" });
    const rr = await storage.createRideRating({
      rideId: ride.id,
      clientId: ride.clientId,
      chauffeurId: ride.chauffeurId,
      rating,
      comment: comment || null
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
  app2.post("/api/rides/:id/rate-client", requireAuth, async (req, res) => {
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
      if (!chauffeur || chauffeur.userId !== req.auth.sub) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const result = await pool2.query(
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
      const averageResult = await pool2.query(
        `SELECT ROUND(AVG(rating)::numeric, 2) AS avg_rating FROM client_ratings WHERE client_id = $1`,
        [ride.clientId]
      );
      const average = averageResult.rows[0]?.avg_rating != null ? Number(averageResult.rows[0].avg_rating) : null;
      if (average != null) {
        await storage.updateUser(ride.clientId, { rating: average });
      }
      return res.json(result.rows[0]);
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/rides/client/:clientId", async (req, res) => {
    try {
      const ridesList = await storage.getRidesByClient(req.params.clientId);
      return res.json(ridesList);
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/rides/chauffeur/:chauffeurId", async (req, res) => {
    try {
      const ridesList = await storage.getRidesByChauffeur(req.params.chauffeurId);
      return res.json(ridesList);
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/rides/available/:chauffeurId", async (req, res) => {
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
        candidates = searching.map((r) => ({
          ...r,
          distKm: haversine(
            Number(chauffeur.lat),
            Number(chauffeur.lng),
            parseFloat(r.pickupLat),
            parseFloat(r.pickupLng)
          )
        })).filter((r) => r.distKm <= RIDE_MATCH_RADIUS_KM).sort((a, b) => a.distKm - b.distKm);
      }
      const enriched = await Promise.all(
        candidates.slice(0, 10).map(async (r) => {
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
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/rides/chauffeur-pending/:chauffeurId", async (req, res) => {
    try {
      const chauffeur = await storage.getChauffeur(req.params.chauffeurId);
      if (!chauffeur || !chauffeur.isOnline || !chauffeur.isApproved) {
        return res.status(204).end();
      }
      const allRides = await storage.getAllRides();
      const searching = allRides.filter((r) => r.status === "searching");
      if (!searching.length) return res.status(204).end();
      async function enrichRide(r) {
        try {
          const client = await storage.getUser(r.clientId);
          const firstName = getUserFirstName(client, "Rider");
          return { ...r, clientFirstName: firstName };
        } catch {
          return { ...r, clientFirstName: "Rider" };
        }
      }
      if (hasFreshChauffeurLocation(chauffeur)) {
        const withDist = searching.map((r) => ({
          ...r,
          distKm: haversine(
            Number(chauffeur.lat),
            Number(chauffeur.lng),
            parseFloat(r.pickupLat),
            parseFloat(r.pickupLng)
          )
        })).filter((r) => r.distKm <= RIDE_MATCH_RADIUS_KM).sort((a, b) => a.distKm - b.distKm);
        if (!withDist.length) return res.status(204).end();
        return res.json(await enrichRide(withDist[0]));
      }
      return res.json(await enrichRide(searching[searching.length - 1]));
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/rides", async (_req, res) => {
    try {
      const allRides = await storage.getAllRides();
      return res.json(allRides);
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/earnings/chauffeur/:chauffeurId", async (req, res) => {
    try {
      const earningsList = await storage.getEarningsByChauffeur(req.params.chauffeurId);
      return res.json(earningsList);
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/withdrawals", async (req, res) => {
    try {
      const withdrawal = await storage.createWithdrawal(req.body);
      return res.json(withdrawal);
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/withdrawals/chauffeur/:chauffeurId", async (req, res) => {
    try {
      const withdrawalsList = await storage.getWithdrawalsByChauffeur(req.params.chauffeurId);
      return res.json(withdrawalsList);
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/withdrawals", async (_req, res) => {
    try {
      const allWithdrawals = await storage.getAllWithdrawals();
      return res.json(allWithdrawals);
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.put("/api/withdrawals/:id", async (req, res) => {
    try {
      const withdrawal = await storage.updateWithdrawal(req.params.id, req.body);
      if (!withdrawal) return res.status(404).json({ message: "Withdrawal not found" });
      return res.json(withdrawal);
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/messages", async (req, res) => {
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
                const rider = await storage.getUser(ride.clientId);
                if (rider?.pushToken) {
                  sendExpoPushNotification(
                    [rider.pushToken],
                    "New message from chauffeur",
                    previewText,
                    { rideId: ride.id, type: "chat:new" },
                    { urgent: true, channelId: "client-alerts" }
                  );
                }
                await storage.createNotification({ userId: ride.clientId, type: "chat", title: "New message from chauffeur", body: previewText, isRead: false });
              }
            }
          }
        } catch (e) {
          console.error("[chat] notification failed (non-fatal):", e.message);
        }
      }
      return res.json(message);
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/messages/ride/:rideId", async (req, res) => {
    try {
      const messagesList = await storage.getMessagesByRide(req.params.rideId);
      return res.json(messagesList);
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/safety-reports", async (req, res) => {
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
        status: "open"
      });
      await storage.createNotification({
        userId,
        title: type === "emergency" ? "Emergency Report Filed" : "Report Received",
        body: aiResponse,
        type: "safety"
      });
      io.emit("safety:newReport", report);
      return res.json({ report, aiResponse });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/safety-reports/user/:userId", async (req, res) => {
    try {
      const reports = await storage.getSafetyReportsByUser(req.params.userId);
      return res.json(reports);
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/safety-reports", async (_req, res) => {
    try {
      const allReports = await storage.getAllSafetyReports();
      return res.json(allReports);
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.put("/api/safety-reports/:id", async (req, res) => {
    try {
      const report = await storage.updateSafetyReport(req.params.id, req.body);
      if (!report) return res.status(404).json({ message: "Report not found" });
      return res.json(report);
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/notifications/user/:userId", async (req, res) => {
    try {
      const notifs = await storage.getNotificationsByUser(req.params.userId);
      return res.json(notifs);
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.put("/api/notifications/:id/read", async (req, res) => {
    try {
      const notif = await storage.markNotificationRead(req.params.id);
      if (!notif) return res.status(404).json({ message: "Notification not found" });
      return res.json(notif);
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.delete("/api/notifications/user/:userId/all", async (req, res) => {
    try {
      await storage.deleteAllNotificationsByUser(req.params.userId);
      return res.json({ message: "All notifications cleared" });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/trip-enquiries", requireAuth, async (req, res) => {
    try {
      const { rideId, message } = req.body;
      if (!rideId || !message?.trim()) return res.status(400).json({ message: "rideId and message are required" });
      const enquiry = await storage.createTripEnquiry({ rideId, userId: req.auth.sub, message: message.trim() });
      const allUsers = await db2.select().from(users).where((0, import_drizzle_orm4.eq)(users.role, "admin"));
      for (const admin of allUsers) {
        await storage.createNotification({
          userId: admin.id,
          type: "general",
          title: "\u{1F4E9} New Trip Enquiry",
          body: `A user submitted a help request about a trip: "${message.trim().slice(0, 80)}${message.length > 80 ? "\u2026" : ""}"`,
          isRead: false
        });
      }
      return res.json(enquiry);
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/trip-enquiries", requireAuth, requireRole(["admin"]), async (_req, res) => {
    try {
      const enquiries = await storage.getAllTripEnquiries();
      return res.json(enquiries);
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/trip-enquiries/:id/reply", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const { reply } = req.body;
      if (!reply?.trim()) return res.status(400).json({ message: "reply is required" });
      const enquiry = await storage.replyToTripEnquiry(req.params.id, reply.trim());
      if (!enquiry) return res.status(404).json({ message: "Enquiry not found" });
      await storage.createNotification({
        userId: enquiry.userId,
        type: "general",
        title: "\u{1F4AC} Admin replied to your trip enquiry",
        body: reply.trim(),
        isRead: false
      });
      return res.json(enquiry);
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.get(
    "/api/admin/payments",
    requireAuth,
    requireRole(["admin"]),
    async (_req, res) => {
      try {
        const [allPayments, allUsers, allRides] = await Promise.all([
          storage.getAllPayments(),
          storage.getAllUsers ? storage.getAllUsers() : [],
          storage.getAllRides()
        ]);
        const usersById = Object.fromEntries(allUsers.map((u) => [u.id, u]));
        const ridesById = Object.fromEntries(allRides.map((r) => [r.id, r]));
        const enriched = allPayments.map((p) => ({
          ...p,
          riderName: usersById[p.payerUserId]?.name || "Unknown",
          riderEmail: usersById[p.payerUserId]?.username || "\u2014",
          rideRoute: ridesById[p.rideId] ? `${ridesById[p.rideId].pickupAddress || "?"} \u2192 ${ridesById[p.rideId].dropoffAddress || "?"}` : p.rideId ? `Ride ${p.rideId.slice(0, 8)}` : "Wallet top-up"
        }));
        return res.json(enriched);
      } catch (error) {
        return res.status(500).json({ message: error.message });
      }
    }
  );
  app2.get(
    "/api/admin/liveness-selfies",
    requireAuth,
    requireRole(["admin"]),
    async (_req, res) => {
      try {
        const allRides = await storage.getAllRides();
        const selfieRides = allRides.filter((ride) => Boolean(ride.cashSelfieUrl)).sort((a, b) => {
          const left = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const right = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return right - left;
        });
        const records = await Promise.all(
          selfieRides.map(async (ride) => {
            const rider = await storage.getUser(ride.clientId);
            const chauffeur = ride.chauffeurId ? await storage.getChauffeur(ride.chauffeurId) : void 0;
            const chauffeurUser = chauffeur?.userId ? await storage.getUser(chauffeur.userId) : void 0;
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
              createdAt: ride.createdAt
            };
          })
        );
        return res.json(records);
      } catch (error) {
        return res.status(500).json({ message: error.message });
      }
    }
  );
  app2.get(
    "/api/admin/stats",
    requireAuth,
    requireRole(["admin"]),
    async (_req, res) => {
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
          totalPlatformCommission: Math.round(totalPlatformCommission),
          totalDriverEarnings: Math.round(totalDriverEarnings),
          commissionRate: 15,
          totalChauffeurs: allChauffeurs.length,
          onlineChauffeurs: allChauffeurs.filter((c) => c.isOnline).length,
          pendingApprovals: pendingApprovals.length,
          pendingWithdrawals: pendingWithdrawals.length,
          openReports: openReports.length,
          totalReports: allReports.length
        });
      } catch (error) {
        return res.status(500).json({ message: error.message });
      }
    }
  );
  app2.post("/api/admin/seed", async (req, res) => {
    try {
      const { username, password, name, seedSecret } = req.body;
      const existing = await storage.getUserByUsername(username || "admin");
      if (existing && existing.role === "admin") {
        return res.status(400).json({ message: "Admin user already exists" });
      }
      const validSecret = process.env.ADMIN_SEED_SECRET || process.env.JWT_SECRET;
      if (existing && seedSecret !== validSecret) {
        return res.status(403).json({ message: "Invalid seed secret" });
      }
      const hashedPassword = await import_bcryptjs.default.hash(password || "Admin@2026!", 10);
      const user = await storage.createUser({
        username: username || "admin",
        password: hashedPassword,
        name: name || "A2B Admin",
        phone: null,
        role: "admin"
      });
      const { password: _pw, ...safeUser } = user;
      return res.json({ message: "Admin user created", user: safeUser });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/external/health", async (_req, res) => {
    try {
      const result = await externalApiService.healthCheck();
      return res.status(result.statusCode || 200).json(result);
    } catch (error) {
      return res.status(500).json({ success: false, error: error.message });
    }
  });
  app2.get("/api/external/status", async (_req, res) => {
    try {
      const result = await externalApiService.getStatus();
      return res.status(result.statusCode || 200).json(result);
    } catch (error) {
      return res.status(500).json({ success: false, error: error.message });
    }
  });
  app2.use("/api/external", async (req, res, next) => {
    try {
      const endpoint = req.path.replace("/api/external", "") || "/";
      const result = await externalApiService.request(endpoint, {
        method: req.method || "GET",
        body: Object.keys(req.body || {}).length > 0 ? req.body : void 0,
        headers: req.headers
      });
      return res.status(result.statusCode || 200).json(result);
    } catch (error) {
      return res.status(500).json({ success: false, error: error.message });
    }
  });
  const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY || "";
  const paystackAPI = import_axios.default.create({
    baseURL: "https://api.paystack.co",
    headers: {
      Authorization: `Bearer ${PAYSTACK_SECRET}`,
      "Content-Type": "application/json"
    }
  });
  async function recordWalletTx(userId, type, amount, balanceBefore, description, reference, rideId) {
    const balanceAfter = type === "ride_charge" || type === "withdrawal" ? balanceBefore - amount : balanceBefore + amount;
    await storage.createWalletTransaction({
      userId,
      type,
      amount,
      balanceBefore,
      balanceAfter,
      reference,
      description,
      rideId,
      status: "completed"
    });
    return balanceAfter;
  }
  app2.get("/api/payments/webview-callback", (req, res) => {
    const reference = req.query.reference || req.query.trxref || "";
    const appBase = getAppBaseUrl(req);
    const appReturnUrl = process.env.FRONTEND_URL || "https://peaceful-mousse-459c85.netlify.app";
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
  <p class="sub">Your payment was processed. You can close this window \u2014 the app will update automatically.</p>
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
      // If we're still here, closing failed \u2014 show the back button
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
  app2.post("/api/payments/initialize", requireAuth, async (req, res) => {
    try {
      const { amount, email: clientEmail, rideId, saveCard, saveCardOnly } = req.body;
      const userId = req.auth.sub;
      const reference = `A2B-${Date.now()}-${userId.slice(0, 6)}`;
      const user = await storage.getUser(userId);
      const email = user?.email && user.email.includes("@") ? user.email : clientEmail;
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
        ...callbackUrl ? { callback_url: callbackUrl } : {},
        metadata: {
          userId,
          rideId: rideId || null,
          saveCard: saveCard || false,
          saveCardOnly: saveCardOnly || false,
          custom_fields: [
            { display_name: "App", variable_name: "app", value: "A2B LIFT" }
          ]
        },
        channels: ["card"]
      });
      const { authorization_url, access_code, reference: ref } = response.data.data;
      if (rideId) {
        await storage.createPayment({
          rideId,
          payerUserId: userId,
          amount,
          method: "card",
          status: "pending",
          currency: "ZAR",
          paystackReference: reference
        });
      }
      return res.json({ authorizationUrl: authorization_url, accessCode: access_code, reference: ref });
    } catch (error) {
      console.error("[Paystack Initialize]", error.response?.data || error.message);
      return res.status(500).json({ message: "Payment initialization failed" });
    }
  });
  app2.post("/api/payments/verify", requireAuth, async (req, res) => {
    try {
      const { reference } = req.body;
      const userId = req.auth.sub;
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
        const alreadySaved = existingCards.find((c) => c.last4 === auth.last4 && c.expYear === auth.exp_year);
        if (!alreadySaved) {
          await storage.createSavedCard({
            userId,
            paystackAuthCode: auth.authorization_code,
            cardType: auth.card_type,
            last4: auth.last4,
            expMonth: auth.exp_month,
            expYear: auth.exp_year,
            bank: auth.bank,
            isDefault: existingCards.length === 0
          });
        }
      }
      if (metadata.rideId) {
        const payments2 = await storage.getPaymentsByRide(metadata.rideId);
        const pending = payments2.find((p) => p.paystackReference === reference);
        if (pending) {
          await storage.updatePayment(pending.id, {
            status: "paid",
            paidAt: /* @__PURE__ */ new Date(),
            paystackAuthCode: txData.authorization?.authorization_code
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
    } catch (error) {
      console.error("[Paystack Verify]", error.response?.data || error.message);
      const psMsg = error.response?.data?.message;
      if (psMsg) return res.status(400).json({ message: psMsg });
      return res.status(500).json({ message: "Payment verification failed" });
    }
  });
  app2.post("/api/payments/charge-card", requireAuth, async (req, res) => {
    try {
      const { cardId, rideId, amount, email } = req.body;
      const userId = req.auth.sub;
      const card = await storage.getSavedCard(cardId);
      if (!card || card.userId !== userId) {
        return res.status(404).json({ message: "Card not found" });
      }
      const reference = `A2B-RIDE-${rideId}-${Date.now()}`;
      const response = await paystackAPI.post("/transaction/charge_authorization", {
        authorization_code: card.paystackAuthCode,
        email,
        amount: Math.round(amount * 100),
        currency: "ZAR",
        reference,
        metadata: { userId, rideId }
      });
      const txData = response.data.data;
      if (txData.status === "success") {
        await storage.createPayment({
          rideId,
          payerUserId: userId,
          amount,
          method: "card",
          status: "paid",
          currency: "ZAR",
          paidAt: /* @__PURE__ */ new Date(),
          paystackReference: reference
        });
        await storage.updateRide(rideId, { paymentStatus: "paid" });
        return res.json({ success: true, reference });
      }
      return res.status(400).json({ message: "Card charge failed", status: txData.status });
    } catch (error) {
      console.error("[Paystack Charge Card]", error.response?.data || error.message);
      return res.status(500).json({ message: "Card charge failed" });
    }
  });
  app2.post("/api/payments/charge-ride", requireAuth, async (req, res) => {
    try {
      const { rideId } = req.body;
      const userId = req.auth.sub;
      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ message: "User not found" });
      const ride = await storage.getRide(rideId);
      if (!ride) return res.status(404).json({ message: "Ride not found" });
      const cards = await storage.getSavedCardsByUser(userId);
      const defaultCard = cards.find((c) => c.isDefault) || cards[0];
      if (!defaultCard) {
        return res.status(400).json({ message: "No saved card found. Please add a card in your wallet.", needsCard: true });
      }
      const amount = ride.price || ride.totalPrice || ride.estimatedPrice;
      if (!amount) return res.status(400).json({ message: "Ride has no price set" });
      const reference = `A2B-RIDE-${rideId}-${Date.now()}`;
      const response = await paystackAPI.post("/transaction/charge_authorization", {
        authorization_code: defaultCard.paystackAuthCode,
        email: user.username,
        amount: Math.round(Number(amount) * 100),
        currency: "ZAR",
        reference,
        metadata: { userId, rideId }
      });
      const txData = response.data.data;
      if (txData.status === "success") {
        await storage.createPayment({
          rideId,
          payerUserId: userId,
          amount: Number(amount),
          method: "card",
          status: "paid",
          currency: "ZAR",
          paidAt: /* @__PURE__ */ new Date(),
          paystackReference: reference,
          paystackAuthCode: defaultCard.paystackAuthCode
        });
        await storage.updateRide(rideId, { paymentStatus: "paid" });
        return res.json({ success: true, reference, card: { last4: defaultCard.last4, cardType: defaultCard.cardType } });
      }
      return res.status(400).json({ message: "Card charge failed", status: txData.status });
    } catch (error) {
      console.error("[Paystack Charge Ride]", error.response?.data || error.message);
      return res.status(500).json({ message: "Card charge failed" });
    }
  });
  app2.post("/api/payments/pay-wallet", requireAuth, async (req, res) => {
    try {
      const { rideId } = req.body;
      let { amount } = req.body;
      const userId = req.auth.sub;
      if (!amount) {
        const ride = await storage.getRide(rideId);
        if (!ride) return res.status(404).json({ message: "Ride not found" });
        amount = ride.price || ride.totalPrice || ride.estimatedPrice;
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
        rideId,
        payerUserId: userId,
        amount,
        method: "wallet",
        status: "paid",
        currency: "ZAR",
        paidAt: /* @__PURE__ */ new Date()
      });
      await storage.updateRide(rideId, { paymentStatus: "paid" });
      await recordWalletTx(userId, "ride_charge", amount, balanceBefore, "Ride payment", void 0, rideId);
      return res.json({ success: true, newBalance });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/payments/cards", requireAuth, async (req, res) => {
    try {
      const cards = await storage.getSavedCardsByUser(req.auth.sub);
      return res.json(cards);
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.delete("/api/payments/cards/:id", requireAuth, async (req, res) => {
    try {
      await storage.deleteSavedCard(req.params.id);
      return res.json({ success: true });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.put("/api/payments/cards/:id/default", requireAuth, async (req, res) => {
    try {
      const userId = req.auth.sub;
      const cards = await storage.getSavedCardsByUser(userId);
      for (const card of cards) {
        await storage.updateSavedCard(card.id, { isDefault: card.id === req.params.id });
      }
      return res.json({ success: true });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/wallet/transactions", requireAuth, async (req, res) => {
    try {
      const txs = await storage.getWalletTransactions(req.auth.sub);
      return res.json(txs);
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/wallet/withdraw", requireAuth, async (req, res) => {
    try {
      const { amount, bankCode, bankName: bankNameInput, accountNumber, accountName } = req.body;
      const userId = req.auth.sub;
      if (!amount || !bankCode || !accountNumber || !accountName) {
        return res.status(400).json({ message: "amount, bankCode, accountNumber and accountName are required" });
      }
      const chauffeur = await storage.getChauffeurByUserId(userId);
      if (!chauffeur) return res.status(404).json({ message: "Chauffeur not found" });
      if ((chauffeur.earningsTotal || 0) < amount) {
        return res.status(400).json({ message: `You only have R${(chauffeur.earningsTotal || 0).toFixed(2)} available to withdraw. Please enter a lower amount.` });
      }
      const recipientRes = await paystackAPI.post("/transferrecipient", {
        type: "nuban",
        name: accountName,
        account_number: accountNumber,
        bank_code: bankCode,
        currency: "ZAR"
      });
      const recipientCode = recipientRes.data.data.recipient_code;
      const transferRef = `A2B-WITHDRAW-${Date.now()}`;
      const transferRes = await paystackAPI.post("/transfer", {
        source: "balance",
        amount: Math.round(amount * 100),
        recipient: recipientCode,
        reason: "A2B LIFT earnings withdrawal",
        reference: transferRef,
        currency: "ZAR"
      });
      const transferCode = transferRes.data.data.transfer_code;
      const status = transferRes.data.data.status;
      await storage.createWithdrawal({
        chauffeurId: chauffeur.id,
        amount,
        status: status === "success" ? "completed" : "pending",
        bankName: bankNameInput || bankCode,
        accountNumber,
        accountHolder: accountName,
        paystackTransferCode: transferCode,
        paystackRecipientCode: recipientCode
      });
      await storage.updateChauffeur(chauffeur.id, {
        earningsTotal: (chauffeur.earningsTotal || 0) - amount
      });
      return res.json({
        success: true,
        message: status === "success" ? "Transfer successful" : "Transfer initiated \u2014 funds arrive within 24hrs",
        transferCode,
        status
      });
    } catch (error) {
      console.error("[Paystack Withdraw]", error.response?.data || error.message);
      return res.status(500).json({ message: error.response?.data?.message || error.message });
    }
  });
  app2.get("/api/wallet/banks", async (_req, res) => {
    try {
      const response = await paystackAPI.get("/bank?currency=ZAR&country=south+africa");
      const banks = response.data.data.map((b) => ({ name: b.name, code: b.code, id: b.id }));
      return res.json(banks);
    } catch (error) {
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
        { name: "VBS Mutual Bank", code: "588000" }
      ]);
    }
  });
  app2.post("/api/payments/webhook", async (req, res) => {
    try {
      const hash = import_node_crypto.default.createHmac("sha512", PAYSTACK_SECRET).update(JSON.stringify(req.body)).digest("hex");
      if (hash !== req.headers["x-paystack-signature"]) {
        return res.status(401).json({ message: "Invalid signature" });
      }
      const { event, data } = req.body;
      if (event === "charge.success") {
        console.log("[Webhook] Payment successful:", data.reference);
      }
      if (event === "transfer.success") {
        await storage.updateWithdrawalByTransferCode(data.transfer_code, {
          status: "completed",
          processedAt: /* @__PURE__ */ new Date()
        });
      }
      if (event === "transfer.failed") {
        await storage.updateWithdrawalByTransferCode(data.transfer_code, { status: "failed" });
      }
      return res.sendStatus(200);
    } catch (error) {
      console.error("[Webhook Error]", error.message);
      return res.sendStatus(200);
    }
  });
  app2.post("/api/rides/:id/select-route", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const { selectedRouteId, distanceKm, fare, currency = "ZAR" } = req.body;
      if (distanceKm == null || fare == null || !selectedRouteId) {
        return res.status(400).json({ error: "selectedRouteId, distanceKm and fare are required" });
      }
      const ride = await storage.getRide(id);
      if (!ride) return res.status(404).json({ error: "Ride not found" });
      const authedReq = req;
      const chauffeur = authedReq.auth?.role !== "admin" ? await storage.getChauffeur(ride.chauffeurId ?? "") : null;
      if (chauffeur && chauffeur.userId !== authedReq.auth.sub) {
        return res.status(403).json({ error: "Forbidden" });
      }
      await storage.updateRide(id, {
        selectedRouteId,
        selectedRouteDistanceKm: distanceKm,
        actualFare: fare,
        routeCurrency: currency,
        routeSelectedAt: /* @__PURE__ */ new Date()
      });
      io.to(`ride:${id}`).emit("route_confirmed", {
        rideId: id,
        selectedRouteId,
        distanceKm,
        fare,
        currency,
        confirmedAt: (/* @__PURE__ */ new Date()).toISOString()
      });
      return res.json({ success: true, rideId: id, lockedFare: fare });
    } catch (err) {
      console.error("[select-route]", err.message);
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.post("/api/rides/:id/upload-photo", requireAuth, async (req, res) => {
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
        userId: req.auth.sub,
        rideId: id,
        photoBase64,
        mimeType: mimeType || "image/jpeg",
        photoType
      });
      if (!result.success) {
        return res.status(500).json({ error: result.error || "Upload failed" });
      }
      return res.json({ success: true, storagePath: result.storagePath, publicUrl: result.publicUrl });
    } catch (err) {
      console.error("[upload-photo]", err.message);
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.get("/api/admin/rides/:id/photos", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const ride = await storage.getRide(req.params.id);
      if (!ride) return res.status(404).json({ error: "Ride not found" });
      const livSessions = await db2.select().from(livenessSessions).where((0, import_drizzle_orm4.eq)(livenessSessions.rideId, req.params.id)).orderBy((0, import_drizzle_orm4.desc)(livenessSessions.createdAt));
      const SUPABASE_URL2 = process.env.SUPABASE_URL || "https://zzwkieiktbhptvgsqerd.supabase.co";
      const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
      async function makeSignedUrl(bucket, path2) {
        if (!path2 || !SERVICE_KEY) return null;
        const bare = path2.replace(/^https?:\/\/[^/]+\/storage\/v1\/object\/(?:public|sign)\/[^/]+\//, "");
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
          signedUrl: await makeSignedUrl("liveness-photos", sess.verifiedPhotoUrl ?? sess.selfieUrl)
        }))
      );
      return res.json({
        rideId: req.params.id,
        cashSelfie: {
          storagePath: ride.cashSelfieUrl,
          signedUrl: cashSelfieSignedUrl
        },
        livenessPhotos: livPhotos
      });
    } catch (err) {
      console.error("[admin/rides/photos]", err.message);
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  return httpServer;
}

// server/index.ts
var import_cookie_parser = __toESM(require("cookie-parser"));
var import_helmet = __toESM(require("helmet"));
var fs = __toESM(require("fs"));
var path = __toESM(require("path"));
var import_http_proxy_middleware = require("http-proxy-middleware");
var app = (0, import_express.default)();
var log = console.log;
function setupCors(app2) {
  app2.use((req, res, next) => {
    const origins = /* @__PURE__ */ new Set();
    origins.add("https://a2b-lift.onrender.com");
    origins.add("https://peaceful-mousse-459c85.netlify.app");
    if (process.env.RAILWAY_PUBLIC_DOMAIN) {
      origins.add(`https://${process.env.RAILWAY_PUBLIC_DOMAIN}`);
    }
    if (process.env.REPLIT_DEV_DOMAIN) {
      origins.add(`https://${process.env.REPLIT_DEV_DOMAIN}`);
    }
    if (process.env.REPLIT_DOMAINS) {
      process.env.REPLIT_DOMAINS.split(",").forEach((d) => {
        origins.add(`https://${d.trim()}`);
      });
    }
    const origin = req.header("origin");
    const isLocalhost = origin?.startsWith("http://localhost:") || origin?.startsWith("http://127.0.0.1:") || origin?.startsWith("http://192.168.") || origin?.startsWith("http://10.") || origin?.includes(".exp.direct") || origin?.includes(".trycloudflare.com") || origin?.includes(".serveousercontent.com") || origin?.includes(".gitpod.dev") || origin?.includes(".up.railway.app") || origin?.includes(".netlify.app") || origin?.match(/^http:\/\/172\.(1[6-9]|2[0-9]|3[0-1])\./) !== null;
    if (origin && (origins.has(origin) || isLocalhost)) {
      res.header("Access-Control-Allow-Origin", origin);
      res.header(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, DELETE, OPTIONS"
      );
      res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
      res.header("Access-Control-Allow-Credentials", "true");
    }
    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }
    next();
  });
}
function setupSecurity(app2) {
  app2.use(
    (0, import_helmet.default)({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://unpkg.com", "https://cdn.jsdelivr.net"],
          scriptSrcElem: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://unpkg.com", "https://cdn.jsdelivr.net"],
          scriptSrcAttr: ["'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
          styleSrcElem: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
          fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'", "https:", "wss:"],
          frameAncestors: ["'self'", "https://*.replit.dev", "https://*.repl.co", "https://*.replit.com", "https://*.replit.app"]
        }
      },
      frameguard: false
    })
  );
  app2.use((0, import_cookie_parser.default)());
}
function setupBodyParsing(app2) {
  app2.use(
    import_express.default.json({
      limit: "20mb",
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      }
    })
  );
  app2.use(import_express.default.urlencoded({ extended: false }));
}
function setupRequestLogging(app2) {
  app2.use((req, res, next) => {
    const start = Date.now();
    const requestPath = req.path;
    let capturedJsonResponse = void 0;
    const originalResJson = res.json;
    res.json = function(bodyJson, ...args) {
      capturedJsonResponse = bodyJson;
      return originalResJson.apply(res, [bodyJson, ...args]);
    };
    res.on("finish", () => {
      if (!requestPath.startsWith("/api")) return;
      const duration = Date.now() - start;
      let logLine = `${req.method} ${requestPath} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }
      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "\u2026";
      }
      log(logLine);
    });
    next();
  });
}
var METRO_PORTS = [8081, 8080, 8082];
var resolvedMetroPort = 8081;
async function detectMetroPort() {
  const net = await import("net");
  for (const port of METRO_PORTS) {
    const open = await new Promise((resolve2) => {
      const s = net.createConnection({ port, host: "127.0.0.1" });
      s.once("connect", () => {
        s.destroy();
        resolve2(true);
      });
      s.once("error", () => resolve2(false));
    });
    if (open) {
      resolvedMetroPort = port;
      return port;
    }
  }
  return resolvedMetroPort;
}
function hasStaticBuild() {
  return fs.existsSync(path.resolve(process.cwd(), "static-build", "index.html"));
}
function makeMetroProxy(port) {
  return (0, import_http_proxy_middleware.createProxyMiddleware)({
    target: `http://localhost:${port}`,
    changeOrigin: true,
    on: {
      proxyReq: (proxyReq) => {
        proxyReq.setHeader("Origin", `http://localhost:${port}`);
        proxyReq.setHeader("Host", `localhost:${port}`);
      },
      error: (_err, _req, res) => {
        if (res && typeof res.status === "function") {
          res.status(502).json({ error: "Metro bundler not reachable \u2014 is Start Frontend running?" });
        }
      }
    }
  });
}
var metroProxy = makeMetroProxy(8081);
async function configureExpoAndLanding(app2) {
  const isRailwayRuntime = Boolean(
    process.env.RAILWAY_PUBLIC_DOMAIN || process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID || process.env.RAILWAY_SERVICE_ID
  );
  const isProductionRuntime = process.env.NODE_ENV === "production" || isRailwayRuntime;
  const appPort = Number.parseInt(process.env.PORT || "", 10);
  let allowMetroProxy = !isProductionRuntime;
  const adminTemplatePath = path.resolve(
    process.cwd(),
    "server",
    "templates",
    "admin.html"
  );
  const adminTemplate = fs.readFileSync(adminTemplatePath, "utf-8");
  let metroPort = resolvedMetroPort;
  if (allowMetroProxy) {
    metroPort = await detectMetroPort();
    if (Number.isFinite(appPort) && appPort === metroPort) {
      allowMetroProxy = false;
      log(`Metro proxy disabled because target port ${metroPort} equals app PORT ${appPort}`);
    }
    metroProxy = makeMetroProxy(metroPort);
    log(`Metro bundler detected on port ${metroPort}`);
  }
  const staticBuildExists = hasStaticBuild();
  if (!allowMetroProxy) {
    log(`Static build: ${staticBuildExists ? "found" : "not found"} \u2014 production mode (Metro proxy disabled)`);
  } else {
    log(`Static build: ${staticBuildExists ? "found" : "not found"} \u2014 routing non-API traffic to Metro:${metroPort}`);
  }
  const serveAdmin = (_req, res) => {
    const freshTemplate = fs.readFileSync(adminTemplatePath, "utf-8");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.status(200).send(freshTemplate);
  };
  app2.get("/admin", serveAdmin);
  app2.get("/a2b-admin", serveAdmin);
  app2.use("/assets", import_express.default.static(path.resolve(process.cwd(), "assets")));
  if (staticBuildExists) {
    app2.use(import_express.default.static(path.resolve(process.cwd(), "static-build")));
    app2.use((req, res, next) => {
      if (req.path.startsWith("/api")) return next();
      const platform = req.header("expo-platform");
      if (allowMetroProxy && (platform === "ios" || platform === "android")) {
        log(`[Metro proxy] ${platform} manifest \u2192 Metro:${metroPort}`);
        return metroProxy(req, res, next);
      }
      const staticIndex = path.resolve(process.cwd(), "static-build", "index.html");
      res.sendFile(staticIndex);
    });
  } else if (allowMetroProxy) {
    app2.use((req, res, next) => {
      if (req.path.startsWith("/api")) return next();
      if (req.path === "/admin" || req.path === "/a2b-admin" || req.path.startsWith("/admin/") || req.path.startsWith("/a2b-admin/")) return next();
      if (req.path.startsWith("/socket.io")) return next();
      const platform = req.header("expo-platform") || "web";
      log(`[Metro proxy] ${platform} ${req.path} \u2192 Metro:${metroPort}`);
      return metroProxy(req, res, next);
    });
  } else {
    app2.use((req, res, next) => {
      if (req.path.startsWith("/api")) return next();
      if (req.path === "/admin" || req.path === "/a2b-admin" || req.path.startsWith("/admin/") || req.path.startsWith("/a2b-admin/")) return next();
      if (req.path.startsWith("/socket.io")) return next();
      return res.status(404).json({ message: "Web build not available on this deployment" });
    });
  }
  log("Expo routing configured");
}
function setupErrorHandler(app2) {
  app2.use((err, _req, res, next) => {
    const error = err;
    const status = error.status || error.statusCode || 500;
    const message = error.message || "Internal Server Error";
    console.error("Internal Server Error:", err);
    if (res.headersSent) {
      return next(err);
    }
    return res.status(status).json({ message });
  });
}
(async () => {
  setupCors(app);
  setupSecurity(app);
  setupBodyParsing(app);
  setupRequestLogging(app);
  await configureExpoAndLanding(app);
  const server = await registerRoutes(app);
  setupErrorHandler(app);
  const port = parseInt(process.env.PORT || "5000", 10);
  const portSource = process.env.PORT ? "process.env.PORT" : "default (5000)";
  server.listen(
    {
      port,
      host: "0.0.0.0",
      // Listen on all interfaces for deployment
      reusePort: true
    },
    () => {
      log(`express server serving on port ${port} (from ${portSource})`);
    }
  );
})();

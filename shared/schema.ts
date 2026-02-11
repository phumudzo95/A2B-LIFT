import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  varchar,
  integer,
  boolean,
  real,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  name: text("name").notNull(),
  phone: text("phone"),
  role: text("role").notNull().default("client"),
  rating: real("rating").default(5.0),
  walletBalance: real("wallet_balance").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const chauffeurs = pgTable("chauffeurs", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id")
    .notNull()
    .references(() => users.id),
  vehicleModel: text("vehicle_model").notNull(),
  plateNumber: text("plate_number").notNull(),
  vehicleType: text("vehicle_type").notNull(),
  carColor: text("car_color").notNull(),
  passengerCapacity: integer("passenger_capacity").default(4),
  luggageCapacity: integer("luggage_capacity").default(2),
  isOnline: boolean("is_online").default(false),
  isApproved: boolean("is_approved").default(false),
  earningsTotal: real("earnings_total").default(0),
  lat: real("lat"),
  lng: real("lng"),
  locationUpdatedAt: timestamp("location_updated_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const rides = pgTable("rides", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  clientId: varchar("client_id")
    .notNull()
    .references(() => users.id),
  chauffeurId: varchar("chauffeur_id").references(() => chauffeurs.id),
  pickupLat: real("pickup_lat").notNull(),
  pickupLng: real("pickup_lng").notNull(),
  pickupAddress: text("pickup_address"),
  dropoffLat: real("dropoff_lat").notNull(),
  dropoffLng: real("dropoff_lng").notNull(),
  dropoffAddress: text("dropoff_address"),
  status: text("status").notNull().default("requested"),
  price: real("price"),
  distanceKm: real("distance_km"),
  durationMin: real("duration_min"),
  vehicleType: text("vehicle_type"),
  paymentMethod: text("payment_method").default("cash"),
  createdAt: timestamp("created_at").defaultNow(),
  completedAt: timestamp("completed_at"),
});

export const earnings = pgTable("earnings", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  chauffeurId: varchar("chauffeur_id")
    .notNull()
    .references(() => chauffeurs.id),
  rideId: varchar("ride_id").references(() => rides.id),
  amount: real("amount").notNull(),
  commission: real("commission").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const withdrawals = pgTable("withdrawals", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  chauffeurId: varchar("chauffeur_id")
    .notNull()
    .references(() => chauffeurs.id),
  amount: real("amount").notNull(),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const messages = pgTable("messages", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  rideId: varchar("ride_id")
    .notNull()
    .references(() => rides.id),
  senderId: varchar("sender_id")
    .notNull()
    .references(() => users.id),
  messageText: text("message_text").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
  name: true,
  phone: true,
  role: true,
});

export const insertChauffeurSchema = createInsertSchema(chauffeurs).pick({
  userId: true,
  vehicleModel: true,
  plateNumber: true,
  vehicleType: true,
  carColor: true,
  passengerCapacity: true,
  luggageCapacity: true,
});

export const insertRideSchema = createInsertSchema(rides).pick({
  clientId: true,
  pickupLat: true,
  pickupLng: true,
  pickupAddress: true,
  dropoffLat: true,
  dropoffLng: true,
  dropoffAddress: true,
  vehicleType: true,
  paymentMethod: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type Chauffeur = typeof chauffeurs.$inferSelect;
export type Ride = typeof rides.$inferSelect;
export type Earning = typeof earnings.$inferSelect;
export type Withdrawal = typeof withdrawals.$inferSelect;
export type Message = typeof messages.$inferSelect;

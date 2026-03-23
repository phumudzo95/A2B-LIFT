// ============================================================
// ADD THESE TO shared/schema.ts
// Add after the existing table definitions
// ============================================================

export const savedCards = pgTable("saved_cards", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  paystackAuthCode: text("paystack_auth_code").notNull(),
  cardType: text("card_type"),
  last4: varchar("last4", { length: 4 }),
  expMonth: varchar("exp_month", { length: 2 }),
  expYear: varchar("exp_year", { length: 4 }),
  bank: text("bank"),
  isDefault: boolean("is_default").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const walletTransactions = pgTable("wallet_transactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  type: text("type").notNull(), // topup | ride_charge | earning | withdrawal | refund
  amount: real("amount").notNull(),
  balanceBefore: real("balance_before").notNull(),
  balanceAfter: real("balance_after").notNull(),
  reference: varchar("reference"),
  description: text("description"),
  rideId: varchar("ride_id"),
  status: text("status").default("completed"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Add these types at the bottom of schema.ts:
export type SavedCard = typeof savedCards.$inferSelect;
export type WalletTransaction = typeof walletTransactions.$inferSelect;

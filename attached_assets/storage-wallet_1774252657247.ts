// ============================================================
// ADD THESE METHODS TO server/storage.ts
// Add to the IStorage interface AND DatabaseStorage class
// ============================================================

// ── In IStorage interface, add these: ──
/*
  getSavedCard(id: string): Promise<any>;
  getSavedCardsByUser(userId: string): Promise<any[]>;
  createSavedCard(data: any): Promise<any>;
  deleteSavedCard(id: string): Promise<void>;
  
  createWalletTransaction(data: any): Promise<any>;
  getWalletTransactions(userId: string): Promise<any[]>;
  
  createWithdrawal(data: any): Promise<any>;
  updateWithdrawalByTransferCode(transferCode: string, data: any): Promise<any>;
*/

// ── Add these to DatabaseStorage class: ──

async getSavedCard(id: string) {
  const [card] = await db.select().from(savedCards).where(eq(savedCards.id, id));
  return card;
}

async getSavedCardsByUser(userId: string) {
  return db.select().from(savedCards)
    .where(eq(savedCards.userId, userId))
    .orderBy(desc(savedCards.createdAt));
}

async createSavedCard(data: any) {
  const [card] = await db.insert(savedCards).values(data).returning();
  return card;
}

async deleteSavedCard(id: string) {
  await db.delete(savedCards).where(eq(savedCards.id, id));
}

async createWalletTransaction(data: any) {
  const [tx] = await db.insert(walletTransactions).values(data).returning();
  return tx;
}

async getWalletTransactions(userId: string) {
  return db.select().from(walletTransactions)
    .where(eq(walletTransactions.userId, userId))
    .orderBy(desc(walletTransactions.createdAt))
    .limit(50);
}

async updateWithdrawalByTransferCode(transferCode: string, data: any) {
  const [w] = await db.update(withdrawals)
    .set(data)
    .where(eq(withdrawals.paystackTransferCode, transferCode))
    .returning();
  return w;
}

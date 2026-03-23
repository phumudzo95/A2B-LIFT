// ============================================================
// PAYSTACK PAYMENT ROUTES — add these to server/routes.ts
// Place after the existing payments routes
// ============================================================

import axios from "axios";

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY || "";
const paystackAPI = axios.create({
  baseURL: "https://api.paystack.co",
  headers: {
    Authorization: `Bearer ${PAYSTACK_SECRET}`,
    "Content-Type": "application/json",
  },
});

// ── Helper: record wallet transaction ──
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

// ─────────────────────────────────────────
// 1. INITIALIZE CARD PAYMENT (client adds card or pays)
// POST /api/payments/initialize
// ─────────────────────────────────────────
app.post("/api/payments/initialize", requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const { amount, email, rideId, saveCard } = req.body;
    const userId = req.auth!.sub;

    const reference = `A2B-${Date.now()}-${userId.slice(0, 6)}`;

    const response = await paystackAPI.post("/transaction/initialize", {
      email,
      amount: Math.round(amount * 100), // Paystack uses kobo/cents
      currency: "ZAR",
      reference,
      metadata: {
        userId,
        rideId: rideId || null,
        saveCard: saveCard || false,
        custom_fields: [
          { display_name: "App", variable_name: "app", value: "A2B LIFT" }
        ],
      },
      channels: ["card"],
    });

    const { authorization_url, access_code, reference: ref } = response.data.data;

    // Record pending payment in DB
    if (rideId) {
      await storage.createPayment({
        rideId,
        payerUserId: userId,
        amount,
        method: "card",
        status: "pending",
        currency: "ZAR",
        paystackReference: reference,
      });
    }

    return res.json({ authorizationUrl: authorization_url, accessCode: access_code, reference: ref });
  } catch (error: any) {
    console.error("[Paystack Initialize]", error.response?.data || error.message);
    return res.status(500).json({ message: "Payment initialization failed" });
  }
});

// ─────────────────────────────────────────
// 2. VERIFY PAYMENT & SAVE CARD
// POST /api/payments/verify
// ─────────────────────────────────────────
app.post("/api/payments/verify", requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const { reference } = req.body;
    const userId = req.auth!.sub;

    const response = await paystackAPI.get(`/transaction/verify/${reference}`);
    const txData = response.data.data;

    if (txData.status !== "success") {
      return res.status(400).json({ message: "Payment not successful", status: txData.status });
    }

    const amount = txData.amount / 100; // Convert back from kobo
    const metadata = txData.metadata || {};

    // Save card if requested
    if (metadata.saveCard && txData.authorization?.reusable) {
      const auth = txData.authorization;
      // Check if card already saved
      const existingCards = await storage.getSavedCardsByUser(userId);
      const alreadySaved = existingCards.find(c => c.last4 === auth.last4 && c.expYear === auth.exp_year);
      
      if (!alreadySaved) {
        await storage.createSavedCard({
          userId,
          paystackAuthCode: auth.authorization_code,
          cardType: auth.card_type,
          last4: auth.last4,
          expMonth: auth.exp_month,
          expYear: auth.exp_year,
          bank: auth.bank,
          isDefault: existingCards.length === 0, // First card = default
        });
      }
    }

    // Update payment record
    if (metadata.rideId) {
      const payments = await storage.getPaymentsByRide(metadata.rideId);
      const pending = payments.find(p => p.paystackReference === reference);
      if (pending) {
        await storage.updatePayment(pending.id, {
          status: "paid",
          paidAt: new Date(),
          paystackAuthCode: txData.authorization?.authorization_code,
        });
      }
      // Update ride payment status
      await storage.updateRide(metadata.rideId, { paymentStatus: "paid" });
    }

    // Add to wallet if it's a topup
    if (!metadata.rideId) {
      const user = await storage.getUser(userId);
      const balanceBefore = user?.walletBalance || 0;
      const newBalance = balanceBefore + amount;
      await storage.updateUser(userId, { walletBalance: newBalance });
      await recordWalletTx(userId, "topup", amount, balanceBefore, `Wallet top-up via card`, reference);
    }

    return res.json({ success: true, amount, status: "paid" });
  } catch (error: any) {
    console.error("[Paystack Verify]", error.response?.data || error.message);
    return res.status(500).json({ message: "Payment verification failed" });
  }
});

// ─────────────────────────────────────────
// 3. CHARGE SAVED CARD (for rides)
// POST /api/payments/charge-card
// ─────────────────────────────────────────
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
      email,
      amount: Math.round(amount * 100),
      currency: "ZAR",
      reference,
      metadata: { userId, rideId },
    });

    const txData = response.data.data;

    if (txData.status === "success") {
      await storage.createPayment({
        rideId, payerUserId: userId, amount,
        method: "card", status: "paid",
        currency: "ZAR", paidAt: new Date(),
        paystackReference: reference,
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

// ─────────────────────────────────────────
// 4. PAY WITH WALLET BALANCE
// POST /api/payments/pay-wallet
// ─────────────────────────────────────────
app.post("/api/payments/pay-wallet", requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const { rideId, amount } = req.body;
    const userId = req.auth!.sub;

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
    await recordWalletTx(userId, "ride_charge", amount, balanceBefore, `Ride payment`, undefined, rideId);

    return res.json({ success: true, newBalance });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
});

// ─────────────────────────────────────────
// 5. GET SAVED CARDS
// GET /api/payments/cards
// ─────────────────────────────────────────
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

// ─────────────────────────────────────────
// 6. WALLET TRANSACTIONS HISTORY
// GET /api/wallet/transactions
// ─────────────────────────────────────────
app.get("/api/wallet/transactions", requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const txs = await storage.getWalletTransactions(req.auth!.sub);
    return res.json(txs);
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
});

// ─────────────────────────────────────────
// 7. CHAUFFEUR: CREATE BANK RECIPIENT & WITHDRAW
// POST /api/wallet/withdraw
// ─────────────────────────────────────────
app.post("/api/wallet/withdraw", requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const { amount, bankCode, accountNumber, accountName } = req.body;
    const userId = req.auth!.sub;

    if (!amount || !bankCode || !accountNumber || !accountName) {
      return res.status(400).json({ message: "amount, bankCode, accountNumber and accountName are required" });
    }

    const chauffeur = await storage.getChauffeurByUserId(userId);
    if (!chauffeur) return res.status(404).json({ message: "Chauffeur not found" });

    if ((chauffeur.earningsTotal || 0) < amount) {
      return res.status(400).json({ message: "Insufficient earnings balance" });
    }

    // Step 1: Create transfer recipient on Paystack
    const recipientRes = await paystackAPI.post("/transferrecipient", {
      type: "nuban",
      name: accountName,
      account_number: accountNumber,
      bank_code: bankCode,
      currency: "ZAR",
    });

    const recipientCode = recipientRes.data.data.recipient_code;

    // Step 2: Initiate transfer
    const transferRef = `A2B-WITHDRAW-${Date.now()}`;
    const transferRes = await paystackAPI.post("/transfer", {
      source: "balance",
      amount: Math.round(amount * 100),
      recipient: recipientCode,
      reason: `A2B LIFT earnings withdrawal`,
      reference: transferRef,
      currency: "ZAR",
    });

    const transferCode = transferRes.data.data.transfer_code;
    const status = transferRes.data.data.status;

    // Record withdrawal
    await storage.createWithdrawal({
      chauffeurId: chauffeur.id,
      amount,
      status: status === "success" ? "completed" : "pending",
      bankName: bankCode,
      accountNumber,
      accountHolder: accountName,
      paystackTransferCode: transferCode,
      paystackRecipientCode: recipientCode,
    });

    // Deduct from earnings
    await storage.updateChauffeur(chauffeur.id, {
      earningsTotal: (chauffeur.earningsTotal || 0) - amount,
    });

    return res.json({
      success: true,
      message: status === "success" ? "Transfer successful" : "Transfer initiated — funds arrive within 24hrs",
      transferCode,
      status,
    });
  } catch (error: any) {
    console.error("[Paystack Withdraw]", error.response?.data || error.message);
    return res.status(500).json({ message: error.response?.data?.message || error.message });
  }
});

// ─────────────────────────────────────────
// 8. GET SA BANKS LIST (for withdrawal form)
// GET /api/wallet/banks
// ─────────────────────────────────────────
app.get("/api/wallet/banks", async (_req: Request, res: Response) => {
  try {
    const response = await paystackAPI.get("/bank?currency=ZAR&country=south+africa");
    const banks = response.data.data.map((b: any) => ({
      name: b.name,
      code: b.code,
      id: b.id,
    }));
    return res.json(banks);
  } catch (error: any) {
    // Fallback common SA banks if API fails
    return res.json([
      { name: "Absa Bank", code: "632005" },
      { name: "Capitec Bank", code: "470010" },
      { name: "First National Bank (FNB)", code: "250655" },
      { name: "Nedbank", code: "198765" },
      { name: "Standard Bank", code: "051001" },
      { name: "African Bank", code: "430000" },
      { name: "Discovery Bank", code: "679000" },
      { name: "TymeBank", code: "678910" },
    ]);
  }
});

// ─────────────────────────────────────────
// 9. PAYSTACK WEBHOOK (payment confirmations)
// POST /api/payments/webhook
// ─────────────────────────────────────────
app.post("/api/payments/webhook", async (req: Request, res: Response) => {
  try {
    const hash = require("crypto")
      .createHmac("sha512", PAYSTACK_SECRET)
      .update(JSON.stringify(req.body))
      .digest("hex");

    if (hash !== req.headers["x-paystack-signature"]) {
      return res.status(401).json({ message: "Invalid signature" });
    }

    const { event, data } = req.body;

    if (event === "charge.success") {
      const ref = data.reference;
      console.log("[Webhook] Payment successful:", ref);
      // Additional processing can go here
    }

    if (event === "transfer.success") {
      const transferCode = data.transfer_code;
      console.log("[Webhook] Transfer successful:", transferCode);
      // Update withdrawal status
      await storage.updateWithdrawalByTransferCode(transferCode, { status: "completed", processedAt: new Date() });
    }

    if (event === "transfer.failed") {
      const transferCode = data.transfer_code;
      await storage.updateWithdrawalByTransferCode(transferCode, { status: "failed" });
    }

    return res.sendStatus(200);
  } catch (error: any) {
    console.error("[Webhook Error]", error.message);
    return res.sendStatus(200); // Always return 200 to Paystack
  }
});

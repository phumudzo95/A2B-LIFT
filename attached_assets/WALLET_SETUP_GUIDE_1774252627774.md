# A2B LIFT — Wallet Feature Setup Guide
# Paystack + Railway + Replit Instructions

=======================================================
## WHAT WAS ALREADY DONE FOR YOU (no action needed)
=======================================================

✅ Supabase tables created:
   - saved_cards (stores card tokens)
   - wallet_transactions (full money history)
   - withdrawals updated (added paystack columns)
   - payments updated (added paystack reference)

=======================================================
## STEP 1 — Install axios in Replit
=======================================================

In Replit, look for the SHELL tab at the bottom of the screen.
If you don't see Shell, click the three dots (...) at the top → Shell.

Type this and press Enter:
   npm install axios

Wait for it to finish.

=======================================================
## STEP 2 — Add files in Replit file explorer
=======================================================

In the left panel you'll see your project files.
You need to upload or create these files:

--- FILE 1: app/client/wallet.tsx ---
1. In the left panel, click the "app" folder
2. Click the "client" folder
3. Click the + icon (New File)
4. Name it: wallet.tsx
5. Open the downloaded file "client-wallet.tsx"
6. Select All (Ctrl+A) → Copy (Ctrl+C)
7. Paste into Replit (Ctrl+V)
8. Save (Ctrl+S)

--- FILE 2: app/chauffeur/wallet.tsx ---
1. Click the "app" folder → "chauffeur" folder
2. Click + icon → New File → name it: wallet.tsx
3. Paste contents of "chauffeur-wallet.tsx"
4. Save

--- FILE 3: shared/schema.ts ---
1. Open shared/schema.ts in Replit
2. Scroll to the very BOTTOM of the file
3. PASTE the contents of "schema-wallet.ts" at the bottom
   (do not replace the file, just add to the end)
4. Save

--- FILE 4: server/storage.ts ---
1. Open server/storage.ts in Replit
2. Scroll to the very BOTTOM of the file
3. PASTE the contents of "storage-wallet.ts" at the bottom
   (do not replace, just add to the end)
4. Save

--- FILE 5: server/routes.ts ---
1. Open server/routes.ts in Replit
2. Scroll to the very BOTTOM of the file
3. PASTE the contents of "paystack-routes.ts" at the bottom
   (do not replace, just add to the end)
4. Save

=======================================================
## STEP 3 — Add Paystack env variables in Railway
=======================================================

Railway is where your backend runs (not Render).

1. Go to railway.app → your project
2. Click your backend service
3. Click "Variables" tab
4. Click "New Variable" and add each one:

   Variable name: PAYSTACK_SECRET_KEY
   Value: sk_test_xxxxxxxx   (from your Paystack dashboard)

   Variable name: PAYSTACK_PUBLIC_KEY
   Value: pk_test_xxxxxxxx   (from your Paystack dashboard)

5. Click Deploy (Railway auto-redeploys when you add variables)

=======================================================
## STEP 4 — Get your Paystack test keys
=======================================================

If you haven't signed up yet:
1. Go to paystack.com → Sign up with South African details
2. You are automatically in TEST MODE (no approval needed)
3. Go to Settings → API Keys & Webhooks
4. Copy:
   - Secret key (starts with sk_test_...)
   - Public key (starts with pk_test_...)
5. Add these to Railway as per Step 3

=======================================================
## STEP 5 — Set up Paystack Webhook in Railway URL
=======================================================

1. First find your Railway backend URL:
   - Go to railway.app → your service → Settings
   - Look for "Domain" or "Public URL"
   - It looks like: https://a2b-lift-production.up.railway.app

2. Go to Paystack dashboard → Settings → Webhooks
3. Click "Add Endpoint"
4. Enter: https://YOUR-RAILWAY-URL/api/payments/webhook
5. Select events: charge.success, transfer.success, transfer.failed
6. Save

=======================================================
## STEP 6 — Commit and push from Replit to GitHub
=======================================================

After adding all the files:
1. Look for the Git icon on the left sidebar in Replit
   (looks like a branching Y shape)
2. You'll see all changed files listed
3. In the message box type:
   feat: add Paystack wallet for clients and chauffeurs
4. Click "Commit & Push"
5. Railway will auto-deploy your new backend code

=======================================================
## STEP 7 — Add wallet screens to navigation
=======================================================

You need to make the wallet screens accessible in the app.
Find your tab navigation file — likely:
   app/client/_layout.tsx  or  app/(tabs)/_layout.tsx

Add wallet as a tab or link to it from the profile screen.

Example — add this to your client tab navigator:
   <Tabs.Screen
     name="wallet"
     options={{
       title: "Wallet",
       tabBarIcon: ({ color }) => (
         <Ionicons name="wallet-outline" size={24} color={color} />
       ),
     }}
   />

=======================================================
## STEP 8 — Test with Paystack test cards
=======================================================

Use these card numbers to test payments (no real money):

   Card: 4084 0840 8408 4081  →  Successful payment
   Card: 5078 5078 5078 5078 12  →  Successful payment
   Expiry: any future date (e.g. 12/29)
   CVV: 408

=======================================================
## WHAT EACH FILE DOES (summary)
=======================================================

client-wallet.tsx
   → Screen riders see to add cards, top up wallet,
     choose payment method, view transaction history

chauffeur-wallet.tsx
   → Screen drivers see to view earnings, request
     bank withdrawal, view withdrawal history

paystack-routes.ts (added to routes.ts)
   → All backend API routes:
     POST /api/payments/initialize  - start card payment
     POST /api/payments/verify      - confirm payment success
     POST /api/payments/charge-card - charge saved card for ride
     POST /api/payments/pay-wallet  - pay ride from wallet balance
     GET  /api/payments/cards       - list saved cards
     DELETE /api/payments/cards/:id - remove a card
     GET  /api/wallet/transactions  - transaction history
     POST /api/wallet/withdraw      - chauffeur bank withdrawal
     GET  /api/wallet/banks         - list SA banks
     POST /api/payments/webhook     - Paystack payment confirmations

storage-wallet.ts (added to storage.ts)
   → Database methods for saved cards and wallet transactions

schema-wallet.ts (added to schema.ts)
   → Database table definitions for saved_cards
     and wallet_transactions

=======================================================
## HOW THE PAYMENT FLOW WORKS
=======================================================

RIDER PAYS FOR RIDE:
1. Rider books ride → selects Cash, Card, or Wallet
2. If Card → app calls /api/payments/initialize
3. Paystack page opens → rider enters card details
4. On success → card saved, payment recorded
5. Next ride → card charged automatically (no re-entry)

CHAUFFEUR WITHDRAWS:
1. Chauffeur opens wallet → sees available earnings
2. Taps "Withdraw to Bank"
3. Enters bank (Capitec, FNB, Absa etc.) + account number
4. App calls /api/wallet/withdraw
5. Paystack transfers money directly to their bank
6. Funds arrive within 24 hours

=======================================================
## TROUBLESHOOTING
=======================================================

"axios is not found" error
→ Run: npm install axios  in Replit shell

"PAYSTACK_SECRET_KEY not set" error
→ Add the variable in Railway → Variables tab

Webhook not working
→ Check your Railway URL is correct in Paystack dashboard
→ Make sure the URL includes /api/payments/webhook

Card not saving
→ Paystack only saves reusable cards (most SA cards work)
→ Check Paystack dashboard → Transactions for details

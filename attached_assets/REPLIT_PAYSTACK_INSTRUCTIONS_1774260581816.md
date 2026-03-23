=======================================================
A2B LIFT — PAYSTACK WALLET UPDATE
Complete Replit Instructions
=======================================================

FILES YOU NEED (already downloaded from Claude):
  - wallet.tsx
  - paystack-routes-fixed.ts
  - requestRide-update.ts  (read-only reference file)
  - storage-wallet.ts
  - schema-wallet.ts

=======================================================
STEP 0 — FIX THE 500 ERROR FIRST (Railway)
=======================================================

This must be done before anything else.

1. Go to railway.app
2. Click your backend service
3. Click the "Variables" tab
4. Click "New Variable" and add:

   Name:  PAYSTACK_SECRET_KEY
   Value: sk_test_xxxxxxxxxxxx  (from your Paystack dashboard)

   Name:  PAYSTACK_CURRENCY
   Value: ZAR

5. Railway will auto-redeploy — wait about 1 minute
6. The 500 error will be gone after this

To get your Paystack keys:
  - Go to paystack.com → Settings → API Keys & Webhooks
  - Copy the "Secret Key" (starts with sk_test_...)


=======================================================
STEP 1 — Open your project in Replit
=======================================================

Make sure your A2B-LIFT repo is open in Replit
and you can see the file tree on the left side.


=======================================================
STEP 2 — Replace the wallet screen
=======================================================

1. In the left file panel click:
   app → client → wallet.tsx

2. Click wallet.tsx to open it

3. Press Ctrl + A  (selects all text)

4. Press Delete  (clears the file)

5. Open the downloaded file "wallet.tsx" on your computer
   (the one from Claude, not the original)

6. Press Ctrl + A to select all → Ctrl + C to copy

7. Click back in Replit and press Ctrl + V to paste

8. Press Ctrl + S to save

   ✅ Done — wallet screen updated


=======================================================
STEP 3 — Add payment routes to the backend
=======================================================

1. In the left panel click:
   server → routes.ts

2. Press Ctrl + End to jump to the very BOTTOM of the file

3. Look for these lines near the bottom:

      return httpServer;
   }

4. Click your cursor on the blank line JUST BEFORE
   "return httpServer;"

5. Open the downloaded file "paystack-routes-fixed.ts"
   on your computer

6. Press Ctrl + A → Ctrl + C to copy it all

7. Click back in Replit and press Ctrl + V to paste

8. Press Ctrl + S to save

   ✅ Done — payment routes added


=======================================================
STEP 4 — Add storage methods
=======================================================

1. In the left panel click:
   server → storage.ts

2. Press Ctrl + End to jump to the very bottom

3. Find the last closing line:
   export const storage = new DatabaseStorage();

4. Click AFTER that line (at the very end of the file)

5. Open "storage-wallet.ts" on your computer
   → Ctrl + A → Ctrl + C

6. Paste into Replit → Ctrl + S to save

   ✅ Done — storage methods added


=======================================================
STEP 5 — Add schema definitions
=======================================================

1. In the left panel click:
   shared → schema.ts

2. Press Ctrl + End to go to the bottom

3. Open "schema-wallet.ts" on your computer
   → Ctrl + A → Ctrl + C

4. Paste at the bottom of schema.ts → Ctrl + S

   ✅ Done — schema updated


=======================================================
STEP 6 — Update the ride request flow (index.tsx)
=======================================================

This has 4 small parts. Take it one at a time.

Open:  app → client → index.tsx

-------------------------------------------------------
PART A — Add 2 new state variables
-------------------------------------------------------

1. Use Ctrl + F to search for:
   const [onlineDrivers, setOnlineDrivers]

2. Click at the END of that line, press Enter to make
   a new line below it

3. Paste these two lines:

const [showPaymentPicker, setShowPaymentPicker] = useState(false);
const [paymentMethod, setPaymentMethod] = useState<"cash" | "card" | "wallet">("cash");

4. Press Ctrl + S to save

-------------------------------------------------------
PART B — Replace the requestRide function
-------------------------------------------------------

1. Use Ctrl + F to search for:
   async function requestRide()

2. Select from "async function requestRide()" all the
   way down to the closing } of that function.

   The function ends just after this line:
     Alert.alert("Error", "Failed to request ride");

3. Delete the selected text

4. Paste this in its place:

async function requestRide() {
  if (!user || !location || !dropoffCoords) return;
  setShowPaymentPicker(true);
}

async function handlePayAndRide(method: "cash" | "card" | "wallet") {
  if (!user || !location || !dropoffCoords) return;
  setShowPaymentPicker(false);
  try {
    const distanceKm = estimatedDistance || 10;
    const res = await apiRequest("POST", "/api/rides", {
      clientId: user.id,
      pickupLat: location.lat,
      pickupLng: location.lng,
      pickupAddress,
      dropoffLat: dropoffCoords.lat,
      dropoffLng: dropoffCoords.lng,
      dropoffAddress,
      vehicleType: selectedVehicle.id,
      distanceKm,
      paymentMethod: method,
      paymentStatus: method === "cash" ? "unpaid" : "pending",
      isLateNight: new Date().getHours() >= 22 || new Date().getHours() < 5,
    });
    const payload = await res.json();
    const ride = payload.ride ?? payload;

    if (method === "cash") {
      setCurrentRide(ride);
      setRideStatus("requested");
      if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      return;
    }

    if (method === "wallet") {
      const payRes = await apiRequest("POST", "/api/payments/pay-wallet", { rideId: ride.id });
      const payData = await payRes.json();
      if (!payData.success) {
        await apiRequest("PUT", `/api/rides/${ride.id}/status`, { status: "cancelled" }).catch(() => {});
        Alert.alert("Payment Failed", payData.message || "Insufficient wallet balance.");
        return;
      }
      setCurrentRide(ride);
      setRideStatus("requested");
      if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      return;
    }

    if (method === "card") {
      try {
        const chargeRes = await apiRequest("POST", "/api/payments/charge-ride", { rideId: ride.id });
        const chargeData = await chargeRes.json();
        if (!chargeData.success) {
          await apiRequest("PUT", `/api/rides/${ride.id}/status`, { status: "cancelled" }).catch(() => {});
          Alert.alert(
            "Payment Failed",
            chargeData.message || "Card could not be charged.",
            [
              { text: "Pay Cash", onPress: () => handlePayAndRide("cash") },
              { text: "Cancel", style: "cancel" },
            ]
          );
          return;
        }
        setCurrentRide(ride);
        setRideStatus("requested");
        if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      } catch {
        await apiRequest("PUT", `/api/rides/${ride.id}/status`, { status: "cancelled" }).catch(() => {});
        Alert.alert(
          "Payment Error",
          "Could not process card.",
          [
            { text: "Pay Cash", onPress: () => handlePayAndRide("cash") },
            { text: "Cancel", style: "cancel" },
          ]
        );
      }
    }
  } catch {
    Alert.alert("Error", "Failed to request ride. Please try again.");
  }
}

5. Press Ctrl + S to save

-------------------------------------------------------
PART C — Add payment picker modal
-------------------------------------------------------

1. Still in index.tsx, use Ctrl + F to search for:
   {/* Location Picker Modal */}

2. Click just BEFORE that line (on the blank line above it)

3. Paste this entire block:

{/* Payment Method Picker */}
<Modal visible={showPaymentPicker} transparent animationType="slide" onRequestClose={() => setShowPaymentPicker(false)}>
  <Pressable style={styles.modalOverlay} onPress={() => setShowPaymentPicker(false)}>
    <View style={[styles.modalSheet, { paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 16) }]}>
      <View style={styles.sheetHandle} />
      <Text style={styles.sheetTitle}>How would you like to pay?</Text>
      <Text style={{ fontSize: 13, color: Colors.textMuted, fontFamily: "Inter_400Regular", marginBottom: 8 }}>
        Fare: R {estimatedPrice}
      </Text>
      <Pressable style={styles.payMethodRow} onPress={() => handlePayAndRide("card")}>
        <View style={[styles.payMethodIcon, { backgroundColor: "#1434CB" }]}>
          <Ionicons name="card" size={20} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.payMethodName}>Pay by Card</Text>
          <Text style={styles.payMethodSub}>Charged immediately</Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
      </Pressable>
      {(user?.walletBalance || 0) >= (estimatedPrice || 0) && (estimatedPrice || 0) > 0 && (
        <Pressable style={styles.payMethodRow} onPress={() => handlePayAndRide("wallet")}>
          <View style={[styles.payMethodIcon, { backgroundColor: Colors.success }]}>
            <Ionicons name="wallet" size={20} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.payMethodName}>Wallet Balance</Text>
            <Text style={styles.payMethodSub}>R {(user?.walletBalance || 0).toFixed(2)} available</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
        </Pressable>
      )}
      <Pressable style={styles.payMethodRow} onPress={() => handlePayAndRide("cash")}>
        <View style={[styles.payMethodIcon, { backgroundColor: Colors.accent }]}>
          <Ionicons name="cash" size={20} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.payMethodName}>Cash</Text>
          <Text style={styles.payMethodSub}>Pay driver directly after ride</Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
      </Pressable>
    </View>
  </Pressable>
</Modal>

4. Press Ctrl + S to save

-------------------------------------------------------
PART D — Add new styles
-------------------------------------------------------

1. Still in index.tsx, press Ctrl + End to go to the
   very bottom of the file

2. Find the last style entry — it will look something
   like this near the end:

   submitRatingButtonText: {
     ...
   },
   });   ← this is the closing of StyleSheet.create

3. Click just BEFORE the final });

4. Paste these styles:

  payMethodRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 8,
  },
  payMethodIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  payMethodName: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: Colors.white,
  },
  payMethodSub: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
    marginTop: 2,
  },

5. Press Ctrl + S to save

   ✅ Done — ride request flow updated


=======================================================
STEP 7 — Install axios (if not already installed)
=======================================================

1. In Replit, look for the Shell tab at the bottom
   (or click the three dots ... → Shell)

2. Type this and press Enter:
   npm install axios

3. Wait for it to finish


=======================================================
STEP 8 — Commit and push to GitHub
=======================================================

1. Click the Git icon in Replit's left sidebar
   (looks like a branching Y shape)

2. You will see all the changed files listed

3. In the message box type:
   feat: Paystack card payment, wallet top-up, charge before driver sees ride

4. Click "Commit & Push"

5. Railway will auto-redeploy your backend ✅


=======================================================
STEP 9 — Set up Paystack Webhook (one time only)
=======================================================

1. Find your Railway backend URL:
   - Go to railway.app → your service → Settings
   - Look for "Domain" or "Public URL"
   - Looks like: https://yourapp.up.railway.app

2. Go to paystack.com → Settings → Webhooks

3. Click "Add Endpoint"

4. Enter:
   https://YOUR-RAILWAY-URL/api/paystack/webhook

5. Select these events:
   - charge.success
   - transfer.success
   - transfer.failed

6. Save ✅


=======================================================
STEP 10 — Test everything
=======================================================

TEST CARD NUMBERS (no real money charged):

  Card number:  4084 0840 8408 4081   →  Success
  Card number:  5078 5078 5078 5078 12  →  Success
  Expiry date:  12/29  (any future date works)
  CVV:          408

TESTING FLOW:
  1. Open app → book a ride → enter destination → get estimate
  2. Tap "Request Ride"
  3. Payment picker appears → choose "Pay by Card"
  4. If no card saved → message shown to add card first
     → go to Wallet tab → Add Funds → enter test card
     → card gets saved securely
  5. Next ride → card charged silently in the background
  6. Driver only sees the ride AFTER payment is confirmed ✅
  7. Cash option — no charge, ride goes straight to drivers ✅


=======================================================
TROUBLESHOOTING
=======================================================

500 error "Payment initialization failed"
  → PAYSTACK_SECRET_KEY not set in Railway
  → Go to Railway → Variables → add the key
  → Wait 1 minute for redeploy

"No saved card found"
  → User needs to add a card first via Wallet tab
  → Add Funds → complete payment → card saved for future rides

"axios is not defined" error
  → Run: npm install axios  in Replit shell

Routes not found (404)
  → Check paystack-routes-fixed.ts was pasted correctly
     inside the registerRoutes function in routes.ts
  → It must be BEFORE the "return httpServer;" line

TypeScript errors on getSavedCardsByUser
  → Check storage-wallet.ts was added to storage.ts
  → And schema-wallet.ts was added to schema.ts

Card charges not going through
  → Check you are using sk_test_... key (not sk_live_...)
  → Verify in Paystack dashboard → Transactions
  → Make sure PAYSTACK_CURRENCY = ZAR is set in Railway

=======================================================
SUMMARY OF WHAT CHANGED
=======================================================

wallet.tsx (REPLACED)
  → No "Paystack" branding visible to users
  → Clean "Pay R100" button
  → Shows saved cards, wallet balance, transaction history
  → "Secure card payment" note instead of Paystack logo

server/routes.ts (ADDED TO)
  → POST /api/payments/initialize  - start payment
  → POST /api/payments/verify      - confirm payment + save card
  → POST /api/payments/charge-ride - charge saved card for ride
  → POST /api/payments/pay-wallet  - pay from wallet balance
  → GET  /api/payments/cards       - list user's saved cards
  → DELETE /api/payments/cards/:id - remove a card
  → GET  /api/wallet/transactions  - transaction history

app/client/index.tsx (UPDATED)
  → Tapping "Request Ride" now shows payment picker first
  → User picks: Card / Wallet / Cash
  → Card: charged silently, driver sees ride only after success
  → Cash: no charge, ride broadcast immediately
  → If card fails: option to switch to cash

HOW PAYMENT FLOW WORKS:
  Rider taps Request Ride
        ↓
  Picks payment method
        ↓
  Ride created in database (status: pending)
        ↓
  If card → charge saved card via Paystack API (silent)
  If wallet → deduct balance immediately
  If cash → skip payment
        ↓
  Payment confirmed → ride status updated to "paid"
        ↓
  Driver sees the ride and can accept it ✅

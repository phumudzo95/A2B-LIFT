# Objective
Make all buttons functional, remove all placeholders, and make the app production-ready for deployment. Update vehicle categories and pricing to match spec.

# Tasks

### T001: Update Pricing Engine & Vehicle Categories
- **Blocked By**: []
- **Details**:
  - Update vehicle categories to: Budget, Luxury, Business Class, Van, Luxury Van
  - Update pricing to use per-category base_fare + distance × price_per_km
  - Update `server/luxuryPricingEngine.ts` with new category-based pricing
  - Update `app/client/index.tsx` VEHICLE_TYPES array
  - Update `app/chauffeur-register.tsx` VEHICLE_TYPES array
  - Files: server/luxuryPricingEngine.ts, app/client/index.tsx, app/chauffeur-register.tsx
  - Acceptance: Categories match spec with correct pricing

### T002: Fix Distance Calculation
- **Blocked By**: []
- **Details**:
  - Replace Math.random() distance/duration with coordinate-based estimation
  - Use Haversine formula for distance estimation between pickup and approximate dropoff
  - Use geocoding from expo-location to get dropoff coordinates from address
  - Files: app/client/index.tsx
  - Acceptance: Distance calculated from coordinates, not random

### T003: Fix Chauffeur Settings Buttons
- **Blocked By**: []
- **Details**:
  - Make Vehicle Details, Documents, Notifications, Help buttons functional
  - Vehicle Details: Show modal with chauffeur's current vehicle info
  - Documents: Show informational modal about document requirements
  - Notifications: Navigate to a notifications view
  - Help: Show help/support info
  - Files: app/chauffeur/settings.tsx
  - Acceptance: All 4 buttons have functional onPress handlers

### T004: Fix Wallet Placeholder
- **Blocked By**: []
- **Details**:
  - Remove "coming in next update" card payment placeholder
  - Make card setup show a proper form or confirmation
  - Files: app/client/wallet.tsx
  - Acceptance: No placeholder text, card button functional

### T005: Update Backend Routes for New Pricing
- **Blocked By**: [T001]
- **Details**:
  - Update ride creation to use category-based pricing
  - Update pricing endpoint
  - Files: server/routes.ts
  - Acceptance: Rides created with correct category pricing

### T006: Schema Update
- **Blocked By**: []
- **Details**:
  - Add pricePerKm, baseFare to rides table
  - Add carMake to chauffeurs table
  - Push schema changes
  - Files: shared/schema.ts
  - Acceptance: Schema updated and pushed

### T007: Final Polish & Homescreen
- **Blocked By**: [T001-T006]
- **Details**:
  - Ensure app navigates to homescreen
  - Test all flows work
  - Update admin panel if needed
  - Acceptance: App loads to splash, all buttons work

# A2B LIFT - Premium Ride Experience

## Overview
A luxury ride-hailing platform built with Expo (React Native) frontend and Express.js backend. Features client (rider) mode, driver mode, and a web-based admin panel.

## Tech Stack
- **Frontend**: Expo Router (file-based routing), TypeScript, React Native
- **Backend**: Express.js + Socket.io (WebSocket), TypeScript
- **Database**: PostgreSQL (Replit built-in) with Drizzle ORM
- **Styling**: React Native StyleSheet, Inter font family
- **Real-time**: Socket.io for GPS updates and ride events

## Project Structure
```
app/                    # Expo Router screens
  index.tsx             # Splash/landing screen
  login.tsx             # Login screen
  register.tsx          # Registration screen
  role-select.tsx       # Role selection (Client/Driver)
  chauffeur-register.tsx # Driver vehicle registration
  client/               # Client (rider) tab screens
    _layout.tsx         # Tab layout with liquid glass
    index.tsx           # Ride booking with vehicle categories
    trips.tsx           # Trip history
    wallet.tsx          # Wallet & payment methods
    profile.tsx         # Profile & settings
    notifications.tsx   # Notifications inbox
    safety.tsx          # AI safety reports
    help.tsx            # FAQ & support
    settings.tsx        # Profile editing
    chat.tsx            # In-ride chat
  chauffeur/            # Driver tab screens
    _layout.tsx         # Tab layout with liquid glass
    index.tsx           # Dashboard with online toggle
    rides.tsx           # Ride history
    earnings.tsx        # Earnings & withdrawals
    settings.tsx        # Settings with vehicle/docs/notifications/help modals
server/
  index.ts              # Express server entry
  routes.ts             # API routes + Socket.io
  storage.ts            # Database operations (Drizzle)
  luxuryPricingEngine.ts # Category-based pricing logic
  templates/
    landing-page.html   # Landing page
    admin.html          # Admin panel
shared/
  schema.ts             # Database schema (Drizzle)
```

## Vehicle Categories & Pricing
| Category | Base Fare | Price/km | Examples |
|----------|-----------|----------|----------|
| Budget | R50 | R7/km | Toyota Corolla, Toyota Quest |
| Luxury | R100 | R13/km | BMW 3 Series, Mercedes C Class |
| Business Class | R150 | R40/km | BMW 5 Series, Mercedes E Class |
| Van | R120 | R13/km | Hyundai H1, Mercedes Vito, Staria |
| Luxury Van | R200 | R50/km | Mercedes V Class |

Fare formula: `base_fare + (distance × price_per_km)`
Late night premium (22:00-05:00): 30% surcharge
Commission rate: 20%

## Maps
- Platform-specific map components: `A2BMap.web.tsx` (Google Maps JS API) and `A2BMap.native.tsx` (react-native-maps pinned to 1.18.0)
- Dark luxury map styling on both platforms
- Google Directions API for route polylines (`/api/directions` endpoint)
- Socket event `location:update` broadcasts driver GPS to clients
- Chauffeur dashboard shows live map when online with route to pickup/dropoff

## Key Features
- Authentication with bcrypt password hashing
- Role-based UI (Client vs Driver)
- 5 vehicle categories with transparent pricing
- Real-time ride status via Socket.io
- Driver GPS location tracking with live map on both client and driver screens
- Haversine distance calculation with Nominatim geocoding (server-side fallback for web)
- Late-night premium (30% surcharge 22:00-05:00) shown in fare breakdown
- Earnings tracking with 20% commission
- Withdrawal system
- Payment methods with card form (persisted via AsyncStorage), EFT, and cash
- In-app chat and phone calling
- AI-powered safety reports
- Notification system
- Chauffeur settings modals (Vehicle Details, Documents, Notifications, Help)
- Admin panel at /admin

## API Endpoints
- `GET /api/geocode?address=...` - Server-side geocoding via Nominatim OpenStreetMap
- `POST /api/pricing/estimate` - Price estimate with category-based pricing
- `POST /api/auth/register` / `POST /api/auth/login` - Authentication
- `GET /admin` - Admin panel (web)

## Database Schema
- **users**: id, username, password, name, phone, role, rating, walletBalance
- **chauffeurs**: id, userId, carMake, vehicleModel, plateNumber, vehicleType, carColor, phone, passengerCapacity, luggageCapacity, isOnline, isApproved, earningsTotal, lat, lng
- **rides**: id, clientId, chauffeurId, pickup/dropoff coords+address, status, price, pricePerKm, baseFare, distanceKm, vehicleType, paymentMethod
- **earnings**: id, chauffeurId, rideId, amount, commission
- **withdrawals**: id, chauffeurId, amount, status
- **messages**: id, rideId, senderId, messageText
- **safetyReports**: id, userId, rideId, type, description, status, aiResponse, priority
- **notifications**: id, userId, title, body, type, isRead

## Theme
- Premium black & white design
- Colors: #000000 (primary), #121212 (cards), #FFFFFF (text), #BDBDBD (secondary text)
- Font: Inter (Google Fonts)

## Admin Panel
- Accessible at /admin route on the backend
- Overview stats, driver management, ride monitoring, withdrawal approvals, safety reports

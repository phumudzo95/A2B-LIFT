# A2B LIFT - Premium Ride Experience

## Overview
A luxury ride-hailing platform built with Expo (React Native) frontend and Express.js backend. Features client (rider) mode, chauffeur (driver) mode, and a web-based admin panel.

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
  role-select.tsx       # Role selection (Client/Chauffeur)
  chauffeur-register.tsx # Chauffeur vehicle registration
  client/               # Client (rider) tab screens
    _layout.tsx         # Tab layout with liquid glass
    index.tsx           # Map & ride booking
    trips.tsx           # Trip history
    wallet.tsx          # Wallet & payment methods
    profile.tsx         # Profile & settings
  chauffeur/            # Chauffeur (driver) tab screens
    _layout.tsx         # Tab layout with liquid glass
    index.tsx           # Dashboard with online toggle
    rides.tsx           # Ride history
    earnings.tsx        # Earnings & withdrawals
    settings.tsx        # Settings
server/
  index.ts              # Express server entry
  routes.ts             # API routes + Socket.io
  storage.ts            # Database operations (Drizzle)
  luxuryPricingEngine.ts # Pricing logic
  templates/
    landing-page.html   # Landing page
    admin.html          # Admin panel
shared/
  schema.ts             # Database schema (Drizzle)
```

## Key Features
- Authentication with bcrypt password hashing
- Role-based UI (Client vs Chauffeur)
- Luxury pricing engine (ZAR currency)
- Real-time ride status via Socket.io
- Chauffeur GPS location tracking
- Earnings tracking with 20% commission
- Withdrawal system
- Admin panel at /admin

## Theme
- Premium black & white luxury design
- Colors: #000000 (primary), #121212 (cards), #FFFFFF (text), #BDBDBD (secondary text)
- Font: Inter (Google Fonts)

## Admin Panel
- Accessible at /admin route on the backend
- Overview stats, chauffeur management, ride monitoring, withdrawal approvals

# Production API Configuration

## ✅ Changes Made

### 1. Updated `.env` file
- Changed `EXPO_PUBLIC_DOMAIN` from `192.168.0.113:5000` to `a2b-lift.onrender.com`
- The app will now use: `https://a2b-lift.onrender.com`

### 2. Updated `lib/query-client.ts`
- Updated comments to reflect production URL
- The `getApiUrl()` function automatically uses `https://` for production domains
- No code changes needed - it already handles production URLs correctly

### 3. Updated `server/index.ts` (CORS)
- Added `https://a2b-lift.onrender.com` to allowed origins
- Server will now accept requests from the production domain

## 📱 How It Works

The app uses the `EXPO_PUBLIC_DOMAIN` environment variable to determine the API URL:

- **Production**: `EXPO_PUBLIC_DOMAIN=a2b-lift.onrender.com` → `https://a2b-lift.onrender.com`
- **Development**: `EXPO_PUBLIC_DOMAIN=localhost:5000` → `http://localhost:5000`
- **Local Network**: `EXPO_PUBLIC_DOMAIN=192.168.0.113:5000` → `http://192.168.0.113:5000`

The `getApiUrl()` function in `lib/query-client.ts` automatically:
- Uses `https://` for production domains (like `onrender.com`)
- Uses `http://` for localhost and local IP addresses

## 🚀 Deployment Checklist

### For Mobile App (Expo):
1. ✅ `.env` file updated with production domain
2. ✅ `lib/query-client.ts` handles production URLs
3. **Next**: Rebuild your Expo app to pick up the new environment variable

### For Backend (Render):
1. ✅ CORS updated to allow `https://a2b-lift.onrender.com`
2. ✅ Server is already deployed and running

## 🔄 Switching Between Environments

To switch back to local development:
1. Update `.env`: `EXPO_PUBLIC_DOMAIN=localhost:5000` (or your local IP)
2. Restart Expo: `npm start`

To use production:
1. Update `.env`: `EXPO_PUBLIC_DOMAIN=a2b-lift.onrender.com`
2. Restart Expo: `npm start`

## ✅ Verification

Test the production API:
- Health check: `https://a2b-lift.onrender.com/api/external/health`
- Registration: `POST https://a2b-lift.onrender.com/api/auth/register`

Your mobile app will now connect to the production backend! 🎉

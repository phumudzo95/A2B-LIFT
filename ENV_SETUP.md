# Environment Variables Setup

## Required Environment Variables

Create a `.env` file in the project root with the following variables:

### Database
```bash
DATABASE_URL=postgres://user:password@host:5432/database_name
```

### Authentication
```bash
JWT_SECRET=your-secret-key-here-minimum-32-characters-long
```

### Google Maps And Google OAuth
```bash
GOOGLE_API_KEY=your-google-maps-server-key
EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=your-google-maps-native-key
GOOGLE_CLIENT_ID=your-google-oauth-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-oauth-client-secret
```

### Supabase (if using Supabase services)
```bash
SUPABASE_URL=https://zzwkieiktbhptvgsqerd.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp6d2tpZWlrdGJocHR2Z3NxZXJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA4ODA1NjEsImV4cCIaFi2rTJfbyZ6rj6Etecc
```

### External API (103.154.2.122)
```bash
EXTERNAL_API_URL=http://103.154.2.122
EXTERNAL_API_KEY=your-api-key-if-required
EXTERNAL_API_TIMEOUT=30000
```

### Paystack (Optional - for card payments)
```bash
PAYSTACK_SECRET_KEY=sk_test_xxxxx
PAYSTACK_PUBLIC_KEY=pk_test_xxxxx
PAYSTACK_CURRENCY=ZAR
PAYSTACK_CALLBACK_URL=https://yourdomain.com/paystack/return
```

### Server Configuration
```bash
PORT=5000
NODE_ENV=development
```

### Expo/Mobile App
```bash
EXPO_PUBLIC_DOMAIN=localhost:5000
```

## Setup Instructions

1. Copy this template to a `.env` file in the project root
2. Fill in all required values (especially `DATABASE_URL` and `JWT_SECRET`)
3. The server will automatically load these variables on startup via `dotenv`

## Notes

- **DATABASE_URL**: Your PostgreSQL connection string. If using Supabase, you can get this from your Supabase project settings.
- **JWT_SECRET**: Generate a secure random string (minimum 32 characters). You can use: `openssl rand -base64 32`
- **GOOGLE_API_KEY**: Used by the backend for directions, geocoding, and reverse geocoding.
- **EXPO_PUBLIC_GOOGLE_MAPS_API_KEY**: Used by the Expo app config and native map SDKs at build time.
- **GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET**: Used by the backend Google OAuth endpoints.
- **SUPABASE_URL/ANON_KEY**: Already provided above
- **EXTERNAL_API_URL**: Set to `http://103.154.2.122` by default
- Never commit `.env` file to version control (it should be in `.gitignore`)

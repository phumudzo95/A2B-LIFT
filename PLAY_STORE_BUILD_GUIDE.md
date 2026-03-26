# A2B LIFT — Play Store Build Guide (Technical Steps)

## What's Already Done
- ✅ App package name: `com.a2blift`
- ✅ All Android permissions declared (location, camera, storage, internet, vibrate)
- ✅ App icons ready (1024×1024 main icon, adaptive icons for Android)
- ✅ Splash screen configured (black background)
- ✅ Production API URL set (Railway backend)
- ✅ EAS build config set to produce AAB (Android App Bundle) for Play Store
- ✅ Version: 1.0.0 / Build: 1 (auto-increments on each build)
- ✅ Google Maps API key embedded

---

## Steps to Build the AAB

### Step 1 — Install EAS CLI on your machine
```bash
npm install -g eas-cli
```

### Step 2 — Create a free Expo account
Go to https://expo.dev and sign up (free).

### Step 3 — Log in to EAS
```bash
eas login
```
Enter your Expo account email and password.

### Step 4 — Link this project to your EAS account
Run this inside the project folder:
```bash
eas init
```
This creates the project on expo.dev and automatically updates `app.json` with the correct project ID. **Commit the change it makes to `app.json` afterwards.**

### Step 5 — Set the Paystack public key as an EAS secret
This keeps the live key out of source code:
```bash
eas secret:create --scope project --name EXPO_PUBLIC_PAYSTACK_PUBLIC_KEY --value "pk_live_XXXXXXXX"
```
Replace `pk_live_XXXXXXXX` with your actual Paystack live public key.

### Step 6 — Build the AAB for Play Store
```bash
eas build --platform android --profile production
```
This runs in the cloud (no local Android SDK needed). Takes ~10–20 minutes.
When complete, you'll get a download link for the `.aab` file.

### Step 7 — Download the AAB
Download it from the link provided, or from https://expo.dev under your project's Builds tab.

---

## Hand Off to Distribution
Give the `.aab` file to your distribution partner. They upload it to the Google Play Console under:
**Releases → Internal Testing → Create new release → Upload**

---

## Future Updates
Every time you want to release an update:
1. Change `version` in `app.json` (e.g. `"1.0.1"`)
2. Run `eas build --platform android --profile production` again
3. Hand the new AAB to your distribution partner

The `versionCode` (internal build number Google tracks) increments automatically.

---

## Notes
- You do **not** need Android Studio or a local Android SDK — EAS builds in the cloud
- The signing keystore is managed automatically by EAS (they keep it secure)
- For iOS (App Store), a paid Apple Developer account ($99/year) is required — separate process

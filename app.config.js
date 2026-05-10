const googleMapsApiKey =
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
  process.env.GOOGLE_MAPS_API_KEY ||
  process.env.GOOGLE_API_KEY ||
  "";

const defaultPamolProjectId = "f282a582-7512-48d6-b563-13aa571d9115";
const defaultPascalProjectId = "eb3b8747-40b2-4aad-b118-e64339bfeea0";
const easOwner = process.env.EXPO_PUBLIC_EAS_OWNER || "pascal225";
const easProjectId =
  process.env.EXPO_PUBLIC_EAS_PROJECT_ID ||
  (easOwner === "pascal225" ? defaultPascalProjectId : defaultPamolProjectId);

module.exports = {
  expo: {
    name: "A2B LIFT",
    slug: "a2b-lift",
    owner: easOwner,
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/images/icon.png",
    scheme: "a2blift",
    userInterfaceStyle: "dark",
    newArchEnabled: false,
    splash: {
      image: "./assets/images/splash-icon.png",
      resizeMode: "contain",
      backgroundColor: "#000000",
    },
    ios: {
      supportsTablet: false,
      bundleIdentifier: "com.a2blift",
      buildNumber: "1",
      infoPlist: {
        NSLocationWhenInUseUsageDescription: "A2B LIFT needs your location to show nearby drivers and navigate to your destination.",
        NSLocationAlwaysAndWhenInUseUsageDescription: "A2B LIFT uses your location to connect you with nearby drivers and to track your trip.",
        NSCameraUsageDescription: "A2B LIFT needs camera access to let you upload your profile photo and vehicle documents.",
        NSPhotoLibraryUsageDescription: "A2B LIFT needs access to your photo library to let you upload your profile photo and vehicle documents.",
        NSPhotoLibraryAddUsageDescription: "A2B LIFT saves trip-related photos to your library.",
        ITSAppUsesNonExemptEncryption: false,
        UIBackgroundModes: ["location", "fetch"],
      },
      config: {
        googleMapsApiKey,
      },
      privacyManifests: {
        NSPrivacyAccessedAPITypes: [
          {
            NSPrivacyAccessedAPIType: "NSPrivacyAccessedAPICategoryUserDefaults",
            NSPrivacyAccessedAPITypeReasons: ["CA92.1"],
          },
        ],
      },
    },
    android: {
      package: "com.a2blift",
      versionCode: 50,
      softwareKeyboardLayoutMode: "resize",
      adaptiveIcon: {
        foregroundImage: "./assets/images/android-icon-foreground-car.png",
        backgroundColor: "#000000",
      },
      permissions: [
        "android.permission.ACCESS_FINE_LOCATION",
        "android.permission.ACCESS_COARSE_LOCATION",
        "android.permission.CAMERA",
        "android.permission.READ_EXTERNAL_STORAGE",
        "android.permission.WRITE_EXTERNAL_STORAGE",
        "android.permission.INTERNET",
        "android.permission.VIBRATE",
        "android.permission.RECORD_AUDIO",
      ],
      config: {
        googleMaps: {
          apiKey: googleMapsApiKey,
        },
      },
    },
    web: {
      favicon: "./assets/images/favicon.png",
    },
    plugins: [
      "expo-router",
      "expo-font",
      "expo-web-browser",
      [
        "expo-build-properties",
        {
          android: {
            compileSdkVersion: 35,
            targetSdkVersion: 35,
            minSdkVersion: 24,
            ndkVersion: "27.1.12297006",
          },
        },
      ],
      [
        "expo-notifications",
        {
          icon: "./assets/images/icon.png",
          color: "#0a0a0a",
          sounds: [],
          mode: "production",
        },
      ],
      [
        "expo-location",
        {
          locationAlwaysAndWhenInUsePermission: "A2B LIFT uses your location to connect you with nearby drivers and navigate your trip.",
          locationWhenInUsePermission: "A2B LIFT needs your location to show nearby drivers and navigate to your destination.",
          isIosBackgroundLocationEnabled: false,
          isAndroidBackgroundLocationEnabled: false,
        },
      ],
      [
        "expo-image-picker",
        {
          photosPermission: "A2B LIFT needs access to your photos to let you upload your profile photo and documents.",
          cameraPermission: "A2B LIFT needs camera access to let you take photos for your profile and documents.",
        },
      ],
    ],
    experiments: {
      typedRoutes: true,
      reactCompiler: false,
    },
    extra: {
      ...(easProjectId
        ? {
            eas: {
              projectId: easProjectId,
            },
          }
        : {}),
      googleMapsApiKey,
    },
    runtimeVersion: "1.0.44",
    ...(easProjectId
      ? {
          updates: {
            url: `https://u.expo.dev/${easProjectId}`,
          },
        }
      : {}),
  },
};
import Constants from "expo-constants";

const GOOGLE_MAPS_WEB_API_KEY =
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY ||
  Constants.expoConfig?.extra?.googleMapsApiKey ||
  "";

let googleMapsWebPlacesPromise: Promise<any | null> | null = null;

export function getGoogleMapsWebApiKey() {
  return GOOGLE_MAPS_WEB_API_KEY;
}

export async function ensureGoogleMapsWebPlaces() {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return null;
  }

  const existingGoogle = (window as any).google;
  if (existingGoogle?.maps?.places) {
    return existingGoogle;
  }

  if (!GOOGLE_MAPS_WEB_API_KEY) {
    return null;
  }

  if (googleMapsWebPlacesPromise) {
    return googleMapsWebPlacesPromise;
  }

  googleMapsWebPlacesPromise = new Promise((resolve, reject) => {
    const resolveIfReady = () => {
      const readyGoogle = (window as any).google;
      if (readyGoogle?.maps?.places) {
        resolve(readyGoogle);
        return true;
      }
      return false;
    };

    if (resolveIfReady()) return;

    const handleLoad = () => {
      if (resolveIfReady()) return;
      googleMapsWebPlacesPromise = null;
      reject(new Error("Google Maps Places library unavailable"));
    };

    const handleError = () => {
      googleMapsWebPlacesPromise = null;
      reject(new Error("Failed to load Google Maps JavaScript API"));
    };

    const existingScript = document.querySelector('script[data-a2b-google-maps="true"]') as HTMLScriptElement | null;
    if (existingScript) {
      existingScript.addEventListener("load", handleLoad, { once: true });
      existingScript.addEventListener("error", handleError, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.setAttribute("data-a2b-google-maps", "true");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_WEB_API_KEY}&libraries=places`;
    script.async = true;
    script.defer = true;
    script.onload = handleLoad;
    script.onerror = handleError;
    document.head.appendChild(script);
  });

  return googleMapsWebPlacesPromise;
}
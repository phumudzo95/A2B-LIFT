import { Platform } from "react-native";
import { getApiUrl } from "./query-client";

const SUPABASE_URL =
  process.env.EXPO_PUBLIC_SUPABASE_URL || "https://zzwkieiktbhptvgsqerd.supabase.co";
const SUPABASE_ANON_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp6d2tpZWlrdGJocHR2Z3NxZXJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA4ODA1NjEsImV4cCI6MjA4NjQ1NjU2MX0.BgTFknM60JsTl1iHAN1ri3pxFi2rTJfbyZ6rj6Etecc";
const BUCKET = "driver-documents";
const UPLOAD_TIMEOUT_MS = 60_000;

/**
 * Upload a document image to Supabase Storage.
 *
 * Strategy:
 *   1. Fetch the local file/blob URI to get raw bytes (works on both mobile & web).
 *   2. Upload directly to Supabase Storage via its REST API using the public anon key.
 *      This works regardless of which backend is deployed (Railway / Replit).
 *   3. If the direct upload fails for any reason, fall back to the server proxy
 *      at /api/upload-document (useful when running locally or if Supabase policies change).
 *
 * Returns the public URL of the uploaded file.
 */
export async function uploadDocument(
  localUri: string,
  userId: string,
  docType: string
): Promise<string> {
  const fileName = `${userId}/${docType}_${Date.now()}.jpg`;

  // ── 1. Read the file bytes ──────────────────────────────────────────────
  const blob = await readUriAsBlob(localUri);

  // ── 2. Direct Supabase Storage upload ───────────────────────────────────
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);
    try {
      const uploadRes = await fetch(
        `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${fileName}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
            apikey: SUPABASE_ANON_KEY,
            "Content-Type": "image/jpeg",
            "x-upsert": "true",
          },
          body: blob,
          signal: controller.signal,
        }
      );
      if (uploadRes.ok) {
        return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${fileName}`;
      }
      const errText = await uploadRes.text();
      console.warn("[supabase-storage] Direct upload failed:", errText);
    } finally {
      clearTimeout(timer);
    }
  } catch (e: any) {
    console.warn("[supabase-storage] Direct upload error:", e?.message);
  }

  // ── 3. Fallback: server proxy ────────────────────────────────────────────
  console.log("[supabase-storage] Falling back to server proxy...");
  const base64Data = await blobToBase64(blob);
  const apiUrl = getApiUrl().replace(/\/$/, "");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);
  try {
    const res = await fetch(`${apiUrl}/api/upload-document`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ base64Data, userId, docType }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Server proxy upload failed: ${err}`);
    }
    const data = await res.json();
    return data.url as string;
  } finally {
    clearTimeout(timer);
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function readUriAsBlob(uri: string): Promise<Blob> {
  if (uri.startsWith("data:")) {
    // data: URI — decode inline
    const [header, base64] = uri.split(",", 2);
    const mimeMatch = header.match(/data:([^;]+)/);
    const mime = mimeMatch ? mimeMatch[1] : "image/jpeg";
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }
  // file: or blob: URI — fetch it
  const response = await fetch(uri);
  if (!response.ok) throw new Error(`Cannot read file: ${uri}`);
  return response.blob();
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

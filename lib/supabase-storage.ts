import * as ImageManipulator from "expo-image-manipulator";
import { Platform } from "react-native";

const SUPABASE_URL = "https://zzwkieiktbhptvgsqerd.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp6d2tpZWlrdGJocHR2Z3NxZXJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA4ODA1NjEsImV4cCI6MjA4NjQ1NjU2MX0.BgTFknM60JsTl1iHAN1ri3pxFi2rTJfbyZ6rj6Etecc";
const BUCKET = "driver-documents";
const UPLOAD_TIMEOUT_MS = 30_000;

async function compressImage(uri: string): Promise<string> {
  if (Platform.OS === "web") return uri;
  try {
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 1200 } }],
      { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG }
    );
    return result.uri;
  } catch {
    return uri;
  }
}

export async function uploadDocument(
  localUri: string,
  userId: string,
  docType: string
): Promise<string> {
  const compressedUri = await compressImage(localUri);

  const fileName = `${userId}/${docType}_${Date.now()}.jpg`;

  const response = await fetch(compressedUri);
  const blob = await response.blob();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);

  try {
    const uploadRes = await fetch(
      `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${fileName}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          "Content-Type": "image/jpeg",
          "x-upsert": "true",
        },
        body: blob,
        signal: controller.signal,
      }
    );

    if (!uploadRes.ok) {
      const err = await uploadRes.text();
      throw new Error(`Upload failed: ${err}`);
    }

    return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${fileName}`;
  } finally {
    clearTimeout(timer);
  }
}

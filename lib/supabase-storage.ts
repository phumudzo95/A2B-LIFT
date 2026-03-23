import { Platform } from "react-native";
import { getApiUrl } from "./query-client";

const UPLOAD_TIMEOUT_MS = 60_000;

export async function uploadDocument(
  localUri: string,
  userId: string,
  docType: string
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);

  try {
    let base64Data: string;

    if (localUri.startsWith("data:")) {
      const comma = localUri.indexOf(",");
      base64Data = comma >= 0 ? localUri.slice(comma + 1) : localUri;
    } else {
      const response = await fetch(localUri);
      if (!response.ok) throw new Error(`Cannot read file: ${localUri}`);
      const blob = await response.blob();
      base64Data = await blobToBase64(blob);
    }

    const apiUrl = getApiUrl().replace(/\/$/, "");
    const res = await fetch(`${apiUrl}/api/upload-document`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ base64Data, userId, docType }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Upload failed: ${err}`);
    }

    const data = await res.json();
    return data.url as string;
  } finally {
    clearTimeout(timer);
  }
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

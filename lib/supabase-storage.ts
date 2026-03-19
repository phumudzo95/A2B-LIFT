/**
 * Supabase Storage upload utility for driver documents.
 * Uploads a local file URI to the driver-documents bucket and returns the public URL.
 * Works on iOS, Android, and web.
 */

const SUPABASE_URL = "https://zzwkieiktbhptvgsqerd.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp6d2tpZWlrdGJocHR2Z3NxZXJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA4ODA1NjEsImV4cCI6MjA4NjQ1NjU2MX0.BgTFknM60JsTl1iHAN1ri3pxFi2rTJfbyZ6rj6Etecc";
const BUCKET = "driver-documents";

/**
 * Upload a document to Supabase Storage.
 * @param localUri  - file:// or blob URI from ImagePicker
 * @param userId    - used to namespace the file path
 * @param docType   - e.g. "id_document", "drivers_license"
 * @returns public URL of the uploaded file
 */
export async function uploadDocument(
  localUri: string,
  userId: string,
  docType: string
): Promise<string> {
  // Determine file extension from URI
  const ext = localUri.split(".").pop()?.split("?")[0]?.toLowerCase() || "jpg";
  const mimeType = ext === "pdf" ? "application/pdf" : `image/${ext === "jpg" ? "jpeg" : ext}`;
  const fileName = `${userId}/${docType}_${Date.now()}.${ext}`;

  // Fetch the file as a blob
  const response = await fetch(localUri);
  const blob = await response.blob();

  // Upload to Supabase Storage via REST API
  const uploadRes = await fetch(
    `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${fileName}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        "Content-Type": mimeType,
        "x-upsert": "true", // overwrite if re-uploading same doc type
      },
      body: blob,
    }
  );

  if (!uploadRes.ok) {
    const err = await uploadRes.text();
    throw new Error(`Upload failed: ${err}`);
  }

  // Return the public URL
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${fileName}`;
}

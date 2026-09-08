import { supabase } from "@/integrations/supabase/client";
import { removePdfObjects, uploadPdfObject } from "@/lib/pdf-storage.functions";

const MEDIA_BUCKET = "restaurant-media";
const SIGNED_TTL = 60 * 60 * 24 * 365;
const PDF_CHUNK_BYTES = 2 * 1024 * 1024;
export const MAX_PDF_BYTES = 100 * 1024 * 1024;
export type MediaKind = "logo" | "cover" | "category" | "product";
type UploadKind = MediaKind | "menu-pdf";

export type UploadedPdf = {
  url: string;
  parts: string[];
};

function extensionOf(file: File): string {
  const fromName = file.name.split(".").pop();
  if (fromName && fromName.length <= 5) return fromName.toLowerCase();
  return file.type.includes("png") ? "png" : file.type.includes("pdf") ? "pdf" : "jpg";
}

async function signedUrlFor(bucket: string, path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, SIGNED_TTL);
  if (error || !data) throw error ?? new Error("Could not prepare the media URL");
  return data.signedUrl;
}

async function uploadRestaurantMedia(restaurantId: string, kind: UploadKind, file: File, maxBytes: number): Promise<string> {
  if (file.size > maxBytes) {
    const maxMb = Math.round(maxBytes / (1024 * 1024));
    throw new Error(`File is too large. Maximum allowed size is ${maxMb} MB.`);
  }

  const path = `${restaurantId}/${kind}/${crypto.randomUUID()}.${extensionOf(file)}`;
  const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(path, file, {
    cacheControl: "31536000",
    upsert: false,
    ...(file.type ? { contentType: file.type } : {}),
  });
  if (error) {
    const message = error.message ?? "";
    if (/maximum size|file size|too large|entitytoolarge|413/i.test(message)) {
      throw new Error("Upload was rejected by storage because the configured file-size limit is too low.");
    }
    throw error;
  }

  return signedUrlFor(MEDIA_BUCKET, path);
}

export async function uploadRestaurantImage(restaurantId: string, kind: MediaKind, file: File): Promise<string> {
  return uploadRestaurantMedia(restaurantId, kind, file, 5 * 1024 * 1024);
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("Could not read PDF upload chunk"));
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const comma = result.indexOf(",");
      if (comma === -1) {
        reject(new Error("Could not encode PDF upload chunk"));
        return;
      }
      resolve(result.slice(comma + 1));
    };
    reader.readAsDataURL(blob);
  });
}

async function uploadPdfChunk(
  restaurantId: string,
  path: string,
  chunk: Blob,
  contentType: "application/pdf" | "application/octet-stream",
): Promise<string> {
  const base64 = await blobToBase64(chunk);
  const result = await uploadPdfObject({ data: { restaurantId, path, base64, contentType } });
  return result.url;
}

/**
 * Upload PDFs through a trusted server function instead of relying on a
 * pre-created client-side Storage bucket/policy. The server creates the fixed
 * menu-pdfs bucket if it is missing and uploads with the server Supabase key.
 * Files are split into 2 MiB objects to stay comfortably below request/object
 * limits while preserving the original PDF bytes exactly.
 */
export async function uploadRestaurantPdf(
  restaurantId: string,
  file: File,
  onProgress?: (uploadedBytes: number) => void,
): Promise<UploadedPdf> {
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    throw new Error("Please upload a PDF menu");
  }
  if (file.size > MAX_PDF_BYTES) {
    throw new Error("File is too large. Maximum allowed size is 100 MB.");
  }
  if (!file.size) throw new Error("The PDF file is empty");

  if (file.size <= PDF_CHUNK_BYTES) {
    const path = `${restaurantId}/menu-pdf/${crypto.randomUUID()}.pdf`;
    const url = await uploadPdfChunk(restaurantId, path, file, "application/pdf");
    onProgress?.(file.size);
    return { url, parts: [] };
  }

  const uploadId = crypto.randomUUID();
  const paths: string[] = [];
  const parts: string[] = [];
  let uploadedBytes = 0;

  try {
    for (let index = 0, offset = 0; offset < file.size; index += 1) {
      const end = Math.min(offset + PDF_CHUNK_BYTES, file.size);
      const chunk = file.slice(offset, end);
      const path = `${restaurantId}/menu-pdf-parts/${uploadId}/${String(index).padStart(4, "0")}.part`;
      const url = await uploadPdfChunk(restaurantId, path, chunk, "application/octet-stream");
      paths.push(path);
      parts.push(url);
      uploadedBytes += chunk.size;
      onProgress?.(uploadedBytes);
      offset = end;
    }
  } catch (error) {
    if (paths.length) {
      try {
        await removePdfObjects({ data: { restaurantId, paths } });
      } catch {
        // Cleanup failure must not hide the original upload failure.
      }
    }
    throw error;
  }

  return { url: parts[0], parts };
}

function decodeStoragePath(url: string, bucket: string): string {
  const marker = `/${bucket}/`;
  const index = url.indexOf(marker);
  if (index === -1) return "";
  return decodeURIComponent(url.slice(index + marker.length).split("?")[0]);
}

export async function removeRestaurantImage(url: string | null | undefined): Promise<void> {
  if (!url) return;
  const path = decodeStoragePath(url, MEDIA_BUCKET);
  if (!path) return;
  await supabase.storage.from(MEDIA_BUCKET).remove([path]);
}

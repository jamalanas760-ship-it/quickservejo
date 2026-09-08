import { supabase } from "@/integrations/supabase/client";

const MEDIA_BUCKET = "restaurant-media";
const PDF_BUCKET = "menu-pdfs";
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

function publicPdfUrl(path: string): string {
  return supabase.storage.from(PDF_BUCKET).getPublicUrl(path).data.publicUrl;
}

async function uploadPdfObject(path: string, blob: Blob, contentType: "application/pdf" | "application/octet-stream"): Promise<string> {
  const { error } = await supabase.storage.from(PDF_BUCKET).upload(path, blob, {
    cacheControl: "31536000",
    upsert: false,
    contentType,
  });

  if (error) {
    const message = error.message ?? "";
    if (/bucket not found|nosuchbucket|404/i.test(message)) {
      throw new Error("PDF storage is not available. The menu-pdfs bucket is missing from the connected Supabase project.");
    }
    if (/row-level security|rls|unauthorized|403/i.test(message)) {
      throw new Error("Your session is not allowed to upload this PDF. Please sign in again and retry.");
    }
    if (/maximum size|file size|too large|entitytoolarge|413/i.test(message)) {
      throw new Error("PDF upload was rejected because the storage file-size limit is too low.");
    }
    throw error;
  }

  return publicPdfUrl(path);
}

/**
 * Uploads PDF menus directly to the provisioned menu-pdfs bucket using the
 * signed-in user's Supabase session. No server secret/service-role key is
 * required. Larger files are split into 2 MiB objects while preserving the
 * original PDF bytes exactly.
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
    const url = await uploadPdfObject(path, file, "application/pdf");
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
      const url = await uploadPdfObject(path, chunk, "application/octet-stream");
      paths.push(path);
      parts.push(url);
      uploadedBytes += chunk.size;
      onProgress?.(uploadedBytes);
      offset = end;
    }
  } catch (error) {
    if (paths.length) {
      try {
        await supabase.storage.from(PDF_BUCKET).remove(paths);
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

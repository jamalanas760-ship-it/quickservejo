import { supabase } from "@/integrations/supabase/client";

const BUCKET = "restaurant-media";
const SIGNED_TTL = 60 * 60 * 24 * 365;
const PDF_CHUNK_BYTES = 4 * 1024 * 1024;
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

async function signedUrlFor(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, SIGNED_TTL);
  if (error || !data) throw error ?? new Error("Could not prepare the media URL");
  return data.signedUrl;
}

async function uploadRestaurantMedia(restaurantId: string, kind: UploadKind, file: File, maxBytes: number): Promise<string> {
  if (file.size > maxBytes) {
    const maxMb = Math.round(maxBytes / (1024 * 1024));
    throw new Error(`File is too large. Maximum allowed size is ${maxMb} MB.`);
  }

  const path = `${restaurantId}/${kind}/${crypto.randomUUID()}.${extensionOf(file)}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: "31536000",
    upsert: false,
    ...(file.type ? { contentType: file.type } : {}),
  });
  if (error) {
    const message = error.message ?? "";
    if (/maximum size|file size|too large|entitytoolarge|413/i.test(message)) {
      throw new Error("PDF upload was rejected by storage. The restaurant-media bucket limit is below the requested file size.");
    }
    throw error;
  }

  return signedUrlFor(path);
}

export async function uploadRestaurantImage(restaurantId: string, kind: MediaKind, file: File): Promise<string> {
  return uploadRestaurantMedia(restaurantId, kind, file, 5 * 1024 * 1024);
}

/**
 * Uploads a PDF directly when it fits in one Storage object. For larger PDFs,
 * stores independent 4 MiB parts so a legacy 5 MiB Storage object limit cannot
 * reject the menu. The original bytes are reassembled in the browser; the PDF
 * artwork is never recompressed or rewritten.
 */
export async function uploadRestaurantPdf(restaurantId: string, file: File, onProgress?: (uploadedBytes: number) => void): Promise<UploadedPdf> {
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    throw new Error("Please upload a PDF menu");
  }
  if (file.size > MAX_PDF_BYTES) {
    throw new Error("File is too large. Maximum allowed size is 100 MB.");
  }

  if (file.size <= PDF_CHUNK_BYTES) {
    const url = await uploadRestaurantMedia(restaurantId, "menu-pdf", file, PDF_CHUNK_BYTES);
    onProgress?.(file.size);
    return { url, parts: [] };
  }

  const uploadId = crypto.randomUUID();
  const parts: string[] = [];
  let uploadedBytes = 0;

  try {
    for (let index = 0, offset = 0; offset < file.size; index += 1) {
      const end = Math.min(offset + PDF_CHUNK_BYTES, file.size);
      const chunk = file.slice(offset, end);
      const path = `${restaurantId}/menu-pdf-parts/${uploadId}/${String(index).padStart(4, "0")}.part`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, chunk, {
        cacheControl: "31536000",
        upsert: false,
        contentType: "application/octet-stream",
      });
      if (error) {
        const message = error.message ?? "";
        if (/maximum size|file size|too large|entitytoolarge|413/i.test(message)) {
          throw new Error("PDF part upload was rejected by storage. QuickServe uses 4 MB parts so a 5 MB object limit is not required.");
        }
        throw error;
      }
      parts.push(await signedUrlFor(path));
      uploadedBytes += chunk.size;
      onProgress?.(uploadedBytes);
      offset = end;
    }
  } catch (error) {
    await supabase.storage.from(BUCKET).remove(parts.map((url) => decodeStoragePath(url)).filter(Boolean));
    throw error;
  }

  return { url: parts[0], parts };
}

function decodeStoragePath(url: string): string {
  const marker = `/${BUCKET}/`;
  const index = url.indexOf(marker);
  if (index === -1) return "";
  return decodeURIComponent(url.slice(index + marker.length).split("?")[0]);
}

export async function removeRestaurantImage(url: string | null | undefined): Promise<void> {
  if (!url) return;
  const path = decodeStoragePath(url);
  if (!path) return;
  await supabase.storage.from(BUCKET).remove([path]);
}

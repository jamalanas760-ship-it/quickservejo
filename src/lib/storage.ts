import { supabase } from "@/integrations/supabase/client";

const BUCKET = "restaurant-media";
const SIGNED_TTL = 60 * 60 * 24 * 365;
export const MAX_PDF_BYTES = 100 * 1024 * 1024;
export type MediaKind = "logo" | "cover" | "category" | "product";
type UploadKind = MediaKind | "menu-pdf";

function extensionOf(file: File): string {
  const fromName = file.name.split(".").pop();
  if (fromName && fromName.length <= 5) return fromName.toLowerCase();
  return file.type.includes("png") ? "png" : file.type.includes("pdf") ? "pdf" : "jpg";
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
    if (/maximum size|file size|too large/i.test(message)) {
      throw new Error("PDF upload was rejected by storage. The restaurant-media bucket must allow files up to 100 MB.");
    }
    throw error;
  }

  const { data, error: signError } = await supabase.storage.from(BUCKET).createSignedUrl(path, SIGNED_TTL);
  if (signError || !data) throw signError ?? new Error("Could not prepare the media URL");
  return data.signedUrl;
}

export async function uploadRestaurantImage(restaurantId: string, kind: MediaKind, file: File): Promise<string> {
  return uploadRestaurantMedia(restaurantId, kind, file, 5 * 1024 * 1024);
}

export async function uploadRestaurantPdf(restaurantId: string, file: File): Promise<string> {
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    throw new Error("Please upload a PDF menu");
  }
  return uploadRestaurantMedia(restaurantId, "menu-pdf", file, MAX_PDF_BYTES);
}

export async function removeRestaurantImage(url: string | null | undefined): Promise<void> {
  if (!url) return;
  const marker = `/${BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return;
  const path = url.slice(idx + marker.length).split("?")[0];
  if (!path) return;
  await supabase.storage.from(BUCKET).remove([decodeURIComponent(path)]);
}

import { supabase } from "@/integrations/supabase/client";

const BUCKET = "restaurant-media";
/** Long-lived signed URL (1 year) so diner-facing media renders without auth. */
const SIGNED_TTL = 60 * 60 * 24 * 365;

export type MediaKind = "logo" | "cover" | "category" | "product" | "menu-pdf";

function extensionOf(file: File): string {
  const fromName = file.name.split(".").pop();
  if (fromName && fromName.length <= 5) return fromName.toLowerCase();
  return file.type.includes("png") ? "png" : file.type.includes("pdf") ? "pdf" : "jpg";
}

async function uploadRestaurantMedia(
  restaurantId: string,
  kind: MediaKind,
  file: File,
  maxBytes: number,
): Promise<string> {
  if (file.size > maxBytes) throw new Error("payload too large");
  const path = `${restaurantId}/${kind}/${crypto.randomUUID()}.${extensionOf(file)}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: "31536000",
    upsert: false,
    ...(file.type ? { contentType: file.type } : {}),
  });
  if (error) throw error;

  const { data, error: signError } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_TTL);
  if (signError || !data) throw signError ?? new Error("Could not prepare the media URL");
  return data.signedUrl;
}

export async function uploadRestaurantImage(
  restaurantId: string,
  kind: Exclude<MediaKind, "menu-pdf">,
  file: File,
): Promise<string> {
  return uploadRestaurantMedia(restaurantId, kind, file, 5 * 1024 * 1024);
}

/** Uploads the original PDF without rewriting its artwork. */
export async function uploadRestaurantPdf(restaurantId: string, file: File): Promise<string> {
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    throw new Error("Please upload a PDF menu");
  }
  return uploadRestaurantMedia(restaurantId, "menu-pdf", file, 25 * 1024 * 1024);
}

/** Best-effort removal of a previously uploaded restaurant media URL. */
export async function removeRestaurantImage(url: string | null | undefined): Promise<void> {
  if (!url) return;
  const marker = `/${BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return;
  const path = url.slice(idx + marker.length).split("?")[0];
  if (!path) return;
  await supabase.storage.from(BUCKET).remove([decodeURIComponent(path)]);
}

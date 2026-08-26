import { supabase } from "@/integrations/supabase/client";

const BUCKET = "restaurant-media";
/** Long-lived signed URL (1 year) so diner-facing images render without auth. */
const SIGNED_TTL = 60 * 60 * 24 * 365;

export type MediaKind = "logo" | "cover" | "category" | "product";

function extensionOf(file: File): string {
  const fromName = file.name.split(".").pop();
  if (fromName && fromName.length <= 5) return fromName.toLowerCase();
  return file.type.includes("png") ? "png" : "jpg";
}

/**
 * Uploads an image for a restaurant and returns a URL safe to store in the
 * database and render in <img>. Storage paths are always prefixed with the
 * restaurant id, which is what the storage policies authorize against.
 */
export async function uploadRestaurantImage(
  restaurantId: string,
  kind: MediaKind,
  file: File,
): Promise<string> {
  if (file.size > 5 * 1024 * 1024) {
    throw new Error("payload too large");
  }
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
  if (signError || !data) throw signError ?? new Error("Could not prepare the image URL");
  return data.signedUrl;
}

/** Best-effort removal of a previously uploaded image, given its stored URL. */
export async function removeRestaurantImage(url: string | null | undefined): Promise<void> {
  if (!url) return;
  const marker = `/${BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return;
  const path = url.slice(idx + marker.length).split("?")[0];
  if (!path) return;
  await supabase.storage.from(BUCKET).remove([decodeURIComponent(path)]);
}

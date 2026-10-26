import { requireRestaurantAccess, MENU_EDITOR_ROLES } from "@/lib/server/restaurant-access.server";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const PDF_BUCKET = "menu-pdfs";
const MAX_CHUNK_BYTES = 2 * 1024 * 1024;

const uploadSchema = z.object({
  restaurantId: z.string().uuid(),
  path: z.string().min(1).max(500),
  base64: z.string().min(1),
  contentType: z.enum(["application/pdf", "application/octet-stream"]),
});

const removeSchema = z.object({
  restaurantId: z.string().uuid(),
  paths: z.array(z.string().min(1).max(500)).max(100),
});


function validatePath(restaurantId: string, path: string) {
  if (!path.startsWith(`${restaurantId}/`)) throw new Error("Invalid PDF storage path");
  if (path.includes("..") || path.includes("\\")) throw new Error("Invalid PDF storage path");
}

async function ensurePdfBucket() {
  const { data, error } = await supabaseAdmin.storage.getBucket(PDF_BUCKET);
  if (data && !error) return;

  const message = error?.message ?? "";
  const missing = !data && (!error || /not found|nosuchbucket|bucket.*not.*found|404/i.test(message));
  if (!missing) throw error ?? new Error("Could not inspect PDF storage bucket");

  const { error: createError } = await supabaseAdmin.storage.createBucket(PDF_BUCKET, {
    public: true,
    fileSizeLimit: 100 * 1024 * 1024,
    allowedMimeTypes: ["application/pdf", "application/octet-stream"],
  });

  // Concurrent uploads can race to create the same fixed bucket. Treat an
  // already-existing bucket as success and fail only for real creation errors.
  if (createError && !/already exists|duplicate/i.test(createError.message ?? "")) {
    throw createError;
  }
}

export const uploadPdfObject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => uploadSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireRestaurantAccess(context, data.restaurantId, [...MENU_EDITOR_ROLES, "super_admin"]);
    validatePath(data.restaurantId, data.path);

    const bytes = Buffer.from(data.base64, "base64");
    if (!bytes.length || bytes.length > MAX_CHUNK_BYTES) {
      throw new Error("Invalid PDF upload chunk size");
    }

    await ensurePdfBucket();

    const { error } = await supabaseAdmin.storage.from(PDF_BUCKET).upload(data.path, bytes, {
      cacheControl: "31536000",
      upsert: false,
      contentType: data.contentType,
    });
    if (error) throw error;

    const { data: publicUrl } = supabaseAdmin.storage.from(PDF_BUCKET).getPublicUrl(data.path);
    return { url: publicUrl.publicUrl };
  });

export const removePdfObjects = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => removeSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireRestaurantAccess(context, data.restaurantId, [...MENU_EDITOR_ROLES, "super_admin"]);
    for (const path of data.paths) validatePath(data.restaurantId, path);
    if (!data.paths.length) return { removed: true };

    await ensurePdfBucket();
    const { error } = await supabaseAdmin.storage.from(PDF_BUCKET).remove(data.paths);
    if (error) throw error;
    return { removed: true };
  });

-- PDF menus are allowed up to 100MB at the application layer.
-- Keep the bucket restriction aligned with that contract when the bucket exists.
-- The Supabase project's global Storage limit must also be >= 100MB.
UPDATE storage.buckets
SET file_size_limit = 104857600,
    allowed_mime_types = ARRAY['application/pdf']::text[]
WHERE id = 'restaurant-media';

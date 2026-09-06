-- Allow the restaurant-media bucket to hold PDF menus up to 100MB.
-- Preserve the bucket's existing MIME-type policy because the same bucket stores images.
-- The Supabase project's global Storage limit must also be >= 100MB.
UPDATE storage.buckets
SET file_size_limit = 104857600
WHERE id = 'restaurant-media';

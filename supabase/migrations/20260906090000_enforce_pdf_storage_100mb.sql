-- Keep the restaurant media bucket aligned with the PDF upload contract.
-- The same bucket stores images, so do not restrict MIME types here.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'restaurant-media') THEN
    UPDATE storage.buckets
    SET file_size_limit = 104857600
    WHERE id = 'restaurant-media';
  END IF;
END $$;

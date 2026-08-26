CREATE POLICY "restaurant_media_public_read"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'restaurant-media');

CREATE POLICY "restaurant_media_staff_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'restaurant-media'
  AND (
    app.is_super_admin()
    OR app.can_manage_restaurant(NULLIF(split_part(name, '/', 1), '')::uuid)
  )
);

CREATE POLICY "restaurant_media_staff_update"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'restaurant-media'
  AND (
    app.is_super_admin()
    OR app.can_manage_restaurant(NULLIF(split_part(name, '/', 1), '')::uuid)
  )
);

CREATE POLICY "restaurant_media_staff_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'restaurant-media'
  AND (
    app.is_super_admin()
    OR app.can_manage_restaurant(NULLIF(split_part(name, '/', 1), '')::uuid)
  )
);
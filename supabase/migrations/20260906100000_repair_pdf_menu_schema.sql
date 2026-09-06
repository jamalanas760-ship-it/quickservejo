-- Repair the PDF menu tables for environments where the original migration was not
-- applied cleanly or PostgREST did not refresh its schema cache.
-- This migration is intentionally idempotent so it is safe to run against both
-- fresh and already-provisioned QuickServe databases.

CREATE TABLE IF NOT EXISTS public.menu_pdf_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL UNIQUE REFERENCES public.restaurants(id) ON DELETE CASCADE,
  file_url text NOT NULL,
  file_name text NOT NULL,
  page_count integer NOT NULL DEFAULT 0,
  analysis jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.menu_pdf_documents
  ADD COLUMN IF NOT EXISTS file_parts jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS public.menu_pdf_item_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.menu_pdf_documents(id) ON DELETE CASCADE,
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  menu_item_id uuid NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
  page_number integer NOT NULL,
  x numeric(8,6) NOT NULL,
  y numeric(8,6) NOT NULL,
  width numeric(8,6) NOT NULL,
  height numeric(8,6) NOT NULL,
  label text,
  source text NOT NULL DEFAULT 'manual',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pdf_link_box_valid CHECK (
    x >= 0 AND y >= 0 AND width > 0 AND height > 0 AND x + width <= 1.001 AND y + height <= 1.001
  )
);

ALTER TABLE public.menu_pdf_item_links
  ADD COLUMN IF NOT EXISTS candidate_id text;

CREATE INDEX IF NOT EXISTS idx_pdf_documents_restaurant ON public.menu_pdf_documents(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_pdf_links_document ON public.menu_pdf_item_links(document_id, page_number);
CREATE INDEX IF NOT EXISTS idx_pdf_links_item ON public.menu_pdf_item_links(menu_item_id);
CREATE INDEX IF NOT EXISTS idx_pdf_links_candidate ON public.menu_pdf_item_links(document_id, candidate_id);

DO $$
BEGIN
  IF to_regprocedure('public.set_updated_at()') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgname = 'trg_pdf_documents_updated'
        AND tgrelid = 'public.menu_pdf_documents'::regclass
    ) THEN
      CREATE TRIGGER trg_pdf_documents_updated
        BEFORE UPDATE ON public.menu_pdf_documents
        FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgname = 'trg_pdf_links_updated'
        AND tgrelid = 'public.menu_pdf_item_links'::regclass
    ) THEN
      CREATE TRIGGER trg_pdf_links_updated
        BEFORE UPDATE ON public.menu_pdf_item_links
        FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
    END IF;
  END IF;
END $$;

GRANT SELECT ON public.menu_pdf_documents TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.menu_pdf_documents TO authenticated;
GRANT ALL ON public.menu_pdf_documents TO service_role;
GRANT SELECT ON public.menu_pdf_item_links TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.menu_pdf_item_links TO authenticated;
GRANT ALL ON public.menu_pdf_item_links TO service_role;

ALTER TABLE public.menu_pdf_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_pdf_item_links ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'menu_pdf_documents' AND policyname = 'public_read_active_pdf_document') THEN
    CREATE POLICY "public_read_active_pdf_document" ON public.menu_pdf_documents
      FOR SELECT TO anon USING (is_active AND public.is_restaurant_public(restaurant_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'menu_pdf_documents' AND policyname = 'staff_read_pdf_document') THEN
    CREATE POLICY "staff_read_pdf_document" ON public.menu_pdf_documents
      FOR SELECT TO authenticated USING (public.has_restaurant_access(restaurant_id) OR (is_active AND public.is_restaurant_public(restaurant_id)));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'menu_pdf_documents' AND policyname = 'admins_write_pdf_document') THEN
    CREATE POLICY "admins_write_pdf_document" ON public.menu_pdf_documents
      FOR ALL TO authenticated USING (public.can_manage_restaurant(restaurant_id)) WITH CHECK (public.can_manage_restaurant(restaurant_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'menu_pdf_item_links' AND policyname = 'public_read_active_pdf_links') THEN
    CREATE POLICY "public_read_active_pdf_links" ON public.menu_pdf_item_links
      FOR SELECT TO anon USING (is_active AND public.is_restaurant_public(restaurant_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'menu_pdf_item_links' AND policyname = 'staff_read_pdf_links') THEN
    CREATE POLICY "staff_read_pdf_links" ON public.menu_pdf_item_links
      FOR SELECT TO authenticated USING (public.has_restaurant_access(restaurant_id) OR (is_active AND public.is_restaurant_public(restaurant_id)));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'menu_pdf_item_links' AND policyname = 'admins_write_pdf_links') THEN
    CREATE POLICY "admins_write_pdf_links" ON public.menu_pdf_item_links
      FOR ALL TO authenticated USING (public.can_manage_restaurant(restaurant_id)) WITH CHECK (public.can_manage_restaurant(restaurant_id));
  END IF;
END $$;

-- The table/column must be visible to PostgREST immediately after the migration.
NOTIFY pgrst, 'reload schema';

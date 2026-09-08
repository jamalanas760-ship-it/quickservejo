-- Production-safe, idempotent PDF menu schema repair.
-- QuickServe authorization helpers live in the app schema, not public.

-- The shared guest loader selects menu_theme even for the PDF QR route.
-- Restore its original default when the connected project's base schema is older.
ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS menu_theme jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS public.menu_pdf_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL UNIQUE REFERENCES public.restaurants(id) ON DELETE CASCADE,
  file_url text NOT NULL,
  file_name text NOT NULL,
  page_count integer NOT NULL DEFAULT 0,
  analysis jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  file_parts jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

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
  candidate_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pdf_link_box_valid CHECK (x >= 0 AND y >= 0 AND width > 0 AND height > 0 AND x + width <= 1.001 AND y + height <= 1.001)
);

ALTER TABLE public.menu_pdf_documents ADD COLUMN IF NOT EXISTS file_parts jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.menu_pdf_item_links ADD COLUMN IF NOT EXISTS candidate_id text;

CREATE INDEX IF NOT EXISTS idx_pdf_documents_restaurant ON public.menu_pdf_documents(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_pdf_links_document ON public.menu_pdf_item_links(document_id, page_number);
CREATE INDEX IF NOT EXISTS idx_pdf_links_item ON public.menu_pdf_item_links(menu_item_id);
-- PdfMenuManagerV2 upserts with onConflict: "document_id,candidate_id".
-- A non-unique index cannot satisfy that conflict target.
CREATE UNIQUE INDEX IF NOT EXISTS idx_pdf_links_document_candidate_unique
  ON public.menu_pdf_item_links(document_id, candidate_id);

DO $$
BEGIN
  IF to_regprocedure('public.set_updated_at()') IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_pdf_documents_updated' AND tgrelid = 'public.menu_pdf_documents'::regclass) THEN
      CREATE TRIGGER trg_pdf_documents_updated BEFORE UPDATE ON public.menu_pdf_documents FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_pdf_links_updated' AND tgrelid = 'public.menu_pdf_item_links'::regclass) THEN
      CREATE TRIGGER trg_pdf_links_updated BEFORE UPDATE ON public.menu_pdf_item_links FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
    END IF;
  END IF;
END $$;

ALTER TABLE public.menu_pdf_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_pdf_item_links ENABLE ROW LEVEL SECURITY;

-- Replace inherited default grants, which may include TRUNCATE (bypasses RLS).
REVOKE ALL ON public.menu_pdf_documents, public.menu_pdf_item_links FROM PUBLIC, anon, authenticated;

GRANT SELECT ON public.menu_pdf_documents TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.menu_pdf_documents TO authenticated;
GRANT ALL ON public.menu_pdf_documents TO service_role;
GRANT SELECT ON public.menu_pdf_item_links TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.menu_pdf_item_links TO authenticated;
GRANT ALL ON public.menu_pdf_item_links TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='menu_pdf_documents' AND policyname='public_read_active_pdf_document') THEN
    CREATE POLICY public_read_active_pdf_document ON public.menu_pdf_documents FOR SELECT TO anon USING (is_active AND app.is_restaurant_public(restaurant_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='menu_pdf_documents' AND policyname='staff_read_pdf_document') THEN
    CREATE POLICY staff_read_pdf_document ON public.menu_pdf_documents FOR SELECT TO authenticated USING (app.has_restaurant_access(restaurant_id) OR (is_active AND app.is_restaurant_public(restaurant_id)));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='menu_pdf_documents' AND policyname='admins_write_pdf_document') THEN
    CREATE POLICY admins_write_pdf_document ON public.menu_pdf_documents FOR ALL TO authenticated USING (app.can_manage_restaurant(restaurant_id)) WITH CHECK (app.can_manage_restaurant(restaurant_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='menu_pdf_item_links' AND policyname='public_read_active_pdf_links') THEN
    CREATE POLICY public_read_active_pdf_links ON public.menu_pdf_item_links FOR SELECT TO anon USING (is_active AND app.is_restaurant_public(restaurant_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='menu_pdf_item_links' AND policyname='staff_read_pdf_links') THEN
    CREATE POLICY staff_read_pdf_links ON public.menu_pdf_item_links FOR SELECT TO authenticated USING (app.has_restaurant_access(restaurant_id) OR (is_active AND app.is_restaurant_public(restaurant_id)));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='menu_pdf_item_links' AND policyname='admins_write_pdf_links') THEN
    CREATE POLICY admins_write_pdf_links ON public.menu_pdf_item_links
      FOR ALL TO authenticated
      USING (app.can_manage_restaurant(restaurant_id))
      WITH CHECK (
        app.can_manage_restaurant(restaurant_id)
        AND EXISTS (
          SELECT 1 FROM public.menu_pdf_documents document
          WHERE document.id = menu_pdf_item_links.document_id
            AND document.restaurant_id = menu_pdf_item_links.restaurant_id
        )
        AND EXISTS (
          SELECT 1 FROM public.menu_items item
          WHERE item.id = menu_pdf_item_links.menu_item_id
            AND item.restaurant_id = menu_pdf_item_links.restaurant_id
        )
      );
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

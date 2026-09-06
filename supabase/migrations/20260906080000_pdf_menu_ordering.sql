-- PDF menu ordering: preserve the uploaded menu artwork and add invisible product hotspots.
CREATE TABLE public.menu_pdf_documents (
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

CREATE TABLE public.menu_pdf_item_links (
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

CREATE INDEX idx_pdf_documents_restaurant ON public.menu_pdf_documents(restaurant_id);
CREATE INDEX idx_pdf_links_document ON public.menu_pdf_item_links(document_id, page_number);
CREATE INDEX idx_pdf_links_item ON public.menu_pdf_item_links(menu_item_id);

CREATE TRIGGER trg_pdf_documents_updated BEFORE UPDATE ON public.menu_pdf_documents FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_pdf_links_updated BEFORE UPDATE ON public.menu_pdf_item_links FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

GRANT SELECT ON public.menu_pdf_documents TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.menu_pdf_documents TO authenticated;
GRANT ALL ON public.menu_pdf_documents TO service_role;
GRANT SELECT ON public.menu_pdf_item_links TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.menu_pdf_item_links TO authenticated;
GRANT ALL ON public.menu_pdf_item_links TO service_role;

ALTER TABLE public.menu_pdf_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_pdf_item_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_read_active_pdf_document" ON public.menu_pdf_documents
  FOR SELECT TO anon USING (is_active AND public.is_restaurant_public(restaurant_id));
CREATE POLICY "staff_read_pdf_document" ON public.menu_pdf_documents
  FOR SELECT TO authenticated USING (public.has_restaurant_access(restaurant_id) OR (is_active AND public.is_restaurant_public(restaurant_id)));
CREATE POLICY "admins_write_pdf_document" ON public.menu_pdf_documents
  FOR ALL TO authenticated USING (public.can_manage_restaurant(restaurant_id)) WITH CHECK (public.can_manage_restaurant(restaurant_id));

CREATE POLICY "public_read_active_pdf_links" ON public.menu_pdf_item_links
  FOR SELECT TO anon USING (is_active AND public.is_restaurant_public(restaurant_id));
CREATE POLICY "staff_read_pdf_links" ON public.menu_pdf_item_links
  FOR SELECT TO authenticated USING (public.has_restaurant_access(restaurant_id) OR (is_active AND public.is_restaurant_public(restaurant_id)));
CREATE POLICY "admins_write_pdf_links" ON public.menu_pdf_item_links
  FOR ALL TO authenticated USING (public.can_manage_restaurant(restaurant_id)) WITH CHECK (public.can_manage_restaurant(restaurant_id));

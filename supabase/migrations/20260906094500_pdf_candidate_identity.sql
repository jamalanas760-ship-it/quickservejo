ALTER TABLE public.menu_pdf_item_links
  ADD COLUMN IF NOT EXISTS candidate_id text;

CREATE INDEX IF NOT EXISTS menu_pdf_item_links_candidate_idx
  ON public.menu_pdf_item_links(document_id, candidate_id)
  WHERE is_active = true;

COMMENT ON COLUMN public.menu_pdf_item_links.candidate_id IS
  'Stable PDF analysis candidate id used to update the same menu product without creating duplicates.';

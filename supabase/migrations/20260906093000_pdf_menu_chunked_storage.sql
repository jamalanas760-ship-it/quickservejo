-- Large PDF menus can be stored as multiple Storage objects when a project or
-- bucket still has a legacy 5 MiB per-object limit. The browser reassembles the
-- original bytes, so the PDF artwork remains byte-for-byte unchanged.
ALTER TABLE public.menu_pdf_documents
  ADD COLUMN IF NOT EXISTS file_parts jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.menu_pdf_documents.file_parts IS
  'Signed Storage URLs for ordered PDF parts; empty for legacy single-object PDFs.';

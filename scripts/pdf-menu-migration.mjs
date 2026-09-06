// The PDF menu workflow is now implemented as a first-class feature backed by
// menu_pdf_documents + menu_pdf_item_links. Keep this repair hook idempotent so
// scheduled self-repair runs never re-introduce the legacy menu_pdf_url flow.
console.log("PDF menu migration hook: current database-backed workflow is already in source control");

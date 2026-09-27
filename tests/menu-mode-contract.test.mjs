import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function file(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("public menus strictly separate Standard products from PDF hotspot products", async () => {
  const diner = await file("src/lib/diner.ts");
  const migration = await file(
    "supabase/migrations/20260927094315_separate_standard_and_pdf_products.sql",
  );
  const standardCatalog = await file("src/components/manage/MenuCatalogMaster.tsx");
  const pdfCatalog = await file("src/components/manage/PdfMenuManagerV3.tsx");

  assert.match(migration, /add column if not exists menu_origin text/);
  assert.match(migration, /set menu_origin = 'pdf'/);
  assert.match(migration, /set menu_origin = 'standard'/);
  assert.match(migration, /check \(menu_origin in \('standard', 'pdf'\)\)/);
  assert.match(
    diner,
    /\.select\("id, document_id, page_number, x, y, width, height, menu_item_id, label, is_active"\)/,
  );
  assert.match(diner, /link\.document_id === pdfDocument\.id && link\.is_active !== false/);
  assert.match(diner, /appearance\.menuMode === "pdf"/);
  assert.match(diner, /items\.filter\(\(item\) => item\.menu_origin === "pdf"\)/);
  assert.match(diner, /items\.filter\(\(item\) => item\.menu_origin === "standard"\)/);
  assert.match(diner, /categories: \(categoriesRes\.data \?\? \[\]\)\.filter\(\(category\) =>/);
  assert.match(diner, /visibleCategoryIds\.has\(category\.id\)/);
  assert.match(standardCatalog, /menu_origin: "standard"/);
  assert.match(pdfCatalog, /menu_origin: "pdf"/);
});

test("public routes render only the selected menu experience", async () => {
  const standardRoute = await file("src/routes/r/$slug.tsx");
  const pdfRoute = await file("src/routes/m/$slug.tsx");
  assert.match(standardRoute, /menu\.data\.menuMode === "pdf"/);
  assert.match(standardRoute, /to="\/m\/\$slug"/);
  assert.match(pdfRoute, /menu\.data\.menuMode === "products"/);
  assert.doesNotMatch(pdfRoute, /!pdfMenu && menu\.data\.items\.length/);
});

test("Standard Menu exposes and persists a pre-preview light and dark selector", async () => {
  const designer = await file("src/components/manage/MasterMenuDesigner.tsx");
  const diner = await file("src/lib/diner.ts");
  assert.match(designer, /StandardMenuModeControl/);
  assert.match(designer, /const saveWorkflow = useMutation/);
  assert.match(designer, /return nextWorkflow/);
  assert.doesNotMatch(designer, /menuMode: nextWorkflow/);
  assert.match(designer, /guestMenuMode: nextMode/);
  assert.match(designer, /Preview Menu/);
  assert.match(diner, /appearance\.guestMenuMode === "dark"/);
  assert.match(diner, /menuTheme = \{ \.\.\.menuTheme, \.\.\.guestPalette \}/);
  assert.match(
    diner,
    /standardAppearance: \{ mode: appearance\.guestMenuMode, light: lightTheme, dark: darkTheme \}/,
  );
  assert.match(await file("src/routes/r/$slug.tsx"), /data-standard-menu-theme=\{appearanceMode\}/);
});

test("menu history supports individual and bulk cleanup while preserving live versions", async () => {
  const migration = await file(
    "supabase/migrations/20260927130000_repair_menu_history_qr_timeout_and_staff_shift_assignment.sql",
  );
  assert.match(migration, /delete_menu_design_version/);
  assert.match(migration, /delete_all_menu_design_versions/);
  assert.match(migration, /status <> 'published'/);
});

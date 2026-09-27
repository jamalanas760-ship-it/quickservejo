import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function file(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("public menus strictly separate Standard products from PDF hotspot products", async () => {
  const diner = await file("src/lib/diner.ts");
  assert.match(diner, /linkedItemIds = new Set/);
  assert.match(diner, /\.select\("id, document_id, page_number, x, y, width, height, menu_item_id, label, is_active"\)/);
  assert.match(diner, /link\.document_id === pdfDocument\.id && link\.is_active !== false/);
  assert.match(diner, /appearance\.menuMode === "pdf"/);
  assert.match(diner, /items\.filter\(\(item\) => linkedItemIds\.has\(item\.id\)\)/);
  assert.match(diner, /items\.filter\(\(item\) => !linkedItemIds\.has\(item\.id\)\)/);
  assert.match(diner, /categories: .*\.filter\(\(category\) => visibleCategoryIds\.has\(category\.id\)\)/);
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
  assert.match(designer, /menuMode: nextWorkflow === "standard" \? "products" : "pdf"/);
  assert.match(designer, /guestMenuMode: nextMode/);
  assert.match(designer, /Preview Menu/);
  assert.match(diner, /appearance\.guestMenuMode === "dark"/);
  assert.match(diner, /menuTheme = \{ \.\.\.menuTheme, \.\.\.guestPalette \}/);
  assert.match(diner, /standardAppearance: \{ mode: appearance\.guestMenuMode, light: lightTheme, dark: darkTheme \}/);
  assert.match(await file("src/routes/r/$slug.tsx"), /data-standard-menu-theme=\{appearanceMode\}/);
});

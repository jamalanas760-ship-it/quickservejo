import fs from "node:fs/promises";

const managerPath = "src/components/manage/PdfMenuManager.tsx";
let manager = await fs.readFile(managerPath, "utf8");
const managerReplacements = [
  ['if (nextFile.type !== "application/pdf" && !nextFile.name.toLowerCase().endsWith(".pdf")) toast.error("Please upload a PDF menu."); return;', 'if (nextFile.type !== "application/pdf" && !nextFile.name.toLowerCase().endsWith(".pdf")) { toast.error("Please upload a PDF menu."); return; }'],
  ['if (nextFile.size > MAX_PDF_BYTES) toast.error("PDF is too large. Maximum allowed size is 100 MB."); return;', 'if (nextFile.size > MAX_PDF_BYTES) { toast.error("PDF is too large. Maximum allowed size is 100 MB."); return; }'],
  ['if (!nameEn) toast.error("Product title is required."); return;', 'if (!nameEn) { toast.error("Product title is required."); return; }'],
  ['if (rect.width < 0.01 || rect.height < 0.01) toast.info("Drag around the full product area."); return; onManualSelect(rect);', 'if (rect.width < 0.01 || rect.height < 0.01) { toast.info("Drag around the full product area."); return; } onManualSelect(rect);'],
  ['const { data: item, error: itemError } = await supabase.from("menu_items").insert(productPayload).select("id").single();\n      if (itemError) throw itemError;\n      const { error: linkError } = await (supabase as any).from("menu_pdf_item_links").insert({ document_id: documentRow.id, restaurant_id: restaurantId, menu_item_id: item.id, candidate_id: activeCandidate.id, page_number: activeCandidate.page_number, x: activeCandidate.x, y: activeCandidate.y, width: activeCandidate.width, height: activeCandidate.height, label: nameEn, source: "manual-selection", is_active: true });', 'const { data: existingLink } = await (supabase as any).from("menu_pdf_item_links").select("id,menu_item_id").eq("document_id", documentRow.id).eq("candidate_id", activeCandidate.id).eq("restaurant_id", restaurantId).eq("is_active", true).maybeSingle();\n      let itemId: string;\n      if (existingLink?.menu_item_id) {\n        const { error: itemError } = await supabase.from("menu_items").update(productPayload).eq("id", existingLink.menu_item_id).eq("restaurant_id", restaurantId);\n        if (itemError) throw itemError;\n        itemId = existingLink.menu_item_id;\n      } else {\n        const { data: item, error: itemError } = await supabase.from("menu_items").insert(productPayload).select("id").single();\n        if (itemError) throw itemError;\n        itemId = item.id;\n      }\n      const { error: linkError } = existingLink ? await (supabase as any).from("menu_pdf_item_links").update({ menu_item_id: itemId, label: nameEn, is_active: true }).eq("id", existingLink.id) : await (supabase as any).from("menu_pdf_item_links").insert({ document_id: documentRow.id, restaurant_id: restaurantId, menu_item_id: itemId, candidate_id: activeCandidate.id, page_number: activeCandidate.page_number, x: activeCandidate.x, y: activeCandidate.y, width: activeCandidate.width, height: activeCandidate.height, label: nameEn, source: "manual-selection", is_active: true });'],
];
for (const [find, replace] of managerReplacements) manager = manager.replace(find, replace);
await fs.writeFile(managerPath, manager);

const customerPath = "src/routes/m/$slug.tsx";
let customer = await fs.readFile(customerPath, "utf8");
const customerReplacements = [
  ['<span>Subtotal</span>', '<span>{lang === "ar" ? "المجموع الفرعي" : "Subtotal"}</span>'],
  ['<span>Tax</span>', '<span>{lang === "ar" ? "الضريبة" : "Tax"}</span>'],
  ['<span>Service</span>', '<span>{lang === "ar" ? "الخدمة" : "Service"}</span>'],
  ['<span>Total</span>', '<span>{lang === "ar" ? "الإجمالي" : "Total"}</span>'],
];
for (const [find, replace] of customerReplacements) customer = customer.replaceAll(find, replace);
await fs.writeFile(customerPath, customer);
console.log("manual-menu-repair: control flow, editing, and Arabic charge labels hardened");

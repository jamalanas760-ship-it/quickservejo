import fs from "node:fs/promises";

const managerPath = "src/components/manage/PdfMenuManager.tsx";
let manager = await fs.readFile(managerPath, "utf8");
const managerReplacements = [
  ['if (nextFile.type !== "application/pdf" && !nextFile.name.toLowerCase().endsWith(".pdf")) toast.error("Please upload a PDF menu."); return;', 'if (nextFile.type !== "application/pdf" && !nextFile.name.toLowerCase().endsWith(".pdf")) { toast.error("Please upload a PDF menu."); return; }'],
  ['if (nextFile.size > MAX_PDF_BYTES) toast.error("PDF is too large. Maximum allowed size is 100 MB."); return;', 'if (nextFile.size > MAX_PDF_BYTES) { toast.error("PDF is too large. Maximum allowed size is 100 MB."); return; }'],
  ['if (!nameEn) toast.error("Product title is required."); return;', 'if (!nameEn) { toast.error("Product title is required."); return; }'],
  ['if (rect.width < 0.01 || rect.height < 0.01) toast.info("Drag around the full product area."); return; onManualSelect(rect);', 'if (rect.width < 0.01 || rect.height < 0.01) { toast.info("Drag around the full product area."); return; } onManualSelect(rect);'],
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
console.log("manual-menu-repair: control flow and Arabic charge labels hardened");

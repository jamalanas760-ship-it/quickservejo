import fs from "node:fs/promises";

const path = "src/components/manage/PdfMenuManager.tsx";
let text = await fs.readFile(path, "utf8");
const replacements = [
  [
    'if (nextFile.type !== "application/pdf" && !nextFile.name.toLowerCase().endsWith(".pdf")) toast.error("Please upload a PDF menu."); return;',
    'if (nextFile.type !== "application/pdf" && !nextFile.name.toLowerCase().endsWith(".pdf")) { toast.error("Please upload a PDF menu."); return; }',
  ],
  [
    'if (nextFile.size > MAX_PDF_BYTES) toast.error("PDF is too large. Maximum allowed size is 100 MB."); return;',
    'if (nextFile.size > MAX_PDF_BYTES) { toast.error("PDF is too large. Maximum allowed size is 100 MB."); return; }',
  ],
  [
    'if (!nameEn) toast.error("Product title is required."); return;',
    'if (!nameEn) { toast.error("Product title is required."); return; }',
  ],
  [
    'if (rect.width < 0.01 || rect.height < 0.01) toast.info("Drag around the full product area."); return; onManualSelect(rect);',
    'if (rect.width < 0.01 || rect.height < 0.01) { toast.info("Drag around the full product area."); return; } onManualSelect(rect);',
  ],
  [
    'return toast.error("Please upload a PDF menu.");',
    'toast.error("Please upload a PDF menu."); return;',
  ],
  [
    'return toast.error("PDF is too large. Maximum allowed size is 100 MB.");',
    'toast.error("PDF is too large. Maximum allowed size is 100 MB."); return;',
  ],
  [
    'return toast.error("Product title is required.");',
    'toast.error("Product title is required."); return;',
  ],
  [
    'return toast.info("Drag around the full product area.");',
    'toast.info("Drag around the full product area."); return;',
  ],
];
let changed = 0;
for (const [find, replace] of replacements) {
  if (text.includes(find)) {
    text = text.replace(find, replace);
    changed += 1;
  }
}
if (changed) await fs.writeFile(path, text);
console.log(`manual-menu-repair: ${changed} replacement(s)`);

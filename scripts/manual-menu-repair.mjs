import fs from "node:fs/promises";

const managerPath = "src/components/manage/PdfMenuManager.tsx";
let manager = await fs.readFile(managerPath, "utf8");
const managerReplacements = [
  ['if (nextFile.type !== "application/pdf" && !nextFile.name.toLowerCase().endsWith(".pdf")) toast.error("Please upload a PDF menu."); return;', 'if (nextFile.type !== "application/pdf" && !nextFile.name.toLowerCase().endsWith(".pdf")) { toast.error("Please upload a PDF menu."); return; }'],
  ['if (nextFile.size > MAX_PDF_BYTES) toast.error("PDF is too large. Maximum allowed size is 100 MB."); return;', 'if (nextFile.size > MAX_PDF_BYTES) { toast.error("PDF is too large. Maximum allowed size is 100 MB."); return; }'],
  ['if (!nameEn) toast.error("Product title is required."); return;', 'if (!nameEn) { toast.error("Product title is required."); return; }'],
  ['if (rect.width < 0.01 || rect.height < 0.01) toast.info("Drag around the full product area."); return; onManualSelect(rect);', 'if (rect.width < 0.01 || rect.height < 0.01) { toast.info("Drag around the full product area."); return; } onManualSelect(rect);'],
  ['const { data: item, error: itemError } = await supabase.from("menu_items").insert(productPayload).select("id").single();\n      if (itemError) throw itemError;\n      const { error: linkError } = await (supabase as any).from("menu_pdf_item_links").insert({ document_id: documentRow.id, restaurant_id: restaurantId, menu_item_id: item.id, candidate_id: activeCandidate.id, page_number: activeCandidate.page_number, x: activeCandidate.x, y: activeCandidate.y, width: activeCandidate.width, height: activeCandidate.height, label: nameEn, source: "manual-selection", is_active: true });', 'const { data: existingLink } = await (supabase as any).from("menu_pdf_item_links").select("id,menu_item_id").eq("document_id", documentRow.id).eq("candidate_id", activeCandidate.id).eq("restaurant_id", restaurantId).eq("is_active", true).maybeSingle();\n      let itemId: string;\n      if (existingLink?.menu_item_id) {\n        const { error: itemError } = await supabase.from("menu_items").update(productPayload).eq("id", existingLink.menu_item_id).eq("restaurant_id", restaurantId);\n        if (itemError) throw itemError;\n        itemId = existingLink.menu_item_id;\n      } else {\n        const { data: item, error: itemError } = await supabase.from("menu_items").insert(productPayload).select("id").single();\n        if (itemError) throw itemError;\n        itemId = item.id;\n      }\n      const { error: linkError } = existingLink ? await (supabase as any).from("menu_pdf_item_links").update({ menu_item_id: itemId, label: nameEn, is_active: true }).eq("id", existingLink.id) : await (supabase as any).from("menu_pdf_item_links").insert({ document_id: documentRow.id, restaurant_id: restaurantId, menu_item_id: itemId, candidate_id: activeCandidate.id, page_number: activeCandidate.page_number, x: activeCandidate.x, y: activeCandidate.y, width: activeCandidate.width, height: activeCandidate.height, label: nameEn, source: "manual-selection", is_active: true });'],
  ['page.setPointerCapture?.(event.pointerId); drag.current = { px: event.clientX, py: event.clientY, rect, mode };', 'event.currentTarget.setPointerCapture?.(event.pointerId); drag.current = { px: event.clientX, py: event.clientY, rect, mode };'],
  ['const EMPTY = { page_count: 0, pages: [], candidates: [] as PdfMenuCandidate[] };', 'const EMPTY: { page_count: number; pages: { page_number: number; width: number; height: number }[]; candidates: PdfMenuCandidate[] } = { page_count: 0, pages: [], candidates: [] };'],
];
for (const [find, replace] of managerReplacements) manager = manager.replace(find, replace);
await fs.writeFile(managerPath, manager);

// The production Menu route uses V2. Keep it manual-only, but make the editor behave like an Excel/Figma shape: select, drag to move, and resize from 8 handles.
const v2Path = "src/components/manage/PdfMenuManagerV2.tsx";
let v2 = await fs.readFile(v2Path, "utf8");
v2 = v2.replace('const [zoom, setZoom] = useState(1);', 'const [zoom, setZoom] = useState(0.85);');
v2 = v2.replaceAll('setZoom(1);', 'setZoom(0.85);');
if (!v2.includes("function EditablePdfHotspot")) {
  const helper = String.raw`

function EditablePdfHotspot({ candidate, active, disabled, draftName, onSelect, onChange, stageRef }: { candidate: PdfMenuCandidate; active: boolean; disabled: boolean; draftName: string; onSelect: () => void; onChange: (rect: Rect) => void; stageRef: React.RefObject<HTMLDivElement | null> }) {
  const drag = useRef<{ pointerX: number; pointerY: number; rect: Rect; mode: string } | null>(null);
  const rect = { x: candidate.x, y: candidate.y, width: candidate.width, height: candidate.height };
  const begin = (event: React.PointerEvent<HTMLButtonElement>, mode: string) => {
    if (disabled) return;
    event.preventDefault();
    event.stopPropagation();
    if (!active) { onSelect(); return; }
    event.currentTarget.setPointerCapture?.(event.pointerId);
    drag.current = { pointerX: event.clientX, pointerY: event.clientY, rect, mode };
  };
  const move = (event: React.PointerEvent<HTMLButtonElement>) => {
    const state = drag.current;
    const stage = stageRef.current;
    if (!state || !stage) return;
    event.preventDefault();
    event.stopPropagation();
    const box = stage.getBoundingClientRect();
    const dx = (event.clientX - state.pointerX) / Math.max(1, box.width);
    const dy = (event.clientY - state.pointerY) / Math.max(1, box.height);
    let { x, y, width, height } = state.rect;
    if (state.mode === "move") { x += dx; y += dy; }
    else {
      if (state.mode.includes("w")) { x += dx; width -= dx; }
      if (state.mode.includes("e")) width += dx;
      if (state.mode.includes("n")) { y += dy; height -= dy; }
      if (state.mode.includes("s")) height += dy;
    }
    const left = Math.max(0, Math.min(1, Math.min(x, x + width)));
    const top = Math.max(0, Math.min(1, Math.min(y, y + height)));
    const right = Math.max(0, Math.min(1, Math.max(x, x + width)));
    const bottom = Math.max(0, Math.min(1, Math.max(y, y + height)));
    onChange({ x: left, y: top, width: Math.max(0.008, right - left), height: Math.max(0.008, bottom - top) });
  };
  const end = (event: React.PointerEvent<HTMLButtonElement>) => { event.stopPropagation(); drag.current = null; };
  const handles = [["nw", "-left-1 -top-1 cursor-nwse-resize"], ["n", "left-1/2 -top-1 -translate-x-1/2 cursor-ns-resize"], ["ne", "-right-1 -top-1 cursor-nesw-resize"], ["w", "-left-1 top-1/2 -translate-y-1/2 cursor-ew-resize"], ["e", "-right-1 top-1/2 -translate-y-1/2 cursor-ew-resize"], ["sw", "-left-1 -bottom-1 cursor-nesw-resize"], ["s", "left-1/2 -bottom-1 -translate-x-1/2 cursor-ns-resize"], ["se", "-right-1 -bottom-1 cursor-nwse-resize"]] as const;
  return <div className={"absolute z-30 " + (disabled ? "pointer-events-none" : "")} style={{ left: (rect.x * 100) + "%", top: (rect.y * 100) + "%", width: (rect.width * 100) + "%", height: (rect.height * 100) + "%" }}>
    <button type="button" aria-label={active ? "Move selected product area" : "Open selected product"} onClick={(event) => { event.stopPropagation(); if (!disabled) onSelect(); }} onPointerDown={(event) => begin(event, "move")} onPointerMove={move} onPointerUp={end} onPointerCancel={end} className={"absolute inset-0 rounded-md border-2 transition " + (active ? "border-primary bg-primary/15 shadow-[0_0_0_3px_hsl(var(--primary)/.12)]" : "border-primary/50 bg-primary/5 hover:border-primary")}>
      <span className="absolute -top-5 left-1 max-w-[180px] truncate rounded bg-primary px-1.5 py-0.5 text-[9px] font-black text-primary-foreground">{draftName || "Product"}</span>
    </button>
    {active ? handles.map(([mode, position]) => <button key={mode} type="button" aria-label={"Resize selected area " + mode} onPointerDown={(event) => begin(event, mode)} onPointerMove={move} onPointerUp={end} onPointerCancel={end} className={"absolute z-50 size-3 rounded-full border-2 border-background bg-primary shadow " + position} />) : null}
  </div>;
}
`;
  v2 = v2.replace("\nexport function PdfMenuManagerV2", helper + "\nexport function PdfMenuManagerV2");
}
const hotspotPattern = /<div className="pointer-events-none absolute inset-0">\{pageCandidates\.map\(\(candidate\) => <button[\s\S]*?<\/div>\{dragRect &&/;
const hotspotReplacement = '<div className="pointer-events-none absolute inset-0">{pageCandidates.map((candidate) => <EditablePdfHotspot key={candidate.id} candidate={candidate} active={candidate.id === activeId} disabled={selecting || editingArea} draftName={drafts[candidate.id]?.name_en || drafts[candidate.id]?.name_ar || ""} onSelect={() => { setActiveId(candidate.id); setSelecting(false); setEditingArea(false); setZoom(0.85); }} onChange={(rect) => setAnalysis((current) => ({ ...current, candidates: current.candidates.map((c) => c.id === candidate.id ? { ...c, ...rect } : c) }))} stageRef={stageRef} />)}</div>{dragRect &&';
if (hotspotPattern.test(v2)) v2 = v2.replace(hotspotPattern, hotspotReplacement);
else console.log("manual-menu-repair: V2 hotspot pattern not found; leaving V2 unchanged");
await fs.writeFile(v2Path, v2);

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
console.log("manual-menu-repair: control flow, V2 manual shape editing, fit zoom, and Arabic charge labels hardened");

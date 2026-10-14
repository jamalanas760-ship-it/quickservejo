import { TablePlanSymbol } from "./TablePlanSymbol";
import { ActionMenu } from "@/components/app/ActionMenu";
import { FloorRotationControl } from "./FloorRotationControl";
import { FloorPlanSymbol } from "./FloorPlanSymbol";
import { lazy, Suspense, useEffect, useRef, useState, type PointerEvent, type RefObject } from "react";
import {
  Armchair,
  CookingPot,
  DoorOpen,
  Fence,
  Flower2,
  RectangleHorizontal,
  Sofa,
  Toilet,
  TreeDeciduous,
  Wine,
  Copy,
  Trash2,
} from "lucide-react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  FLOOR_ELEMENT_LABELS,
  FLOOR_ELEMENT_TYPES,
  moveFloorElement,
  normalizeFloorElement,
  type FloorElement,
  type FloorElementType,
} from "@/lib/floor-plan-elements";
const FloorElementPreview = lazy(() => import("./FloorElementPreview").then(module => ({ default: module.FloorElementPreview })));
const icons = {
  wall: Fence,
  door: DoorOpen,
  window: RectangleHorizontal,
  tree: TreeDeciduous,
  plant: Flower2,
  toilet: Toilet,
  kitchen: CookingPot,
  bar: Wine,
  counter: RectangleHorizontal,
  sofa: Sofa,
  chair: Armchair,
  stool: Armchair,
  partition: Fence, reception: RectangleHorizontal, storage: RectangleHorizontal, buffet: CookingPot, bench: Sofa, planter: Flower2,
};
export function FloorElementLibrary({
  ar,
  flat = false,
  onAddEntrance,
  busy,
  onAdd,
  onAddTable,
}: {
  ar: boolean;
  flat?: boolean;
  busy: boolean;
  onAdd: (type: FloorElementType, preset?: Partial<Pick<FloorElement, "width" | "height" | "label">>) => void;
  onAddEntrance?: () => void;
  onAddTable?: ((shape: "round" | "square" | "rectangle", capacity?: number) => void) | undefined;
}) {
  const [search, setSearch] = useState("");
  const groups = [
    { title: ar ? "الجدران والمداخل" : "Architecture", types: ["wall", "door", "window", "partition"] },
    {
      title: ar ? "الأثاث والتجهيزات" : "Furniture & fixtures",
      types: ["chair", "stool", "sofa", "bar", "counter", "kitchen", "toilet", "reception", "storage", "buffet", "bench"],
    },
    { title: ar ? "النباتات" : "Plants", types: ["tree", "plant", "planter"] },
  ];
  const matches = (...labels: string[]) => labels.some(label => label.toLowerCase().includes(search.trim().toLowerCase()));
  const labelsFor = (type: FloorElementType) => [...FLOOR_ELEMENT_LABELS[type], ...(flat && type === "sofa" ? ["Booth", "جلسة بوث"] : flat && type === "door" ? ["Service door", "باب خدمة"] : [])];
  const tableShapes = onAddTable ? (["round", "square", "rectangle"] as const).filter(shape => (!search || flat) && matches(shape, shape === "round" ? "طاولة دائرية" : shape === "square" ? "طاولة مربعة" : "طاولة مستطيلة")) : [];
  const showCommunal = flat && Boolean(onAddTable) && matches("Communal table", "طاولة مشتركة");
  const showEntrance = flat && Boolean(onAddEntrance) && matches("Main entrance", "المدخل الرئيسي");
  const showColumn = flat && matches("Column", "عمود");
  return (
    <div className="qs-element-library-wrap" data-flat={flat}>
      <label className="qs-element-search">
        <Search className="size-4" />
        <input
          type="search"
          aria-label={ar ? "ابحث عن عنصر" : "Search elements"}
          placeholder={ar ? "ابحث عن عنصر…" : "Find an element…"}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </label>
      {onAddTable && (tableShapes.length > 0 || showCommunal) && (
        <section>
          <h3>{ar ? "الطاولات" : "Tables"}</h3>
          <div className="qs-element-library">
            {tableShapes.map((shape) => (
              <button key={shape} type="button" disabled={busy} onClick={() => onAddTable(shape)}>
                {flat ? <span className="qs-floor-library-preview"><TablePlanSymbol shape={shape} /></span> : <Suspense fallback={<TablePlanSymbol shape={shape} />}><FloorElementPreview type={shape}/></Suspense>}
                <span>
                  {
                    {
                      round: ar ? "دائرية" : "Round",
                      square: ar ? "مربعة" : "Square",
                      rectangle: ar ? "مستطيلة" : "Rectangle",
                    }[shape]
                  }
                </span>
              </button>
            ))}
            {showCommunal && <button type="button" disabled={busy} onClick={() => onAddTable("rectangle", 8)}><span className="qs-floor-library-preview"><TablePlanSymbol shape="rectangle" seats={8} /></span><span>{ar ? "طاولة مشتركة" : "Communal table"}</span></button>}
          </div>
        </section>
      )}
      {(showEntrance || showColumn) && <section><h3>{ar ? "المداخل والهيكل" : "Entrances & structure"}</h3><div className="qs-element-library">
        {showEntrance && <button type="button" disabled={busy} onClick={onAddEntrance}><span className="qs-floor-library-preview"><FloorPlanSymbol type="door" doubleDoor /></span><span>{ar ? "المدخل الرئيسي" : "Main entrance"}</span></button>}
        {showColumn && <button type="button" disabled={busy} onClick={() => onAdd("wall", { width: 4, height: 6, label: ar ? "عمود" : "Column" })}><span className="qs-floor-library-preview"><FloorPlanSymbol type="wall" /></span><span>{ar ? "عمود" : "Column"}</span></button>}
      </div></section>}
      {groups.map((group) => {
        const types = group.types.filter((type) =>
          labelsFor(type as FloorElementType).some((label) =>
            label.toLowerCase().includes(search.trim().toLowerCase()),
          ),
        ) as FloorElementType[];
        if (!types.length) return null;
        return (
          <section key={group.title}>
            <h3>{group.title}</h3>
            <div className="qs-element-library">
              {types.map((type) => {
                return (
                  <button key={type} type="button" disabled={busy} onClick={() => onAdd(type, flat && type === "sofa" ? { label: ar ? "جلسة بوث" : "Booth" } : flat && type === "door" ? { label: ar ? "باب خدمة" : "Service door" } : undefined)}>
                    {flat ? <span className="qs-floor-library-preview"><FloorPlanSymbol type={type} /></span> : <Suspense fallback={<FloorPlanSymbol type={type} />}><FloorElementPreview type={type}/></Suspense>}
                    <span>{flat && type === "sofa" ? (ar ? "جلسة بوث" : "Booth") : flat && type === "door" ? (ar ? "باب خدمة" : "Service door") : FLOOR_ELEMENT_LABELS[type][ar ? 1 : 0]}</span>
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
      {!tableShapes.length && !showCommunal && !showEntrance && !showColumn && !groups.some((group) =>
        group.types.some((type) =>
          labelsFor(type as FloorElementType).some((label) =>
            label.toLowerCase().includes(search.trim().toLowerCase()),
          ),
        ),
      ) && (
        <p role="status" className="text-sm text-muted-foreground">
          {ar ? "لا توجد عناصر مطابقة" : "No matching elements"}
        </p>
      )}
    </div>
  );
}
export function FloorElementPiece({
  element,
  selected,
  editable,
  busy,
  grid,
  canvasRef,
  onSelect,
  onPreview,
  onCommit,
}: {
  element: FloorElement;
  selected: boolean;
  editable: boolean;
  busy: boolean;
  grid: boolean;
  canvasRef: RefObject<HTMLDivElement | null>;
  onSelect: () => void;
  onPreview: (next: FloorElement) => void;
  onCommit: (next: FloorElement, previous: FloorElement) => void;
}) {
  const drag = useRef<{
    pointer: number;
    x: number;
    y: number;
    start: FloorElement;
    next: FloorElement;
    resize: boolean;
  } | null>(null);
  const previewFrame = useRef(0);
  useEffect(() => () => cancelAnimationFrame(previewFrame.current), []);
  function down(event: PointerEvent<HTMLElement>, resize = false) {
    event.stopPropagation();
    onSelect();
    if (!editable || busy) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      pointer: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      start: element,
      next: element,
      resize,
    };
  }
  function move(event: PointerEvent<HTMLElement>) {
    const state = drag.current,
      rect = canvasRef.current?.getBoundingClientRect();
    if (!state || !rect || state.pointer !== event.pointerId) return;
    if (Math.hypot(event.clientX-state.x,event.clientY-state.y) < 4 && state.next === state.start) return;
    state.next = moveFloorElement(
      state.start,
      ((event.clientX - state.x) / rect.width) * 100,
      ((event.clientY - state.y) / rect.height) * 100,
      grid,
      state.resize,
    );
    if (!previewFrame.current) previewFrame.current = requestAnimationFrame(() => {
      previewFrame.current = 0;
      if (drag.current) onPreview(drag.current.next);
    });
  }
  function end(event: PointerEvent<HTMLElement>) {
    const state = drag.current;
    if (!state || state.pointer !== event.pointerId) return;
    drag.current = null;
    cancelAnimationFrame(previewFrame.current);
    previewFrame.current = 0;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    if (event.type === "pointercancel") {
      onPreview(state.start);
      return;
    }
    if (["x", "y", "width", "height"].some(key => state.next[key as "x" | "y" | "width" | "height"] !== state.start[key as "x" | "y" | "width" | "height"])) {
      onPreview(state.next);
      onCommit(state.next, state.start);
    }
  }
  return (
    <div
      className={`qs-floor-element qs-floor-element-${element.type}${selected ? " is-selected" : ""}`}
      style={{
        left: `${element.x}%`,
        top: `${element.y}%`,
        width: `${element.width}%`,
        height: `${element.height}%`,
        transform: `translate(-50%,-50%) rotate(${element.rotation}deg)`,
      }}
    >
      <button
        type="button"
        className="qs-floor-element-body"
        aria-label={element.label || FLOOR_ELEMENT_LABELS[element.type][0]}
        aria-pressed={selected}
        onKeyDown={event => {
          const moves: Record<string,[number,number]> = { ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1] };
          if (!editable || busy || !moves[event.key]) return;
          event.preventDefault(); event.stopPropagation();
          const [dx,dy] = moves[event.key], next = moveFloorElement(element,dx,dy,grid);
          onPreview(next); onCommit(next,element);
        }}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
      >
        <FloorPlanSymbol type={element.type} />
      </button>
      {selected && editable && (
        <button
          type="button"
          aria-label={`Resize ${element.label}`}
          className="qs-element-resize"
          onPointerDown={(e) => down(e, true)}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
        />
      )}
    </div>
  );
}
export function FloorElementInspector({
  element,
  ar,
  flat = false,
  busy,
  onSave,
  showRotation = true,
  onDuplicate,
  onDelete,
}: {
  element: FloorElement;
  ar: boolean;
  flat?: boolean;
  busy: boolean;
  onSave: (next: FloorElement) => void;
  showRotation?: boolean;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const [draft, setDraft] = useState(element);
  useEffect(() => setDraft(element), [element]);
  return (
    <div className="qs-element-inspector space-y-4 p-5">
      <div className="qs-element-inspector-preview">
        {flat ? <FloorPlanSymbol type={element.type} /> : <Suspense fallback={<FloorPlanSymbol type={element.type} />}><FloorElementPreview type={element.type}/></Suspense>}
      </div>
      <h2 className="text-lg font-bold">{FLOOR_ELEMENT_LABELS[element.type][ar ? 1 : 0]}</h2>
      <p className="text-xs text-muted-foreground">
        {ar
          ? showRotation ? "اسحب العنصر لتحريكه. استخدم الأسهم لتدويره." : "اسحب للتحريك. استخدم أدوات المخطط للدوران."
          : showRotation ? "Drag the object to move it. Use the arrows to rotate." : "Drag to move. Rotate with the canvas controls."}
      </p>
      {showRotation && <FloorRotationControl value={draft.rotation} ar={ar} disabled={busy} onChange={rotation => { const next = normalizeFloorElement({ ...draft, rotation }); setDraft(next); onSave(next); }} />}
      <label className="block text-xs font-semibold">
        {ar ? "الاسم" : "Label"}
        <Input
          className="mt-2"
          maxLength={60}
          value={draft.label}
          onChange={(e) => setDraft({ ...draft, label: e.target.value })}
        />
      </label>
      <details className="qs-floor-advanced"><summary>{ar ? "الحجم والموقع الدقيق" : "Size & precise position"}</summary><div className="grid grid-cols-2 gap-3">
        {(["x", "y", "width", "height", "rotation"] as const).map((key) => (
          <label key={key} className="text-xs font-semibold">
            {
              {
                x: "X %",
                y: "Y %",
                width: ar ? "العرض %" : "Width %",
                height: ar ? "الارتفاع %" : "Height %",
                rotation: ar ? "الدوران °" : "Rotation °",
              }[key]
            }
            <Input
              className="mt-2"
              type="number"
              step="0.5"
              min={key === "rotation" ? -180 : 0}
              max={key === "rotation" ? 180 : 100}
              value={draft[key]}
              onChange={(e) => setDraft({ ...draft, [key]: Number(e.target.value) })}
            />
          </label>
        ))}
      </div></details>
      <Button
        type="button"
        className="w-full"
        disabled={busy}
        onClick={() => onSave(normalizeFloorElement(draft))}
      >
        {ar ? "حفظ التغييرات" : "Save changes"}
      </Button>
      <ActionMenu ar={ar} label={ar ? "خيارات العنصر" : "Object options"} actions={[
        { label: ar ? "نسخ" : "Duplicate", icon: Copy, disabled: busy, onSelect: onDuplicate },
        { label: ar ? "حذف العنصر" : "Delete element", icon: Trash2, disabled: busy, destructive: true, onSelect: onDelete },
      ]} />
    </div>
  );
}

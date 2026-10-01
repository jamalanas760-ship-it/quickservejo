import { useEffect, useRef, useState, type PointerEvent, type RefObject } from "react";
import {
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
  RotateCw,
  Trash2,
} from "lucide-react";
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
};
export function FloorElementLibrary({
  ar,
  busy,
  onAdd,
}: {
  ar: boolean;
  busy: boolean;
  onAdd: (type: FloorElementType) => void;
}) {
  return (
    <div className="qs-element-library">
      {FLOOR_ELEMENT_TYPES.map((type) => {
        const Icon = icons[type];
        return (
          <button key={type} type="button" disabled={busy} onClick={() => onAdd(type)}>
            <Icon />
            <span>{FLOOR_ELEMENT_LABELS[type][ar ? 1 : 0]}</span>
          </button>
        );
      })}
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
  const Icon = icons[element.type];
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
    state.next = moveFloorElement(
      state.start,
      ((event.clientX - state.x) / rect.width) * 100,
      ((event.clientY - state.y) / rect.height) * 100,
      grid,
      state.resize,
    );
    onPreview(state.next);
  }
  function end(event: PointerEvent<HTMLElement>) {
    const state = drag.current;
    if (!state || state.pointer !== event.pointerId) return;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    if (event.type === "pointercancel") {
      onPreview(state.start);
      return;
    }
    onCommit(state.next, state.start);
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
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
      >
        <Icon aria-hidden="true" />
        {!["wall", "window", "tree", "plant", "door"].includes(element.type) && (
          <span>{element.label}</span>
        )}
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
  busy,
  onSave,
  onDuplicate,
  onDelete,
}: {
  element: FloorElement;
  ar: boolean;
  busy: boolean;
  onSave: (next: FloorElement) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const [draft, setDraft] = useState(element);
  useEffect(() => setDraft(element), [element]);
  return (
    <div className="space-y-4 p-5">
      <h2 className="text-lg font-bold">{FLOOR_ELEMENT_LABELS[element.type][ar ? 1 : 0]}</h2>
      <p className="text-xs text-muted-foreground">
        {ar
          ? "اسحب للتحريك. استخدم المقبض لتغيير الحجم."
          : "Drag to move. Use the corner handle to resize."}
      </p>
      <label className="block text-xs font-semibold">
        {ar ? "الاسم" : "Label"}
        <Input
          className="mt-2"
          maxLength={60}
          value={draft.label}
          onChange={(e) => setDraft({ ...draft, label: e.target.value })}
        />
      </label>
      <div className="grid grid-cols-2 gap-3">
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
      </div>
      <Button
        type="button"
        className="w-full"
        disabled={busy}
        onClick={() => onSave(normalizeFloorElement(draft))}
      >
        {ar ? "حفظ التغييرات" : "Save changes"}
      </Button>
      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() =>
            onSave({ ...element, rotation: element.rotation >= 180 ? -180 : element.rotation + 15 })
          }
        >
          <RotateCw className="size-4" />
          {ar ? "تدوير" : "Rotate"}
        </Button>
        <Button type="button" variant="outline" disabled={busy} onClick={onDuplicate}>
          <Copy className="size-4" />
          {ar ? "نسخ" : "Duplicate"}
        </Button>
      </div>
      <Button
        type="button"
        variant="outline"
        className="w-full text-destructive"
        disabled={busy}
        onClick={onDelete}
      >
        <Trash2 className="size-4" />
        {ar ? "حذف العنصر" : "Delete element"}
      </Button>
    </div>
  );
}

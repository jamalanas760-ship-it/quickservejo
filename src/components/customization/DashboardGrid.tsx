import { useEffect, useRef, useState, type CSSProperties, type DragEvent, type PointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { GripVertical, Maximize2 } from "lucide-react";

import "@/dashboard-grid.css";
import { cn } from "@/lib/utils";

export type DashboardItemSize = { columns: number; minHeight: number };

type GridStyle = CSSProperties & {
  "--qs-grid-columns": string;
  "--qs-grid-height": string;
};

type DashboardGridProps<T extends string> = {
  ids: readonly T[];
  customize: boolean;
  sizeFor: (id: T) => DashboardItemSize;
  onReorder?: (source: T, target: T) => void;
  onResize?: (id: T, size: DashboardItemSize) => void;
  minColumns?: (id: T) => number;
  minHeight?: (id: T) => number;
  labelFor?: (id: T) => string;
  renderItem: (id: T) => ReactNode;
  className?: string;
};

type ResizeState<T extends string> = {
  id: T;
  pointerId: number;
  startX: number;
  startY: number;
  start: DashboardItemSize;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function normalizeDashboardSize(value: unknown, fallback: DashboardItemSize): DashboardItemSize {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  const raw = value as Record<string, unknown>;
  const columns = typeof raw.columns === "number" && Number.isFinite(raw.columns) ? clamp(Math.round(raw.columns), 1, 12) : fallback.columns;
  const minHeight = typeof raw.minHeight === "number" && Number.isFinite(raw.minHeight) ? clamp(Math.round(raw.minHeight / 20) * 20, 120, 800) : fallback.minHeight;
  return { columns, minHeight };
}

export function reorderDashboardItems<T extends string>(items: readonly T[], source: T, target: T): T[] {
  if (source === target) return [...items];
  const next = [...items];
  const from = next.indexOf(source);
  const to = next.indexOf(target);
  if (from < 0 || to < 0) return next;
  next.splice(from, 1);
  next.splice(to, 0, source);
  return next;
}

export function DashboardGrid<T extends string>({
  ids,
  customize,
  sizeFor,
  onReorder,
  onResize,
  minColumns,
  minHeight,
  labelFor,
  renderItem,
  className,
}: DashboardGridProps<T>) {
  const dragging = useRef<T | null>(null);
  const resizing = useRef<ResizeState<T> | null>(null);
  const [dropTarget, setDropTarget] = useState<T | null>(null);
  const [dragPreview, setDragPreview] = useState<{ id: T; x: number; y: number; width: number; height: number; offsetX: number; offsetY: number } | null>(null);

  useEffect(() => {
    if (!dragPreview) return;
    const move = (event: globalThis.DragEvent) => {
      if (!event.clientX && !event.clientY) return;
      setDragPreview((current) => current ? { ...current, x: event.clientX, y: event.clientY } : null);
      const edge = 72;
      const speed = 18;
      if (event.clientY < edge) window.scrollBy({ top: -speed, behavior: "auto" });
      else if (event.clientY > window.innerHeight - edge) window.scrollBy({ top: speed, behavior: "auto" });
    };
    window.addEventListener("dragover", move);
    return () => window.removeEventListener("dragover", move);
  }, [Boolean(dragPreview)]);

  function startDrag(event: DragEvent<HTMLButtonElement>, id: T) {
    dragging.current = id;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", id);
    const item = event.currentTarget.closest<HTMLElement>(".qs-custom-grid-item");
    const rect = item?.getBoundingClientRect();
    if (rect) {
      const transparent = document.createElement("canvas");
      transparent.width = transparent.height = 1;
      event.dataTransfer.setDragImage(transparent, 0, 0);
      setDragPreview({ id, x: event.clientX, y: event.clientY, width: rect.width, height: rect.height, offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top });
    }
  }

  function drop(event: DragEvent<HTMLDivElement>, target: T) {
    event.preventDefault();
    const source = dragging.current ?? event.dataTransfer.getData("text/plain") as T;
    dragging.current = null;
    setDragPreview(null);
    setDropTarget(null);
    if (source && source !== target) onReorder?.(source, target);
  }

  function beginResize(event: PointerEvent<HTMLButtonElement>, id: T) {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    resizing.current = {
      id,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      start: sizeFor(id),
    };
  }

  function resize(event: PointerEvent<HTMLButtonElement>) {
    const state = resizing.current;
    if (!state || state.pointerId !== event.pointerId) return;
    const rtl = typeof document !== "undefined" && document.documentElement.dir === "rtl";
    const dx = (event.clientX - state.startX) * (rtl ? -1 : 1);
    const dy = event.clientY - state.startY;
    const columns = clamp(state.start.columns + Math.round(dx / 72), minColumns?.(state.id) ?? 3, 12);
    const heightFloor = minHeight?.(state.id) ?? 140;
    const nextHeight = clamp(state.start.minHeight + Math.round(dy / 40) * 40, heightFloor, 800);
    onResize?.(state.id, { columns, minHeight: nextHeight });
  }

  function endResize(event: PointerEvent<HTMLButtonElement>) {
    if (resizing.current?.pointerId === event.pointerId) resizing.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  return (
    <div className={cn("qs-custom-grid", customize && "qs-custom-grid--editing", className)}>
      {ids.map((id) => {
        const size = sizeFor(id);
        const style: GridStyle = {
          "--qs-grid-columns": String(size.columns),
          "--qs-grid-height": `${size.minHeight}px`,
        };
        return (
          <div
            key={id}
            className={cn("qs-custom-grid-item", customize && "relative rounded-2xl border border-dashed border-[#ff5a0a]/35 bg-[#ff5a0a]/[.025] p-2 pt-11 transition", dropTarget === id && "border-[#ff5a0a] bg-[#ff5a0a]/[.06]")}
            style={style}
            onDragOver={(event) => {
              if (!customize) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
              setDropTarget(id);
            }}
            onDragLeave={() => setDropTarget((current) => current === id ? null : current)}
            onDrop={(event) => customize && drop(event, id)}
          >
            {customize ? (
              <div className="absolute inset-x-2 top-2 z-20 flex h-7 items-center gap-2 rounded-lg border border-border bg-card/95 px-2 shadow-sm backdrop-blur">
                <button
                  type="button"
                  draggable
                  onDragStart={(event) => startDrag(event, id)}
                  onDragEnd={() => { dragging.current = null; setDropTarget(null); setDragPreview(null); }}
                  className="inline-flex min-h-0 cursor-grab items-center gap-1.5 text-[10px] font-bold text-muted-foreground active:cursor-grabbing"
                  aria-label={`Drag ${labelFor?.(id) ?? id}`}
                >
                  <GripVertical className="size-3.5" />
                  <span className="max-w-[180px] truncate">{labelFor?.(id) ?? id}</span>
                </button>
                <span className="ms-auto rounded-md bg-muted px-1.5 py-0.5 text-[9px] font-bold text-muted-foreground">{size.columns}/12 · {size.minHeight}px</span>
              </div>
            ) : null}
            <div className="min-h-0 h-full">{renderItem(id)}</div>
            {customize ? (
              <button
                type="button"
                aria-label={`Resize ${labelFor?.(id) ?? id}`}
                className="absolute -bottom-1.5 -end-1.5 z-30 grid size-8 min-h-0 touch-none cursor-nwse-resize place-items-center rounded-full border-2 border-background bg-[#ff5a0a] text-white shadow-lg"
                onPointerDown={(event) => beginResize(event, id)}
                onPointerMove={resize}
                onPointerUp={endResize}
                onPointerCancel={endResize}
              >
                <Maximize2 className="size-3.5" />
              </button>
            ) : null}
          </div>
        );
      })}
      {dragPreview && typeof document !== "undefined" ? createPortal(
        <div
          className="qs-dashboard-drag-overlay"
          aria-hidden="true"
          style={{ width: dragPreview.width, height: dragPreview.height, transform: `translate3d(${dragPreview.x - dragPreview.offsetX}px,${dragPreview.y - dragPreview.offsetY}px,0)` }}
        >
          <div className="h-full min-h-0 overflow-hidden rounded-2xl border border-[#ff5a0a]/50 bg-card shadow-2xl">{renderItem(dragPreview.id)}</div>
        </div>,
        document.body,
      ) : null}
    </div>
  );
}

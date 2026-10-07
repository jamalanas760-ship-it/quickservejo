import "./service-board.css";
import { useRef, useState, type ReactNode } from "react";
import { GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";

type Ticket = { id: string; status: string; order_number?: string };
const lanes = ["new", "preparing", "ready"] as const;
type Lane = (typeof lanes)[number];
const stage = (status: string): Lane => (status === "accepted" ? "preparing" : (status as Lane));
export function ServiceBoard<T extends Ticket>({
  orders,
  ar,
  busyIds,
  renderTicket,
  onMove,
}: {
  orders: T[];
  ar: boolean;
  busyIds: Set<string>;
  renderTicket: (order: T) => ReactNode;
  onMove: (id: string, lane: Lane) => void;
}) {
  const [tab, setTab] = useState<Lane>("new");
  const [dragId, setDragId] = useState<string | null>(null);
  const pointerDrag = useRef<{ id: string; x: number; y: number; moved: boolean } | null>(null);
  const [over, setOver] = useState<Lane | null>(null);
  const canMove = (lane: Lane, id = dragId) => {
    const order = orders.find((row) => row.id === id);
    return (
      order &&
      !busyIds.has(order.id) &&
      ((order.status === "new" && lane === "preparing") ||
        (order.status === "preparing" && lane === "ready"))
    );
  };
  const label = (lane: Lane) =>
    ({
      new: ar ? "جديد" : "New",
      preparing: ar ? "قيد التحضير" : "Preparing",
      ready: ar ? "جاهز" : "Ready",
    })[lane];
  return (
    <div>
      <div
        className="mb-4 flex rounded-xl border bg-muted/40 p-1 md:hidden"
        role="tablist"
        aria-label={ar ? "مراحل المطبخ" : "Kitchen stages"}
      >
        {lanes.map((lane) => (
          <button
            type="button"
            role="tab"
            id={`stage-${lane}`}
            aria-controls={`lane-${lane}`}
            aria-selected={tab === lane}
            key={lane}
            onClick={() => setTab(lane)}
            onKeyDown={(event) => {
              if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) return;
              event.preventDefault();
              const index = lanes.indexOf(lane);
              const next =
                event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? 2
                    : (index + (event.key === "ArrowRight" ? 1 : 2)) % 3;
              setTab(lanes[next]!);
              document.getElementById(`stage-${lanes[next]}`)?.focus();
            }}
            className={cn(
              "min-h-11 flex-1 rounded-lg text-sm font-semibold",
              tab === lane ? "bg-card text-foreground shadow-sm" : "text-muted-foreground",
            )}
          >
            {label(lane)}{" "}
            <span className="ms-1 tabular-nums">
              {orders.filter((order) => stage(order.status) === lane).length}
            </span>
          </button>
        ))}
      </div>
      <div className="grid items-start gap-5 md:grid-cols-3">
        {lanes.map((lane) => {
          const tickets = orders.filter((order) => stage(order.status) === lane);
          return (
            <section
              key={lane}
              id={`lane-${lane}`}
              data-kitchen-lane={lane}
              aria-labelledby={`heading-${lane}`}
              onDragOver={(event) => {
                if (canMove(lane)) {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  setOver(lane);
                }
              }}
              onDragLeave={() => setOver(null)}
              onDrop={(event) => {
                event.preventDefault();
                const id = event.dataTransfer.getData("text/plain") || dragId;
                if (id && canMove(lane, id)) onMove(id, lane);
                setDragId(null);
                setOver(null);
              }}
              className={cn(
                "min-w-0 rounded-2xl bg-muted/25 p-3 transition-colors duration-300 motion-reduce:transition-none",
                tab !== lane && "hidden md:block",
                over === lane && "ring-2 ring-primary bg-primary/5",
              )}
            >
              <h2 id={`heading-${lane}`} className="mb-4 flex items-center gap-2 text-sm font-bold">
                <span
                  className={cn(
                    "size-2 rounded-full",
                    lane === "new"
                      ? "bg-orange-500"
                      : lane === "preparing"
                        ? "bg-blue-500"
                        : "bg-emerald-500",
                  )}
                />
                {label(lane)}
                <span className="ms-auto rounded-md border bg-card px-2 py-1 text-xs tabular-nums">
                  {tickets.length}
                </span>
              </h2>
              <div className="space-y-3">
                {tickets.map((order) => (
                  <div
                    key={order.id}
                    className={cn(
                      "relative qs-service-ticket",
                      dragId === order.id && "opacity-50",
                    )}
                  >
                    <div className="mb-1 hidden justify-end md:flex">
                      <button
                        type="button"
                        disabled={busyIds.has(order.id) || order.status === "ready"}
                        draggable={false}
                        onPointerDown={(event) => {
                          if (busyIds.has(order.id) || order.status === "ready") return;
                          event.preventDefault();
                          event.currentTarget.setPointerCapture(event.pointerId);
                          pointerDrag.current = {
                            id: order.id,
                            x: event.clientX,
                            y: event.clientY,
                            moved: false,
                          };
                        }}
                        onPointerMove={(event) => {
                          const drag = pointerDrag.current;
                          if (!drag) return;
                          if (
                            Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 6 &&
                            !drag.moved
                          )
                            return;
                          drag.moved = true;
                          setDragId(drag.id);
                          const target = (
                            document
                              .elementFromPoint(event.clientX, event.clientY)
                              ?.closest("[data-kitchen-lane]") as HTMLElement | null
                          )?.dataset.kitchenLane as Lane | undefined;
                          setOver(target && canMove(target, drag.id) ? target : null);
                        }}
                        onPointerUp={(event) => {
                          const drag = pointerDrag.current;
                          const target = (
                            document
                              .elementFromPoint(event.clientX, event.clientY)
                              ?.closest("[data-kitchen-lane]") as HTMLElement | null
                          )?.dataset.kitchenLane as Lane | undefined;
                          if (drag?.moved && target && canMove(target, drag.id))
                            onMove(drag.id, target);
                          pointerDrag.current = null;
                          setDragId(null);
                          setOver(null);
                          if (event.currentTarget.hasPointerCapture(event.pointerId))
                            event.currentTarget.releasePointerCapture(event.pointerId);
                        }}
                        onPointerCancel={() => {
                          pointerDrag.current = null;
                          setDragId(null);
                          setOver(null);
                        }}
                        onDragStart={(event) => {
                          event.dataTransfer.setData("text/plain", order.id);
                          event.dataTransfer.effectAllowed = "move";
                          setDragId(order.id);
                        }}
                        onDragEnd={() => {
                          setDragId(null);
                          setOver(null);
                        }}
                        aria-label={
                          ar
                            ? "اسحب الطلب للمرحلة التالية أو استخدم زر الحالة"
                            : `Drag ticket ${order.order_number ?? order.id} to next stage, or use its status button`
                        }
                        className="flex min-h-11 min-w-11 touch-none cursor-grab items-center justify-center rounded-lg text-muted-foreground active:cursor-grabbing"
                      >
                        <GripVertical className="size-4" />
                      </button>
                    </div>
                    {renderTicket(order)}
                  </div>
                ))}
              </div>
              {!tickets.length ? (
                <p className="flex min-h-32 items-center justify-center rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">
                  {ar ? "لا توجد طلبات في هذه المرحلة" : "No tickets in this stage"}
                </p>
              ) : null}
              <p className="mt-4 hidden rounded-xl border border-dashed p-3 text-center text-xs text-muted-foreground md:block">
                {lane === "new"
                  ? ar
                    ? "الطلبات الجديدة تظهر تلقائياً"
                    : "New orders appear automatically"
                  : ar
                    ? "اسحب للمرحلة التالية أو استخدم زر الطلب"
                    : "Drag to the next stage or use the ticket button"}
              </p>
            </section>
          );
        })}
      </div>
    </div>
  );
}

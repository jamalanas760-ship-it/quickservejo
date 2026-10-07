import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight, GripVertical, Table2, X } from "lucide-react";
import { toast } from "sonner";
import { MasterPageHeader } from "@/components/app/MasterPage";
import { ActionMenu } from "@/components/app/ActionMenu";
import { AppHeader } from "@/components/nav/AppHeader";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DetailSheet } from "@/components/operations/DetailSheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { useWorkspaceScope } from "@/hooks/useWorkspace";
import { useServiceLive, invalidateServiceQueries } from "@/hooks/useServiceLive";
import { supabase } from "@/integrations/supabase/client";
import { humanError } from "@/lib/errors";
import { reservationDay, bookingTimeLabel } from "@/lib/reservation-studio";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/host")({
  head: () => ({ meta: [{ title: "Frontdesk — QuickServe" }] }),
  component: HostWorkspace,
});
type Arrival = {
  id: string;
  customer_name: string;
  guest_count: number;
  booking_at: string;
  ends_at: string;
  status: string;
  table_id: string | null;
  notes: string | null;
};
type Seat = {
  id: string;
  table_number: string;
  capacity: number;
  service_status: string;
  busy: boolean;
};
function HostWorkspace() {
  const { lang } = useI18n(),
    ar = lang === "ar";
  const scope = useWorkspaceScope(),
    rid = scope.restaurantId;
  const live = useServiceLive(rid),
    client = useQueryClient(),
    mobile = useIsMobile();
  const [tab, setTab] = useState<"arrivals" | "seated">("arrivals");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [seatId, setSeatId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ["host", "arrivals", rid],
    enabled: Boolean(rid),
    staleTime: 5000,
    refetchInterval: 15000,
    queryFn: async () => {
      const [bookings, tables, orders, restaurant] = await Promise.all([
        (supabase as any)
          .from("table_bookings")
          .select("id,customer_name,guest_count,booking_at,ends_at,status,table_id,notes")
          .eq("restaurant_id", rid)
          .in("status", ["pending", "confirmed", "seated"])
          .order("booking_at")
          .limit(300),
        (supabase as any)
          .from("restaurant_tables")
          .select("id,table_number,capacity,service_status")
          .eq("restaurant_id", rid)
          .eq("is_active", true)
          .order("table_number"),
        supabase
          .from("orders")
          .select("table_id")
          .eq("restaurant_id", rid!)
          .in("status", ["new", "accepted", "preparing", "ready", "served"]),
        supabase.from("restaurants").select("timezone").eq("id", rid!).single(),
      ]);
      for (const result of [bookings, tables, orders, restaurant])
        if (result.error) throw result.error;
      const occupied = new Set((orders.data ?? []).map((order) => order.table_id));
      return {
        arrivals: bookings.data as Arrival[],
        tables: (tables.data ?? []).map((table: Seat) => ({
          ...table,
          busy: occupied.has(table.id),
        })) as Seat[],
        timezone: restaurant.data?.timezone || "UTC",
      };
    },
  });
  const timezone = query.data?.timezone || "UTC";
  const today = reservationDay(new Date(), timezone);
  const arrivals = (query.data?.arrivals ?? []).filter(
    (row) =>
      reservationDay(row.booking_at, timezone) === today &&
      (tab === "seated" ? row.status === "seated" : row.status !== "seated"),
  );
  const selected = arrivals.find((row) => row.id === selectedId) ?? null;
  const tables = query.data?.tables ?? [];
  const valid = (table: Seat, party: Arrival) =>
    !table.busy &&
    table.capacity >= party.guest_count &&
    (table.service_status === "free" ||
      (table.service_status === "reserved" && table.id === party.table_id));
  const choose = (party: Arrival) => {
    setSelectedId(party.id);
    setSeatId(null);
  };
  const seat = useMutation({
    mutationFn: async ({ partyId, tableId }: { partyId: string; tableId: string }) => {
      const party = query.data?.arrivals.find((row) => row.id === partyId),
        table = tables.find((row) => row.id === tableId);
      if (!party || !table || party.status !== "confirmed" || !valid(table, party))
        throw new Error(
          ar
            ? "الطاولة غير متاحة لهذا الحجز"
            : "This table is not available for this confirmed party",
        );
      const { error } = await (supabase as any).rpc("seat_host_party", {
        _booking_id: partyId,
        _table_id: tableId,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      setSelectedId(null);
      setSeatId(null);
      await invalidateServiceQueries(client, rid);
      toast.success(ar ? "تم إجلاس الضيوف" : "Party seated");
    },
    onError: (error) => toast.error(humanError(error, lang)),
  });
  const panel = selected ? (
    <div className="space-y-4 p-4">
      <div>
        <h3 className="text-lg font-bold">{selected.customer_name}</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {bookingTimeLabel(selected.booking_at, timezone, ar)} · {selected.guest_count}{" "}
          {ar ? "ضيوف" : "guests"} · {selected.status}
        </p>
        {selected.notes ? <p className="mt-2 text-sm">{selected.notes}</p> : null}
      </div>
      {selected.status === "confirmed" ? (
        <>
          <h4 className="text-sm font-semibold">{ar ? "اختر طاولة" : "Choose a table"}</h4>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
            {tables.map((table) => (
              <button
                key={table.id}
                type="button"
                disabled={!valid(table, selected) || seat.isPending}
                aria-pressed={seatId === table.id}
                onClick={() => setSeatId(table.id)}
                onDragOver={(event) => {
                  const party = arrivals.find((row) => row.id === dragId);
                  if (party && valid(table, party)) event.preventDefault();
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  const party = arrivals.find((row) => row.id === dragId);
                  if (party && valid(table, party)) {
                    choose(party);
                    setSeatId(table.id);
                  }
                  setDragId(null);
                }}
                className={cn(
                  "flex min-h-14 items-center justify-between gap-2 rounded-xl border p-3 text-start text-sm disabled:opacity-45",
                  seatId === table.id && "border-primary bg-primary/10 text-foreground",
                )}
              >
                <strong>T{table.table_number}</strong>
                <span>
                  {table.capacity} {ar ? "مقاعد" : "seats"}
                </span>
                <span className="text-xs text-muted-foreground">
                  {table.busy
                    ? ar
                      ? "مشغولة"
                      : "Occupied"
                    : table.capacity < selected.guest_count
                      ? ar
                        ? "صغيرة"
                        : "Too small"
                      : table.service_status}
                </span>
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <Button
              className="h-11 flex-1"
              disabled={!seatId || seat.isPending}
              onClick={() => seatId && seat.mutate({ partyId: selected.id, tableId: seatId })}
            >
              {seat.isPending
                ? ar
                  ? "جار الإجلاس…"
                  : "Seating…"
                : ar
                  ? "إجلاس الضيوف"
                  : "Seat party"}
            </Button>
            <ActionMenu
              ar={ar}
              actions={[
                {
                  label: ar ? "تفاصيل الحجز" : "Reservation details",
                  href: `/bookings?record=${selected.id}`,
                },
              ]}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {ar
              ? "يتم التحقق من السعة والتوفر قبل الإجلاس."
              : "Capacity and availability are checked again before seating."}
          </p>
        </>
      ) : (
        <Button asChild variant="outline" className="h-11 w-full">
          <Link to="/bookings" search={{ record: selected.id }}>
            {ar ? "تفاصيل الحجز" : "Reservation details"}
          </Link>
        </Button>
      )}
    </div>
  ) : null;
  return (
    <div className="min-h-dvh bg-background">
      <AppHeader title={ar ? "الاستقبال" : "Frontdesk — Host"} />
      <main className="qs-page space-y-4">
        <MasterPageHeader
          title={ar ? "الاستقبال" : "Frontdesk"}
          description={
            ar
              ? "الضيوف القادمون والطاولة المناسبة."
              : "Today's arrivals. The right table for every party."
          }
        />
        <div className="flex items-center gap-3 border-b pb-3">
          <span className="text-sm text-muted-foreground">{today}</span>
          <div className="ms-auto flex gap-2">
            {(["arrivals", "seated"] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={tab === value}
                onClick={() => {
                  setTab(value);
                  setSelectedId(null);
                }}
                className={cn(
                  "min-h-11 rounded-lg px-3 text-sm font-semibold",
                  tab === value ? "bg-primary/10 text-primary" : "text-muted-foreground",
                )}
              >
                {value === "arrivals" ? (ar ? "القادمون" : "Arrivals") : ar ? "جالسون" : "Seated"}
              </button>
            ))}
            <Button asChild variant="ghost" className="h-11">
              <Link to="/waitlist">{ar ? "الانتظار" : "Waitlist"}</Link>
            </Button>
          </div>
          <span className="hidden text-xs text-muted-foreground sm:block">
            {live ? "● Live" : "Polling"}
          </span>
        </div>
        {query.isPending ? (
          <Skeleton className="h-64" />
        ) : query.isError ? (
          <div role="alert" className="rounded-xl border p-5">
            <p className="text-destructive">{humanError(query.error, lang)}</p>
            <Button variant="outline" onClick={() => void query.refetch()}>
              {ar ? "إعادة المحاولة" : "Retry"}
            </Button>
          </div>
        ) : (
          <div
            className={cn(
              "grid items-start gap-4",
              selected && "xl:grid-cols-[minmax(0,1fr)_360px]",
            )}
          >
            <section className="overflow-hidden rounded-2xl border bg-card">
              <div className="hidden grid-cols-[44px_90px_1fr_70px_100px_32px] gap-3 border-b bg-muted/30 px-4 py-3 text-xs text-muted-foreground sm:grid">
                <span />
                <span>{ar ? "الوقت" : "Time"}</span>
                <span>{ar ? "الضيف" : "Guest"}</span>
                <span>{ar ? "العدد" : "Party"}</span>
                <span>{ar ? "الحالة" : "Status"}</span>
                <span />
              </div>
              {arrivals.map((party) => (
                <div
                  key={party.id}
                  className={cn(
                    "flex items-center gap-2 border-b p-3 last:border-b-0",
                    selectedId === party.id && "bg-primary/10 text-foreground",
                  )}
                >
                  <button
                    type="button"
                    draggable={party.status === "confirmed" && !seat.isPending}
                    onClick={() => choose(party)}
                    onDragStart={(event) => {
                      event.dataTransfer.setData("text/plain", party.id);
                      setDragId(party.id);
                      choose(party);
                    }}
                    onDragEnd={() => setDragId(null)}
                    className="hidden size-11 shrink-0 cursor-grab items-center justify-center rounded-lg text-muted-foreground sm:flex"
                    aria-label={`Select or drag ${party.customer_name}`}
                  >
                    <GripVertical className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => choose(party)}
                    className="grid min-h-14 min-w-0 flex-1 grid-cols-[70px_minmax(0,1fr)_24px] items-center gap-3 text-start sm:grid-cols-[90px_minmax(0,1fr)_70px_100px_24px]"
                  >
                    <time className="text-sm font-semibold">
                      {bookingTimeLabel(party.booking_at, timezone, ar)}
                    </time>
                    <span className="min-w-0">
                      <strong className="block truncate text-sm">{party.customer_name}</strong>
                      <span className="block text-xs text-muted-foreground sm:hidden">
                        {party.guest_count} · {party.status}
                      </span>
                    </span>
                    <span className="hidden text-sm sm:block">{party.guest_count}</span>
                    <span className="hidden text-xs capitalize sm:block">{party.status}</span>
                    <ChevronRight className="size-4 text-muted-foreground" />
                  </button>
                </div>
              ))}
              {!arrivals.length ? (
                <div className="p-10 text-center text-sm text-muted-foreground">
                  <Table2 className="mx-auto mb-3 size-7" />
                  {ar ? "لا توجد حجوزات لهذه الفترة" : "No reservations in this view"}
                </div>
              ) : null}
            </section>
            {!mobile && selected ? (
              <aside className="rounded-2xl border bg-card xl:sticky xl:top-24">
                <header className="flex items-center justify-between border-b p-4">
                  <h2 className="font-bold">{ar ? "إجلاس الضيوف" : "Seat party"}</h2>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-11"
                    aria-label="Close party"
                    onClick={() => setSelectedId(null)}
                  >
                    <X className="size-4" />
                  </Button>
                </header>
                {panel}
              </aside>
            ) : null}
          </div>
        )}
        {mobile ? (
          <DetailSheet
            open={Boolean(selected)}
            onOpenChange={(open) => {
              if (!open) setSelectedId(null);
            }}
            title={ar ? "إجلاس الضيوف" : "Seat party"}
            panelClassName="qs-task-sheet"
            bodyClassName="p-0"
          >
            {panel}
          </DetailSheet>
        ) : null}
      </main>
    </div>
  );
}

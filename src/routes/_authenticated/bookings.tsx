import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { CalendarCheck2, CalendarClock, CheckCircle2, Clock3, Plus, Trash2, UserRoundCheck, UsersRound, XCircle } from "lucide-react";
import { toast } from "sonner";

import { AppHeader } from "@/components/nav/AppHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useAccess } from "@/hooks/useSession";
import { useWorkspaceScope } from "@/hooks/useWorkspace";
import { supabase } from "@/integrations/supabase/client";
import { humanError } from "@/lib/errors";
import { useI18n } from "@/lib/i18n";
import { membershipHasCapability } from "@/lib/permissions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/bookings")({
  head: () => ({ meta: [{ title: "Table Bookings — QuickServe" }, { name: "description", content: "Manage restaurant table reservations and seating." }] }),
  component: BookingsPage,
});

type BookingStatus = "pending" | "confirmed" | "seated" | "completed" | "cancelled" | "no_show";
type Booking = {
  id: string; restaurant_id: string; table_id: string | null; customer_name: string; phone: string | null;
  guest_count: number; booking_at: string; zone: string | null; status: BookingStatus; notes: string | null; created_at: string;
};
type FloorTable = { id: string; table_number: string; table_name: string | null; zone: string; capacity: number; service_status: string };

const STATUS: BookingStatus[] = ["pending", "confirmed", "seated", "completed", "cancelled", "no_show"];

function BookingsPage() {
  const { lang } = useI18n();
  const ar = lang === "ar";
  const scope = useWorkspaceScope();
  const access = useAccess();
  const qc = useQueryClient();
  const rid = scope.restaurantId;
  const membership = rid ? access.membershipFor(rid) : null;
  const canManage = Boolean(membership && membershipHasCapability(membership.role, membership.permission_overrides, "manage_tables"));
  const [createOpen, setCreateOpen] = useState(false);

  const bookings = useQuery<Booking[]>({
    queryKey: ["bookings", rid],
    enabled: Boolean(rid && canManage),
    staleTime: 8_000,
    refetchInterval: 30_000,
    queryFn: async () => {
      const from = (supabase as any).from("table_bookings");
      const { data, error } = await from.select("id,restaurant_id,table_id,customer_name,phone,guest_count,booking_at,zone,status,notes,created_at").eq("restaurant_id", rid).order("booking_at", { ascending: true }).limit(300);
      if (error) throw error;
      return (data ?? []) as Booking[];
    },
  });
  const tables = useQuery<FloorTable[]>({
    queryKey: ["bookings", "tables", rid],
    enabled: Boolean(rid && canManage),
    queryFn: async () => {
      const { data, error } = await (supabase.from("restaurant_tables") as any).select("id,table_number,table_name,zone,capacity,service_status").eq("restaurant_id", rid).eq("is_active", true).order("table_number");
      if (error) throw error;
      return (data ?? []) as FloorTable[];
    },
  });

  useEffect(() => {
    if (!rid || !canManage) return;
    const refresh = () => {
      void qc.invalidateQueries({ queryKey: ["bookings", rid] });
      void qc.invalidateQueries({ queryKey: ["bookings", "tables", rid] });
    };
    const channel = supabase.channel(`bookings:${rid}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "table_bookings", filter: `restaurant_id=eq.${rid}` }, refresh)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "restaurant_tables", filter: `restaurant_id=eq.${rid}` }, refresh)
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [canManage, qc, rid]);

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: BookingStatus }) => {
      const { error } = await (supabase as any).from("table_bookings").update({ status }).eq("id", id).eq("restaurant_id", rid);
      if (error) throw error;
    },
    onSuccess: async () => {
      await Promise.all([qc.invalidateQueries({ queryKey: ["bookings", rid] }), qc.invalidateQueries({ queryKey: ["bookings", "tables", rid] })]);
      toast.success(ar ? "تم تحديث الحجز" : "Booking updated");
    },
    onError: (error) => toast.error(humanError(error, lang)),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("table_bookings").delete().eq("id", id).eq("restaurant_id", rid);
      if (error) throw error;
    },
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ["bookings", rid] }); toast.success(ar ? "تم حذف الحجز" : "Booking deleted"); },
    onError: (error) => toast.error(humanError(error, lang)),
  });

  if (scope.isPending || access.isPending) return <div className="min-h-dvh bg-background"><AppHeader /><main className="qs-page"><Skeleton className="h-[560px] rounded-3xl" /></main></div>;
  if (!rid || !membership || !canManage) return <div className="min-h-dvh bg-background"><AppHeader /><main className="qs-page"><section className="qs-card p-10 text-center"><h1 className="font-display text-xl font-bold">{ar ? "الحجوزات غير متاحة لهذا الحساب" : "Bookings are not available for this account"}</h1><p className="mt-2 text-sm text-muted-foreground">{ar ? "يحتاج الحساب إلى صلاحية إدارة الطاولات." : "Table-management access is required."}</p></section></main></div>;

  const now = Date.now();
  const rows = bookings.data ?? [];
  const active = rows.filter((row) => !["completed", "cancelled", "no_show"].includes(row.status));
  const today = active.filter((row) => new Date(row.booking_at).toDateString() === new Date().toDateString());
  const seated = active.filter((row) => row.status === "seated").length;
  const upcoming = active.filter((row) => new Date(row.booking_at).getTime() >= now).length;

  return <div className="min-h-dvh bg-background">
    <AppHeader title={ar ? "الحجوزات" : "Bookings"} />
    <main className="qs-page space-y-5">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div><span className="inline-flex items-center gap-2 rounded-full bg-orange-500/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[.14em] text-[#ff5a0a]"><CalendarCheck2 className="size-3.5" />{ar ? "إدارة الحجوزات" : "Reservation desk"}</span><h1 className="qs-page-title mt-3">{ar ? "الحجوزات والجلوس" : "Bookings & seating"}</h1><p className="qs-page-subtitle max-w-2xl">{ar ? "نسّق الحجوزات، خصص الطاولات، وانقل الضيف من الحجز إلى الجلوس بدون فقدان حالة الطاولة." : "Coordinate reservations, assign tables, and move guests from booking to seating without losing floor status."}</p></div>
        <Button onClick={() => setCreateOpen(true)} className="gap-2"><Plus className="size-4" />{ar ? "حجز جديد" : "New booking"}</Button>
      </header>

      <section className="grid gap-3 sm:grid-cols-3">
        <Metric icon={CalendarClock} label={ar ? "حجوزات اليوم" : "Today"} value={today.length} />
        <Metric icon={Clock3} label={ar ? "القادمة" : "Upcoming"} value={upcoming} />
        <Metric icon={UserRoundCheck} label={ar ? "تم الجلوس" : "Seated"} value={seated} />
      </section>

      <section className="qs-card overflow-hidden">
        <div className="border-b border-border p-5"><h2 className="qs-section-title">{ar ? "جدول الحجوزات" : "Booking schedule"}</h2><p className="mt-1 text-xs text-muted-foreground">{ar ? "التأكيد يحجز الطاولة، والجلوس يحولها تلقائياً إلى نشطة." : "Confirming reserves the table; seating automatically moves it to Active."}</p></div>
        {bookings.isPending || tables.isPending ? <div className="p-5"><Skeleton className="h-72 rounded-2xl" /></div> : bookings.isError ? <p className="p-6 text-sm text-destructive">{humanError(bookings.error, lang)}</p> : !rows.length ? <div className="p-12 text-center"><CalendarCheck2 className="mx-auto size-8 text-muted-foreground" /><h3 className="mt-3 font-bold">{ar ? "لا توجد حجوزات بعد" : "No bookings yet"}</h3><p className="mt-1 text-xs text-muted-foreground">{ar ? "أنشئ أول حجز وحدد الطاولة والموعد." : "Create the first booking and assign a table and time."}</p></div> : <div className="divide-y divide-border">{rows.map((booking) => <BookingRow key={booking.id} booking={booking} table={(tables.data ?? []).find((row) => row.id === booking.table_id) ?? null} ar={ar} busy={setStatus.isPending || remove.isPending} onStatus={(status) => setStatus.mutate({ id: booking.id, status })} onDelete={() => remove.mutate(booking.id)} />)}</div>}
      </section>
    </main>
    <CreateBookingDialog open={createOpen} onOpenChange={setCreateOpen} restaurantId={rid} tables={tables.data ?? []} ar={ar} lang={lang} />
  </div>;
}

function CreateBookingDialog({ open, onOpenChange, restaurantId, tables, ar, lang }: { open: boolean; onOpenChange: (open: boolean) => void; restaurantId: string; tables: FloorTable[]; ar: boolean; lang: "ar" | "en" }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const defaultDate = useMemo(() => {
    const d = new Date(Date.now() + 60 * 60_000);
    d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0);
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
    return local.toISOString().slice(0, 16);
  }, [open]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const tableId = String(form.get("table_id") ?? "") || null;
    const table = tables.find((row) => row.id === tableId) ?? null;
    setBusy(true);
    try {
      const rawDate = String(form.get("booking_at") ?? "");
      const bookingAt = new Date(rawDate);
      if (Number.isNaN(bookingAt.getTime())) throw new Error(ar ? "اختر موعداً صحيحاً" : "Choose a valid booking time");
      const { error } = await (supabase as any).from("table_bookings").insert({
        restaurant_id: restaurantId,
        table_id: tableId,
        customer_name: String(form.get("customer_name") ?? "").trim(),
        phone: String(form.get("phone") ?? "").trim() || null,
        guest_count: Number(form.get("guest_count") ?? 2),
        booking_at: bookingAt.toISOString(),
        zone: table?.zone ?? null,
        status: String(form.get("status") ?? "pending"),
        notes: String(form.get("notes") ?? "").trim() || null,
      });
      if (error) throw error;
      await Promise.all([qc.invalidateQueries({ queryKey: ["bookings", restaurantId] }), qc.invalidateQueries({ queryKey: ["bookings", "tables", restaurantId] })]);
      toast.success(ar ? "تم إنشاء الحجز" : "Booking created");
      onOpenChange(false);
    } catch (error) { toast.error(humanError(error, lang)); } finally { setBusy(false); }
  }

  return <Dialog open={open} onOpenChange={(value) => !busy && onOpenChange(value)}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl"><DialogHeader><DialogTitle>{ar ? "حجز طاولة جديد" : "New table booking"}</DialogTitle><DialogDescription>{ar ? "أضف بيانات الضيف واختر الموعد والطاولة." : "Add guest details, time and an optional preferred table."}</DialogDescription></DialogHeader><form onSubmit={submit} className="space-y-4">
    <div className="grid gap-4 sm:grid-cols-2"><Field label={ar ? "اسم الضيف" : "Guest name"}><Input name="customer_name" required maxLength={120} /></Field><Field label={ar ? "الهاتف" : "Phone"}><Input name="phone" inputMode="tel" maxLength={40} /></Field></div>
    <div className="grid gap-4 sm:grid-cols-2"><Field label={ar ? "عدد الضيوف" : "Guests"}><Input name="guest_count" type="number" min="1" max="100" defaultValue="2" required /></Field><Field label={ar ? "التاريخ والوقت" : "Date & time"}><Input name="booking_at" type="datetime-local" defaultValue={defaultDate} required /></Field></div>
    <div className="grid gap-4 sm:grid-cols-2"><Field label={ar ? "الطاولة" : "Preferred table"}><Select name="table_id"><SelectTrigger><SelectValue placeholder={ar ? "اختر طاولة" : "Choose table"} /></SelectTrigger><SelectContent>{tables.map((table) => <SelectItem key={table.id} value={table.id} disabled={table.service_status === "out_of_service"}>{table.table_name ?? `#${table.table_number}`} · {table.capacity} · {statusLabel(table.service_status, ar)}</SelectItem>)}</SelectContent></Select></Field><Field label={ar ? "الحالة" : "Status"}><Select name="status" defaultValue="pending"><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="pending">{statusLabel("pending", ar)}</SelectItem><SelectItem value="confirmed">{statusLabel("confirmed", ar)}</SelectItem></SelectContent></Select></Field></div>
    <Field label={ar ? "ملاحظات" : "Notes"}><Textarea name="notes" maxLength={500} /></Field>
    <DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>{ar ? "إلغاء" : "Cancel"}</Button><Button type="submit" disabled={busy}>{busy ? (ar ? "جارٍ الحفظ…" : "Saving…") : (ar ? "إنشاء الحجز" : "Create booking")}</Button></DialogFooter>
  </form></DialogContent></Dialog>;
}

function BookingRow({ booking, table, ar, busy, onStatus, onDelete }: { booking: Booking; table: FloorTable | null; ar: boolean; busy: boolean; onStatus: (status: BookingStatus) => void; onDelete: () => void }) {
  const date = new Intl.DateTimeFormat(ar ? "ar-JO" : "en-JO", { dateStyle: "medium", timeStyle: "short" }).format(new Date(booking.booking_at));
  return <article className="grid gap-4 p-4 sm:p-5 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-bold">{booking.customer_name}</h3><Badge variant={booking.status === "seated" ? "default" : booking.status === "cancelled" || booking.status === "no_show" ? "destructive" : "secondary"}>{statusLabel(booking.status, ar)}</Badge></div><div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground"><span>{date}</span><span className="inline-flex items-center gap-1"><UsersRound className="size-3.5" />{booking.guest_count}</span><span>{table ? (table.table_name ?? `#${table.table_number}`) : (ar ? "بدون طاولة" : "No table")}</span>{booking.phone ? <span>{booking.phone}</span> : null}</div>{booking.notes ? <p className="mt-2 text-xs leading-5 text-muted-foreground">{booking.notes}</p> : null}</div><div className="flex flex-wrap gap-2 xl:justify-end">
    {booking.status === "pending" ? <Button size="sm" disabled={busy} onClick={() => onStatus("confirmed")}><CheckCircle2 className="size-4" />{ar ? "تأكيد" : "Confirm"}</Button> : null}
    {booking.status === "confirmed" ? <Button size="sm" disabled={busy} onClick={() => onStatus("seated")}><UserRoundCheck className="size-4" />{ar ? "تم الجلوس" : "Seat guests"}</Button> : null}
    {booking.status === "seated" ? <Button size="sm" variant="outline" disabled={busy} onClick={() => onStatus("completed")}><CheckCircle2 className="size-4" />{ar ? "اكتمال الحجز" : "Complete booking"}</Button> : null}
    {booking.status === "pending" || booking.status === "confirmed" ? <Button size="sm" variant="ghost" disabled={busy} onClick={() => onStatus("cancelled")}><XCircle className="size-4" />{ar ? "إلغاء" : "Cancel"}</Button> : null}
    <Button size="icon" variant="ghost" className="size-9 text-muted-foreground hover:text-destructive" disabled={busy || booking.status === "seated"} onClick={onDelete} aria-label={ar ? "حذف الحجز" : "Delete booking"}><Trash2 className="size-4" /></Button>
  </div></article>;
}

function Metric({ icon: Icon, label, value }: { icon: typeof CalendarCheck2; label: string; value: number }) { return <article className="qs-stat flex min-h-[108px] items-center gap-4 p-4"><span className="grid size-11 place-items-center rounded-2xl bg-orange-500/10 text-[#ff5a0a]"><Icon className="size-5" /></span><div><p className="text-[11px] font-semibold text-muted-foreground">{label}</p><strong className="mt-1 block font-display text-3xl tracking-[-.04em]">{value}</strong></div></article>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div className="space-y-1.5"><Label className="text-xs font-bold">{label}</Label>{children}</div>; }
function statusLabel(status: string, ar: boolean) {
  const labels: Record<string, [string, string]> = {
    pending: ["Pending", "قيد الانتظار"], confirmed: ["Confirmed", "مؤكد"], seated: ["Seated", "تم الجلوس"], completed: ["Completed", "مكتمل"], cancelled: ["Cancelled", "ملغي"], no_show: ["No-show", "لم يحضر"],
    free: ["Free", "متاحة"], reserved: ["Reserved", "محجوزة"], active: ["Active", "نشطة"], cleaning: ["Cleaning", "تنظيف"], out_of_service: ["Out of service", "خارج الخدمة"],
  };
  return labels[status]?.[ar ? 1 : 0] ?? status;
}

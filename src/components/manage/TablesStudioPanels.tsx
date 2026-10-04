import { Table2, Users } from "@/components/nav/QuickServeIcons";
import { useEffect, useState } from "react";
import { Clock3, Download, Pencil, Printer, QrCode, Search} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
export type StudioTable = {
  id: string;
  table_number: string;
  table_name: string | null;
  capacity?: number | null;
  zone?: string | null;
  service_status?: string | null;
  activated_at?: string | null;
  status_updated_at?: string | null;
  status_updated_by?: string | null;
  is_active: boolean;
};
const statusNames: Record<string, [string, string]> = {
  free: ["Free", "متاحة"],
  active: ["Occupied", "مشغولة"],
  reserved: ["Reserved", "محجوزة"],
  cleaning: ["Cleaning", "تنظيف"],
  out_of_service: ["Out of service", "خارج الخدمة"],
};
export function TableStatusBadge({ row, ar }: { row: StudioTable; ar: boolean }) {
  const status = row.is_active ? (row.service_status ?? "free") : "out_of_service";
  return (
    <span className={`qs-studio-status is-${status}`}>
      <i />
      {statusNames[status]?.[ar ? 1 : 0] ?? status}
    </span>
  );
}
export function tableServiceText(row: StudioTable, ar: boolean, now = Date.now()) {
  const start = Date.parse(row.activated_at ?? "");
  return row.service_status === "active" && Number.isFinite(start)
    ? `${Math.max(0, Math.floor((now - start) / 60000))} ${ar ? "دقيقة" : "min"}`
    : row.service_status === "free"
      ? ar
        ? "جاهزة للضيوف"
        : "Ready for guests"
      : "—";
}
export function TablesStudioList({
  rows,
  ar,
  zoneName,
  selectedId,
  onSelect,
  onEdit,
  onQr,
  onPrint,
}: {
  rows: StudioTable[];
  ar: boolean;
  zoneName: (row: StudioTable) => string;
  selectedId: string | null;
  onSelect: (row: StudioTable) => void;
  onEdit: (row: StudioTable) => void;
  onQr: (row: StudioTable, trigger: HTMLButtonElement) => void;
  onPrint: () => void;
}) {
  const [search, setSearch] = useState(""),
    [status, setStatus] = useState("all"),
    [page, setPage] = useState(0),
    [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(id);
  }, []);
  const filtered = rows.filter(
    (row) =>
      (status === "all" ||
        (row.is_active ? (row.service_status ?? "free") : "out_of_service") === status) &&
      [row.table_number, row.table_name, zoneName(row)].some((text) =>
        text?.toLowerCase().includes(search.trim().toLowerCase()),
      ),
  );
  const pages = Math.max(1, Math.ceil(filtered.length / 6)),
    current = Math.min(page, pages - 1),
    shown = filtered.slice(current * 6, current * 6 + 6);
  useEffect(() => setPage(0), [search, status, rows]);
  return (
    <section className="qs-studio-table-list">
      <div className="flex items-center justify-between gap-3 p-4">
        <h2 className="text-lg font-bold">{ar ? "قائمة الطاولات" : "Table list"}</h2>
        <Button type="button" variant="outline" onClick={onPrint}>
          <Printer className="size-4" />
          {ar ? "طباعة رموز QR" : "Print QR codes"}
        </Button>
      </div>
      <div className="qs-table-list-filters">
        <div className="relative">
          <Search className="absolute start-3 top-3 size-4 text-muted-foreground" />
          <Input
            className="ps-10"
            placeholder={ar ? "ابحث عن طاولة..." : "Find a table..."}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          aria-label={ar ? "حالة الطاولة" : "Table status filter"}
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="all">{ar ? "كل الحالات" : "All statuses"}</option>
          {Object.entries(statusNames).map(([value, name]) => (
            <option key={value} value={value}>
              {name[ar ? 1 : 0]}
            </option>
          ))}
        </select>
      </div>
      <div className="qs-studio-table-scroll">
        <table>
          <thead>
            <tr>
              {[
                ar ? "الطاولة" : "Table",
                ar ? "المنطقة" : "Zone",
                ar ? "المقاعد" : "Seats",
                ar ? "الحالة" : "Status",
                ar ? "الخدمة" : "Service",
                ar ? "الإجراءات" : "Actions",
              ].map((label) => (
                <th key={label}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((row) => (
              <tr key={row.id} className={selectedId === row.id ? "is-selected" : ""}>
                <td>
                  <button type="button" className="qs-table-row-name" onClick={() => onSelect(row)}>
                    <Table2 className="size-5" />
                    {row.table_number}
                  </button>
                </td>
                <td>{zoneName(row)}</td>
                <td>
                  {row.capacity ?? 4} {ar ? "مقاعد" : "seats"}
                </td>
                <td>
                  <TableStatusBadge row={row} ar={ar} />
                </td>
                <td>{tableServiceText(row, ar, now)}</td>
                <td>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="qs-table-icon-action"
                      aria-label={`${ar ? "رمز QR" : "Show QR"} ${row.table_number}`}
                      aria-haspopup="dialog"
                      onClick={(event) => onQr(row, event.currentTarget)}
                    >
                      <QrCode />
                    </button>
                    <button
                      type="button"
                      className="qs-table-icon-action"
                      aria-label={`${ar ? "تعديل" : "Edit"} ${row.table_number}`}
                      onClick={() => onEdit(row)}
                    >
                      <Pencil />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!shown.length && (
        <p className="p-10 text-center text-sm text-muted-foreground">
          {ar ? "لا توجد طاولات مطابقة" : "No matching tables"}
        </p>
      )}
      <div className="qs-table-list-footer">
        <span>
          {ar
            ? `عرض ${filtered.length ? current * 6 + 1 : 0}–${Math.min((current + 1) * 6, filtered.length)} من ${filtered.length}`
            : `Showing ${filtered.length ? current * 6 + 1 : 0}–${Math.min((current + 1) * 6, filtered.length)} of ${filtered.length} tables`}
        </span>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={current === 0}
            onClick={() => setPage(current - 1)}
          >
            {ar ? "السابق" : "Previous"}
          </Button>
          <span className="grid min-w-9 place-items-center rounded-lg bg-primary/10 text-primary">
            {current + 1}
          </span>
          <Button
            type="button"
            variant="outline"
            disabled={current >= pages - 1}
            onClick={() => setPage(current + 1)}
          >
            {ar ? "التالي" : "Next"}
          </Button>
        </div>
      </div>
    </section>
  );
}
export function TableQuickPanel({
  row,
  zone,
  ar,
  qr,
  menuUrl,
  busy,
  onEdit,
  onDownload,
  onPrint,
  onStatus,
}: {
  row: StudioTable;
  zone: string;
  ar: boolean;
  qr: string | null;
  menuUrl: string;
  busy: boolean;
  onEdit: () => void;
  onDownload: () => void;
  onPrint: () => void;
  onStatus: (value: string) => void;
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 10000);
    return () => clearInterval(timer);
  }, []);
  const manualHold = Boolean(row.status_updated_by) && row.service_status !== "free";
  const cleaningMinutes = Math.max(0, Math.ceil((Date.parse(row.status_updated_at ?? "") + 600000 - now) / 60000));
  return (
    <div className="qs-table-quick-panel">
      <h2 className="text-xl font-bold">
        {ar ? "طاولة" : "Table"} {row.table_number}
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        {zone} · {row.capacity ?? 4} {ar ? "مقاعد" : "seats"}
      </p>
      <div className="my-3">
        <TableStatusBadge row={row} ar={ar} />
      </div>
      <div className="qs-quick-service">
        <Users className="size-4" />
        <span>
          {row.capacity ?? 4} {ar ? "مقاعد" : "seats"}
        </span>
        <Clock3 className="size-4" />
        <span>{tableServiceText(row, ar, now)}</span>
      </div>
      <h3 className="mt-5 text-sm font-bold">{ar ? "رمز قائمة الضيف" : "Guest menu QR"}</h3>
      <div className="qs-table-qr-preview">
        {qr ? (
          <img src={qr} alt={ar ? "رمز قائمة الطاولة" : "Table menu QR code"} />
        ) : (
          <span className="text-xs">{ar ? "جارٍ إنشاء الرمز..." : "Generating QR..."}</span>
        )}
        <p>{ar ? "امسح لفتح القائمة" : "Scan to open the menu"}</p>
        <a href={menuUrl} target="_blank" rel="noreferrer">
          {ar ? "معاينة القائمة" : "Preview menu"}
        </a>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="outline" disabled={!qr} onClick={onDownload}>
          <Download className="size-4" />
          {ar ? "تنزيل QR" : "Download QR"}
        </Button>
        <Button type="button" variant="outline" disabled={!qr} onClick={onPrint}>
          <Printer className="size-4" />
          {ar ? "طباعة QR" : "Print QR"}
        </Button>
      </div>
      <label className="mt-5 block border-t pt-4 text-xs font-bold">
        {ar ? "حالة الطاولة" : "Table status"}
        <select
          className="mt-2 w-full"
          disabled={busy || !row.is_active}
          value={row.service_status ?? "free"}
          onChange={(e) => onStatus(e.target.value === "cleaning" ? "cleaning_auto" : e.target.value)}
        >
          {Object.entries(statusNames).map(([value, name]) => (
            <option key={value} value={value}>
              {name[ar ? 1 : 0]}
            </option>
          ))}
        </select>
      </label>
      <div className="mt-3 min-w-0 rounded-2xl border bg-muted/30 p-3">
        <p className="text-sm font-semibold">{manualHold ? (ar ? "تحكم يدوي" : "Manual hold") : (ar ? "الحالة التلقائية مفعلة" : "Automatic status on")}</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          {row.service_status === "out_of_service" ? (ar ? "تبقى خارج الخدمة حتى تعيد تفعيلها." : "Blocked until you restore the table.")
            : row.service_status === "cleaning" ? manualHold
              ? (ar ? "التنظيف ينتظر تأكيد الموظف." : "Cleaning waits for staff confirmation.")
              : (ar ? `جاهزة تلقائياً خلال ${Number.isFinite(cleaningMinutes) ? cleaningMinutes : 10} دقائق. أكد الجاهزية أو أوقف المؤقت إذا احتجت وقتاً أطول.` : `Auto-ready in ${Number.isFinite(cleaningMinutes) ? cleaningMinutes : 10} min. Confirm sooner or pause if more time is needed.`)
            : row.service_status === "active" && manualHold ? (ar ? "تبقى مشغولة حتى المغادرة أو إغلاق آخر طلب. العودة للتلقائي تبدأ التنظيف إذا لم توجد طلبات." : "Stays occupied until departure or final order closes. Returning to automatic starts cleaning when no orders remain.")
            : manualHold ? (ar ? "الحجز اليدوي يبقى حتى تحريره؛ الإشغال يتابع الطلبات والمغادرة تلقائياً." : "Manual reservations stay until released. Occupancy follows orders and departure automatically.")
            : (ar ? "حجز قريب ← محجوزة · وصول الضيف أو طلب ← مشغولة · آخر مغادرة ← تنظيف ← جاهزة." : "Upcoming booking → Reserved · Seated guest or order → Occupied · Final departure → Cleaning → Ready.")}
        </p>
        {manualHold ? <Button type="button" variant="outline" className="mt-3 min-h-11 w-full whitespace-normal" disabled={busy || !row.is_active} onClick={() => onStatus("automatic")}>{ar ? "العودة للحالة التلقائية" : "Return to automatic"}</Button> : null}
      </div>
      {row.is_active && row.service_status === "cleaning" ? <div className="mt-3 grid gap-2">
        <Button type="button" className="min-h-11 w-full" disabled={busy} onClick={() => onStatus("free")}>{ar ? "تم التنظيف · جاهزة" : "Cleaning done · Ready"}</Button>
        {!manualHold ? <Button type="button" variant="outline" className="min-h-11 w-full whitespace-normal" disabled={busy} onClick={() => onStatus("cleaning")}>{ar ? "إيقاف المؤقت · انتظار التأكيد" : "Pause timer · Wait for staff"}</Button> : null}
      </div> : null}
      <a className="qs-button-secondary mt-3 w-full" href="/orders">
        {ar ? "عرض الطلبات" : "View orders"}
      </a>
      <Button type="button" variant="ghost" className="mt-2 w-full text-primary" onClick={onEdit}>
        <Pencil className="size-4" />
        {ar ? "تعديل الطاولة" : "Edit table"}
      </Button>
    </div>
  );
}

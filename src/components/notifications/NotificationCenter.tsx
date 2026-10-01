import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Bell,
  CheckCheck,
  ClipboardList,
  Info,
  Search,
  ShieldCheck,
  TimerReset,
  UsersRound,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  filterNotifications,
  notificationDayKey,
  notificationHref,
  type NotificationFilter,
  type NotificationKind,
  type NotificationRow,
} from "@/lib/notification-feed";
import "./notification-center.css";

const FILTERS = [
  ["all", "All", "الكل"],
  ["unread", "Unread", "غير مقروء"],
  ["orders", "Orders", "الطلبات"],
  ["reservations", "Reservations", "الحجوزات"],
  ["team", "Team", "الفريق"],
  ["approvals", "Approvals", "الموافقات"],
  ["system", "System", "النظام"],
  ["finance", "Finance", "المالية"],
] as const;
export function NotificationCenter({
  rows,
  ar,
  timezone = "Asia/Amman",
  pending,
  error,
  busy,
  onRead,
  onRetry,
}: {
  rows: NotificationRow[];
  ar: boolean;
  timezone?: string;
  pending: boolean;
  error?: string | undefined;
  busy: boolean;
  onRead: (ids: string[]) => void;
  onRetry: () => void;
}) {
  const [filter, setFilter] = useState<NotificationFilter>("all");
  const [search, setSearch] = useState("");
  const unread = rows.filter((row) => !row.read_at);
  const filtered = filterNotifications(rows, filter, search);
  const today = notificationDayKey(new Date().toISOString(), timezone);
  const groups = [
    {
      label: ar ? "اليوم" : "Today",
      rows: filtered.filter((row) => notificationDayKey(row.created_at, timezone) === today),
    },
    {
      label: ar ? "سابقاً" : "Earlier",
      rows: filtered.filter((row) => notificationDayKey(row.created_at, timezone) !== today),
    },
  ];
  const metrics = [
    { label: ar ? "غير مقروء" : "Unread", count: unread.length, icon: Bell, tone: "orange" },
    {
      label: ar ? "موافقات" : "Approvals",
      count: unread.filter((row) => row.kind === "approval").length,
      icon: ShieldCheck,
      tone: "orange",
    },
    {
      label: ar ? "تسليم ورديات" : "Handovers",
      count: unread.filter((row) => row.kind === "handover").length,
      icon: UsersRound,
      tone: "blue",
    },
    {
      label: ar ? "تنبيهات" : "Alerts",
      count: unread.filter((row) => row.kind === "alert").length,
      icon: Info,
      tone: "red",
    },
  ];
  return (
    <div className="nc-studio" dir={ar ? "rtl" : "ltr"}>
      <header className="nc-heading">
        <div>
          <h1>{ar ? "الإشعارات" : "Notifications"}</h1>
          <p>{ar ? "تابع آخر مستجدات مساحة عملك." : "Stay on top of your workspace."}</p>
        </div>
        <Button
          className="nc-primary"
          disabled={busy || pending || !unread.length}
          onClick={() => onRead(unread.map((row) => row.id))}
        >
          <CheckCheck className="size-4" />
          {ar ? "قراءة الكل" : "Mark all read"}
        </Button>
      </header>
      <section className="nc-summary" aria-label={ar ? "ملخص الإشعارات" : "Notification summary"}>
        {metrics.map((metric) => (
          <div key={metric.label} className={`nc-metric is-${metric.tone}`}>
            <metric.icon />
            <span>
              <small>{metric.label}</small>
              <strong>{pending ? "—" : metric.count}</strong>
            </span>
          </div>
        ))}
      </section>
      <section className="nc-inbox" aria-label={ar ? "صندوق الإشعارات" : "Notification inbox"}>
        <div className="nc-tools">
          <label className="nc-search">
            <Search aria-hidden="true" />
            <input
              aria-label={ar ? "بحث في الإشعارات" : "Search notifications"}
              placeholder={ar ? "بحث في الإشعارات…" : "Search notifications…"}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            {search ? (
              <button
                type="button"
                aria-label={ar ? "مسح البحث" : "Clear notification search"}
                onClick={() => setSearch("")}
              >
                <X />
              </button>
            ) : null}
          </label>
          <nav className="nc-filters" aria-label={ar ? "تصنيف الإشعارات" : "Notification filters"}>
            {FILTERS.map(([value, en, arabic]) => (
              <button
                type="button"
                key={value}
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
              >
                {ar ? arabic : en}
              </button>
            ))}
          </nav>
        </div>
        {pending ? (
          <div className="nc-empty">
            <Skeleton className="h-48 w-full rounded-xl" />
          </div>
        ) : error ? (
          <div className="nc-empty">
            <Info />
            <h2>{ar ? "تعذر تحميل الإشعارات" : "Could not load notifications"}</h2>
            <p>{error}</p>
            <Button variant="outline" onClick={onRetry}>
              {ar ? "إعادة المحاولة" : "Try again"}
            </Button>
          </div>
        ) : !filtered.length ? (
          <div className="nc-empty">
            <Bell />
            <h2>
              {rows.length
                ? ar
                  ? "لا توجد نتائج"
                  : "No matching notifications"
                : ar
                  ? "صندوقك هادئ"
                  : "Your inbox is clear"}
            </h2>
            <p>
              {rows.length
                ? ar
                  ? "جرّب بحثاً أو تصنيفاً آخر."
                  : "Try another search or filter."
                : ar
                  ? "ستظهر التنبيهات الجديدة هنا."
                  : "New notifications will appear here."}
            </p>
            {rows.length ? (
              <Button
                variant="outline"
                onClick={() => {
                  setSearch("");
                  setFilter("all");
                }}
              >
                {ar ? "إعادة ضبط البحث" : "Reset filters"}
              </Button>
            ) : null}
          </div>
        ) : (
          groups.map((group) =>
            group.rows.length ? (
              <section className="nc-group" key={group.label}>
                <h2>{group.label}</h2>
                {group.rows.map((row) => (
                  <NotificationItem
                    key={row.id}
                    row={row}
                    ar={ar}
                    timezone={timezone}
                    busy={busy}
                    onRead={() => onRead([row.id])}
                  />
                ))}
              </section>
            ) : null,
          )
        )}
      </section>
    </div>
  );
}
function NotificationItem({
  row,
  ar,
  timezone,
  busy,
  onRead,
}: {
  row: NotificationRow;
  ar: boolean;
  timezone: string;
  busy: boolean;
  onRead: () => void;
}) {
  const config = kindConfig(row.kind, ar);
  const Icon = config.icon;
  const timestamp = new Date(row.created_at);
  const time = Number.isNaN(timestamp.getTime())
    ? ""
    : new Intl.DateTimeFormat(ar ? "ar-JO" : "en-JO", {
        timeZone: timezone,
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }).format(timestamp);
  return (
    <article className={`nc-row ${!row.read_at ? "is-unread" : ""}`}>
      <div className="nc-row-icon">
        <Icon className={config.tone} />
        {!row.read_at ? <span aria-label={ar ? "غير مقروء" : "Unread notification"} /> : null}
      </div>
      <div className="nc-row-copy">
        <div className="nc-row-title">
          <h3>{row.title}</h3>
          <span className={`nc-kind ${config.tone}`}>{config.label}</span>
          <time dateTime={row.created_at}>{time}</time>
        </div>
        {row.body ? <p>{row.body}</p> : null}
      </div>
      <div className="nc-row-actions">
        <Button asChild className="nc-primary">
          <Link to={notificationHref(row) as never}>{ar ? "فتح" : "Open"}</Link>
        </Button>
        {!row.read_at ? (
          <Button variant="outline" disabled={busy} onClick={onRead}>
            {ar ? "تمت القراءة" : "Mark read"}
          </Button>
        ) : (
          <span className="nc-read">
            <CheckCheck />
            {ar ? "مقروء" : "Read"}
          </span>
        )}
      </div>
    </article>
  );
}
function kindConfig(kind: NotificationKind, ar: boolean) {
  if (kind === "approval")
    return { icon: ShieldCheck, label: ar ? "موافقة" : "Approval", tone: "is-orange" };
  if (kind === "handover")
    return { icon: UsersRound, label: ar ? "تسليم" : "Handover", tone: "is-blue" };
  if (kind === "shift") return { icon: TimerReset, label: ar ? "وردية" : "Shift", tone: "is-blue" };
  if (kind === "alert") return { icon: Info, label: ar ? "تنبيه" : "Alert", tone: "is-red" };
  if (kind === "task")
    return { icon: ClipboardList, label: ar ? "مهمة" : "Task", tone: "is-orange" };
  return { icon: Info, label: ar ? "نظام" : "System", tone: "is-muted" };
}

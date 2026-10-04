import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import type { CSSProperties } from "react";
import { defaultHomeLayout, type HomeLayout, type HomeSectionId } from "@/lib/home-layout";
import type { Language } from "@/lib/i18n";
import { formatMoney } from "@/lib/format";
import "./home-overview.css";
import { HOME_PERIODS, type HomePeriod } from "@/lib/home-period";

export type HomeOverviewProps = {
  name: string;
  lang: Language;
  currency: string;
  restaurantId: string | null;
  now?: Date;
  timeZone?: string;
  sales: string;
  salesHint: string;
  orders: {
    id: string;
    order_number: string;
    status: string;
    total: number;
    table: { table_number: string } | null;
  }[];
  orderTotal: string;
  orderHint: string;
  tables: string;
  tableHint: string;
  team: string;
  teamHint: string;
  bookings: {
    id: string;
    booking_at: string;
    customer_name: string;
    guest_count: number;
    table?: { table_number: string } | null;
  }[];
  bookingTotal: string;
  bookingState?: string | undefined;
  orderState?: string | undefined;
  lowStock: string;
  pendingRequests: string;
  readyOrders: string;
  canStaff: boolean;
  canInventory: boolean;
  canMenu: boolean;
  canAnalytics: boolean;
  layout?: HomeLayout;
  onCustomize?: (() => void) | undefined;
  period?: HomePeriod;
  onPeriodChange?: (period: HomePeriod) => void;
  periodHint?: string;
};

export function HomeOverview(p: HomeOverviewProps) {
  const ar = p.lang === "ar";
  const t = (en: string, arabic: string) => (ar ? arabic : en);
  const now = p.now ?? new Date();
  const timeZone = p.timeZone ?? "Asia/Amman";
  const hour = Number(
    new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone }).format(now),
  );
  const greeting =
    hour < 12
      ? t("Good morning", "صباح الخير")
      : hour < 18
        ? t("Good afternoon", "مساء الخير")
        : t("Good evening", "مساء الخير");
  const path = (page: string) =>
    p.restaurantId ? `/manage/${p.restaurantId}${page}` : "/dashboard";
  const more = (to: string, label: string, hash = "") => (
    <Link to={to as never} hash={hash} className="qs-home-link">
      {label}
      <ArrowRight aria-hidden="true" />
    </Link>
  );
  const metrics = [
    {
      label: t("Sales", "المبيعات"),
      value: p.sales,
      hint: p.salesHint,
      accent: true,
      to: "/dashboard/sales",
    },
    {
      label: t("Orders", "الطلبات"),
      value: p.orderTotal,
      hint: p.orderHint,
      to: path("/orders"),
    },
    { label: t("Tables", "الطاولات"), value: p.tables, hint: p.tableHint, to: path("/tables") },
    ...(p.canStaff
      ? [{ label: t("Team", "الفريق"), value: p.team, hint: p.teamHint, to: path("/staff") }]
      : []),
  ];
  const status = (value: string) =>
    ({
      new: t("New", "جديد"),
      accepted: t("Accepted", "مقبول"),
      preparing: t("Preparing", "قيد التحضير"),
      ready: t("Ready", "جاهز"),
    })[value] ?? value;
  const layout = p.layout ?? defaultHomeLayout();
  const sectionStyle = (id: HomeSectionId): CSSProperties => ({
    order: layout.order.indexOf(id),
    gridColumn:
      (id === "orders" && layout.hidden.includes("bookings")) ||
      (id === "bookings" && layout.hidden.includes("orders"))
        ? "1 / -1"
        : undefined,
    display: layout.hidden.includes(id) ? "none" : undefined,
  });
  return (
    <main className="qs-home-overview" dir={ar ? "rtl" : "ltr"}>
      <header className="qs-home-greeting">
        <div>
          <h1>
            {greeting}, {p.name}
          </h1>
          <p>{t("Your restaurant, at a glance.", "نظرة شاملة على مطعمك.")}</p>
        </div>
        <div className="qs-home-date-action">
          <time dateTime={now.toISOString()}>
            {new Intl.DateTimeFormat(ar ? "ar-JO" : "en-GB", {
              weekday: "short",
              day: "numeric",
              month: "short",
              timeZone,
            }).format(now)}
          </time>
          {p.restaurantId ? (
            <Link to="/bookings" search={{ create: true }} className="qs-home-booking">
              {t("Add booking", "حجز جديد")}
            </Link>
          ) : null}
        </div>
      </header>
      {p.onPeriodChange ? <section className="qs-home-period" aria-label={t("Overview period", "فترة العرض")}>
        <div><strong>{t("Overview period", "فترة العرض")}</strong><small>{p.periodHint} · {timeZone} · {t("Weeks start Monday", "الأسبوع يبدأ الاثنين")}</small></div>
        <div className="qs-home-period-options">{HOME_PERIODS.map(([key,en,arabic]) => <button key={key} type="button" aria-pressed={p.period === key} onClick={() => p.onPeriodChange?.(key)}>{t(en,arabic)}</button>)}</div>
        <p>{t("Sales, orders and bookings follow this period. Tables and team show live status.", "المبيعات والطلبات والحجوزات حسب الفترة المحددة. الطاولات والفريق يعرضان الحالة الحالية.")}</p>
      </section> : null}
      <section
        style={sectionStyle("summary")}
        className="qs-home-summary qs-home-panel"
        aria-label={t("Selected period overview", "نظرة على الفترة المحددة")}
      >
        {metrics.map((metric) => (
          <Link key={metric.label} to={metric.to as never} className="qs-home-metric">
            <span>{metric.label}</span>
            <strong className={metric.accent ? "qs-home-sales" : undefined}>
              <bdi dir={metric.accent ? "auto" : "ltr"}>{metric.value}</bdi>
            </strong>
            <small>{metric.hint}</small>
          </Link>
        ))}
      </section>
      <div className="qs-home-main-grid">
        <section style={sectionStyle("orders")} className="qs-home-panel qs-home-orders">
          <div className="qs-home-panel-heading">
            <h2>{t("Orders overview", "نظرة على الطلبات")}</h2>
            {more(path("/orders"), t("View orders", "عرض الطلبات"))}
          </div>
          {p.orderState ? (
            <p className="qs-home-empty" role="status">
              {p.orderState}
            </p>
          ) : p.orders.length ? (
            <div className="qs-home-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{t("Order", "الطلب")}</th>
                    <th>{t("Table", "الطاولة")}</th>
                    <th>{t("Status", "الحالة")}</th>
                    <th>{t("Total", "الإجمالي")}</th>
                  </tr>
                </thead>
                <tbody>
                  {p.orders.map((order) => (
                    <tr key={order.id}>
                      <td>
                        <Link to={path("/orders") as never}>#{order.order_number}</Link>
                      </td>
                      <td>
                        {order.table
                          ? `${t("Table", "طاولة")} ${order.table.table_number}`
                          : t("Takeaway", "خارجي")}
                      </td>
                      <td>
                        <span className={`qs-home-status qs-home-status-${order.status}`}>
                          {status(order.status)}
                        </span>
                      </td>
                      <td>{formatMoney(order.total, p.currency, p.lang)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="qs-home-empty">
              {t(
                "No orders in this period.",
                "لا توجد طلبات خلال هذه الفترة.",
              )}
            </p>
          )}
          <footer>
            <i aria-hidden="true" />
            {p.orderTotal} {t("orders in selected period", "طلبات خلال الفترة")}
          </footer>
        </section>
        <section style={sectionStyle("bookings")} className="qs-home-panel qs-home-bookings">
          <div className="qs-home-panel-heading">
            <h2>{t("Bookings", "الحجوزات")}</h2>
            {more("/bookings", t("View schedule", "عرض الجدول"))}
          </div>
          {p.bookingState ? (
            <p className="qs-home-empty" role="status">
              {p.bookingState}
            </p>
          ) : p.bookings.length ? (
            <div className="qs-home-booking-list">
              {p.bookings.slice(0, 2).map((booking) => (
                <Link key={booking.id} to="/bookings" className="qs-home-reservation">
                  <time dateTime={booking.booking_at}>
                    {new Intl.DateTimeFormat(ar ? "ar-JO" : "en-US", {
                      hour: "numeric",
                      minute: "2-digit",
                      timeZone,
                    }).format(new Date(booking.booking_at))}
                  </time>
                  <div>
                    <strong>{booking.customer_name}</strong>
                    <small>
                      {booking.guest_count} {t("guests", "ضيوف")}
                      {booking.table
                        ? ` · ${t("Table", "طاولة")} ${booking.table.table_number}`
                        : ""}
                    </small>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <p className="qs-home-empty">
              {t("No bookings in this period.", "لا توجد حجوزات خلال هذه الفترة.")}
            </p>
          )}
          <footer>
            {p.bookingTotal} {t("bookings in selected period", "حجوزات خلال الفترة")}
          </footer>
        </section>
      </div>
      <section style={sectionStyle("glance")} className="qs-home-panel qs-home-glance">
        <h2>{t("At a glance", "لمحة سريعة")}</h2>
        <div className="qs-home-glance-grid">
          {p.canInventory ? (
            <div>
              <h3>{t("Inventory", "المخزون")}</h3>
              <p>
                {p.lowStock} {t("items running low", "مواد منخفضة المخزون")}
              </p>
              {more(path("/operations"), t("Review inventory", "مراجعة المخزون"), "inventory")}
            </div>
          ) : null}
          {p.canStaff ? (
            <div>
              <h3>{t("Workforce", "فريق العمل")}</h3>
              <p>
                {p.pendingRequests}{" "}
                {t(
                  p.pendingRequests === "1"
                    ? "request awaiting review"
                    : "requests awaiting review",
                  "طلبات بانتظار المراجعة",
                )}
              </p>
              {more("/shifts", t("Review requests", "مراجعة الطلبات"), "time_off")}
            </div>
          ) : null}
          <div>
            <h3>{t("Service", "الخدمة")}</h3>
            <p>
              {p.readyOrders} {t("orders ready to serve", "طلبات جاهزة للتقديم")}
            </p>
            {more(path("/orders"), t("Open service", "فتح الخدمة"))}
          </div>
        </div>
      </section>
      <nav
        style={sectionStyle("shortcuts")}
        className="qs-home-shortcuts"
        aria-label={t("Workspace shortcuts", "اختصارات مساحة العمل")}
      >
        {p.canMenu ? more(path(""), t("Manage menu", "إدارة القائمة")) : null}
        {p.canAnalytics ? more(path("/analytics"), t("View reports", "عرض التقارير")) : null}
        {more(path("/tables"), t("Open tables", "فتح الطاولات"))}
      </nav>
      {p.onCustomize ? (
        <button type="button" className="qs-home-customize" onClick={p.onCustomize}>
          {t("Customize dashboard", "تخصيص لوحة المعلومات")}
        </button>
      ) : null}
    </main>
  );
}

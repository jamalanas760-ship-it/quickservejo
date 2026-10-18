import { useState } from "react";
import { CalendarDays, FileText, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { workforceDayKey } from "@/lib/workforce-hours";
import {
  type LeaveAccount,
  type LeaveRecord,
  leaveBalance,
  type PayItem,
  daysText,
} from "@/lib/employee-hr";

export type EmploymentProfile = {
  staff_id: string;
  employee_number: string;
  department: string;
  job_title: string;
  hired_on: string | null;
  ended_on: string | null;
};
export type HRStaff = { id: string; name: string; role: string };
export type Payslip = {
  id: string;
  staff_id: string;
  period: string;
  payment_date: string | null;
  currency: string;
  employee_name: string;
  employee_number: string;
  department: string;
  job_title: string;
  payment_method: string;
  account_last_four: string;
  income: PayItem[];
  deductions: PayItem[];
  total_income: number;
  total_deductions: number;
  net_pay: number;
  status: "draft" | "published";
  notes: string;
};
export type AttendanceRecord = {
  id: string;
  staff_id: string;
  clock_in: string;
  clock_out: string | null;
  break_minutes: number;
  review_status: string | null;
};
export type HRRequest = {
  id: string;
  kind: string;
  staff_id: string;
  date: string;
  end_date?: string;
  reason: string;
  status: string;
  review_note?: string | null;
};
export function EmptyHR({ children }: { children: React.ReactNode }) {
  return (
    <div className="hr-empty">
      <FileText aria-hidden="true" />
      <p>{children}</p>
    </div>
  );
}
export function BalanceCards({
  accounts,
  leaves,
  today,
  ar,
}: {
  accounts: LeaveAccount[];
  leaves: LeaveRecord[];
  today: string;
  ar: boolean;
}) {
  return (
    <div className="hr-balance-grid">
      {(["annual", "sick"] as const).map((type) => {
        const account = accounts.find((a) => a.leave_type === type);
        const balance = account ? leaveBalance(account, leaves, today) : null;
        return (
          <article key={type} className={`hr-balance hr-balance-${type}`}>
            <div className="hr-card-heading">
              <CalendarDays aria-hidden="true" />
              <h3>
                {type === "annual"
                  ? ar
                    ? "الإجازة السنوية"
                    : "Annual leave"
                  : ar
                    ? "الإجازة المرضية"
                    : "Sick leave"}
              </h3>
            </div>
            <p className="hr-muted">{ar ? "المتاح الآن" : "Available now"}</p>
            <strong className="hr-balance-value">
              {balance ? daysText(balance.available, ar) : "—"}
            </strong>
            {balance && account ? (
              <>
                <dl className="hr-balance-stats">
                  <div>
                    <dt>{ar ? "المستخدم هذا العام" : "Taken this year"}</dt>
                    <dd>{daysText(balance.taken, ar)}</dd>
                  </div>
                  <div>
                    <dt>{ar ? "الرصيد المتوقع 31 ديسمبر" : "Projected 31 Dec"}</dt>
                    <dd>{daysText(balance.projected, ar)}</dd>
                  </div>
                </dl>
                <p className="hr-caption">
                  {ar ? "الاستحقاق" : "Entitlement"}:{" "}
                  {daysText(Number(account.entitlement_days), ar)} ·{" "}
                  {account.accrual_method === "daily"
                    ? ar
                      ? "تراكم يومي"
                      : "Daily accrual"
                    : ar
                      ? "منح كامل"
                      : "Upfront grant"}
                </p>
                <p className="hr-caption">
                  {ar ? "حجز مستقبلي معتمد" : "Approved future reservations"}:{" "}
                  {daysText(balance.reserved, ar)}.{" "}
                  {ar ? "التوقع يفترض عدم إضافة إجازات." : "Projection assumes no further leave."}
                </p>
              </>
            ) : (
              <p className="hr-caption">
                {ar
                  ? "لم يضبط المدير سياسة الرصيد لهذا العام."
                  : "Your manager has not configured this year’s balance policy."}
              </p>
            )}
          </article>
        );
      })}
    </div>
  );
}
export function LeaveLedger({
  accounts,
  leaves,
  today,
  ar,
}: {
  accounts: LeaveAccount[];
  leaves: LeaveRecord[];
  today: string;
  ar: boolean;
}) {
  const [type, setType] = useState("all"),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [status, setStatus] = useState("all");
  const rows = accounts
    .flatMap((a) =>
      leaveBalance(a, leaves, today).transactions.map((t) => ({ ...t, kind: a.leave_type })),
    )
    .filter(
      (t) =>
        (type === "all" || t.kind === type) &&
        (!from || t.date >= from) &&
        (!to || t.date <= to) &&
        (status === "all" || (status === "projected") === t.projected),
    )
    .sort((a, b) => a.date.localeCompare(b.date));
  return (
    <>
      <BalanceCards accounts={accounts} leaves={leaves} today={today} ar={ar} />
      <section className="hr-panel">
        <h3>{ar ? "حركات الإجازات" : "Leave transactions"}</h3>
        <div className="hr-toolbar">
          <label>
            {ar ? "النوع" : "Leave type"}
            <select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="all">{ar ? "الكل" : "All types"}</option>
              <option value="annual">{ar ? "سنوية" : "Annual"}</option>
              <option value="sick">{ar ? "مرضية" : "Sick"}</option>
            </select>
          </label>
          <label>
            {ar ? "من" : "From"}
            <input
              type="date"
              value={from}
              max={to || undefined}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label>
            {ar ? "إلى" : "To"}
            <input
              type="date"
              min={from || undefined}
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
          <label>
            {ar ? "الحالة" : "Timing"}
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="all">{ar ? "الكل" : "All"}</option>
              <option value="posted">{ar ? "حتى اليوم" : "Through today"}</option>
              <option value="projected">{ar ? "متوقع" : "Projected"}</option>
            </select>
          </label>
        </div>
        <p className="hr-caption">
          {ar
            ? "الحركات مشتقة من السياسة والطلبات المعتمدة فقط. الرصيد المتسلسل مستقل لكل نوع."
            : "Transactions derive from configured policy and approved requests only. Running balance is separate for each leave type."}
        </p>
        {rows.length ? (
          <div className="hr-table-wrap">
            <table>
              <thead>
                <tr>
                  {[
                    ar ? "التاريخ" : "Date",
                    ar ? "النوع" : "Leave type",
                    ar ? "الحركة" : "Transaction",
                    ar ? "التغيير" : "Change",
                    ar ? "الرصيد" : "Balance",
                  ].map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={`${r.kind}-${r.id}`}>
                    <td>
                      {r.date}
                      {r.projected && <small>{ar ? "متوقع" : "Projected"}</small>}
                    </td>
                    <td>
                      {r.kind === "annual" ? (ar ? "سنوية" : "Annual") : ar ? "مرضية" : "Sick"}
                    </td>
                    <td>
                      {ar
                        ? {
                            "Opening balance": "رصيد افتتاحي",
                            Entitlement: "استحقاق",
                            "Daily accrual": "تراكم يومي",
                            "Approved leave": "إجازة معتمدة",
                          }[r.description]
                        : r.description}
                    </td>
                    <td className={r.change < 0 ? "hr-negative" : "hr-positive"}>
                      {r.change > 0 ? "+" : ""}
                      {daysText(r.change, ar, 4)}
                    </td>
                    <td>{daysText(r.balance, ar, 4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyHR>{ar ? "لا توجد حركات مطابقة." : "No matching transactions."}</EmptyHR>
        )}
      </section>
    </>
  );
}
export function AttendanceHistory({
  entries,
  month,
  onMonth,
  ar,
  timeZone,
}: {
  entries: AttendanceRecord[];
  month: string;
  onMonth: (v: string) => void;
  ar: boolean;
  timeZone: string;
}) {
  const now = Date.now();
  const date = (s: string) =>
    new Date(s).toLocaleDateString(ar ? "ar-JO" : "en-GB", {
      timeZone,
      weekday: "short",
      day: "numeric",
      month: "short",
    });
  const time = (s: string | null) =>
    s
      ? new Date(s).toLocaleTimeString(ar ? "ar-JO" : "en-GB", {
          timeZone,
          hour: "2-digit",
          minute: "2-digit",
        })
      : "—";
  const minutes = (r: AttendanceRecord) =>
    r.clock_out
      ? Math.max(
          0,
          Math.round((Math.min(now, Date.parse(r.clock_out)) - Date.parse(r.clock_in)) / 60000) -
            r.break_minutes,
        )
      : 0;
  const accepted = entries.filter((r) => r.review_status !== "rejected");
  const worked = accepted.reduce((n, r) => n + minutes(r), 0);
  return (
    <section className="hr-panel">
      <div className="hr-record-heading">
        <h3>{ar ? "حضوري السابق" : "My previous attendance"}</h3>
        <label>
          {ar ? "الشهر" : "Month"}
          <input
            type="month"
            value={month}
            onChange={(e) => e.target.value && onMonth(e.target.value)}
          />
        </label>
      </div>
      <p className="hr-caption">
        {ar ? "توقيت المطعم" : "Restaurant time"} · {timeZone}.{" "}
        {ar
          ? "الجلسات تجمع حسب تاريخ الدخول؛ الساعات المكتملة فقط."
          : "Sessions are grouped by clock-in date; hours include completed sessions only."}
      </p>
      <dl className="hr-mini-summary">
        <div>
          <dt>{ar ? "أيام بحضور مسجل" : "Days with recorded attendance"}</dt>
          <dd>
            {new Set(accepted.map((r) => workforceDayKey(new Date(r.clock_in), timeZone))).size}
          </dd>
        </div>
        <div>
          <dt>{ar ? "ساعات مكتملة" : "Completed hours"}</dt>
          <dd>
            {Math.floor(worked / 60)}h {worked % 60}m
          </dd>
        </div>
      </dl>
      {entries.length ? (
        <div className="hr-record-list">
          {entries.map((r) => (
            <article className="hr-record" key={r.id}>
              <div className="hr-record-heading">
                <strong>{date(r.clock_in)}</strong>
                <span className="hr-status">
                  {r.review_status ||
                    (r.clock_out ? (ar ? "مكتمل" : "Completed") : ar ? "مفتوح" : "Open")}
                </span>
              </div>
              <dl>
                <div>
                  <dt>{ar ? "الدخول" : "Clock-in"}</dt>
                  <dd>{time(r.clock_in)}</dd>
                </div>
                <div>
                  <dt>{ar ? "الانصراف" : "Clock-out"}</dt>
                  <dd>
                    {r.clock_out
                      ? `${date(r.clock_out)} · ${time(r.clock_out)}`
                      : ar
                        ? "لم يسجل"
                        : "Not recorded"}
                  </dd>
                </div>
                <div>
                  <dt>{ar ? "الاستراحة" : "Break"}</dt>
                  <dd>{r.break_minutes}m</dd>
                </div>
                <div>
                  <dt>{ar ? "المدة" : "Worked"}</dt>
                  <dd>
                    {r.clock_out ? `${Math.floor(minutes(r) / 60)}h ${minutes(r) % 60}m` : "—"}
                  </dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      ) : (
        <EmptyHR>
          {ar ? "لا يوجد حضور مسجل لهذا الشهر." : "No attendance recorded for this month."}
        </EmptyHR>
      )}
    </section>
  );
}
export function RequestHistory({ requests, ar }: { requests: HRRequest[]; ar: boolean }) {
  const [status, setStatus] = useState("all");
  const rows = requests.filter(
    (r) =>
      status === "all" || (status === "pending" ? r.status === "pending" : r.status !== "pending"),
  );
  const title = (s: string) =>
    ({
      annual: ar ? "إجازة سنوية" : "Annual leave",
      sick: ar ? "إجازة مرضية" : "Sick leave",
      hajj: ar ? "إجازة حج" : "Hajj leave",
      bereavement: ar ? "إجازة وفاة" : "Bereavement leave",
      missing_punch: ar ? "بصمة مفقودة" : "Missing punch",
      permission: ar ? "إذن" : "Permission",
    })[s] || s;
  return (
    <section className="hr-panel">
      <h3>{ar ? "طلباتي" : "My requests"}</h3>
      <div className="hr-tabs" aria-label={ar ? "تصفية الطلبات" : "Filter requests"}>
        {["all", "pending", "completed"].map((s) => (
          <button key={s} type="button" aria-pressed={status === s} onClick={() => setStatus(s)}>
            {s === "all"
              ? ar
                ? "الكل"
                : "All"
              : s === "pending"
                ? ar
                  ? "قيد الانتظار"
                  : "Pending"
                : ar
                  ? "مكتملة"
                  : "Completed"}
          </button>
        ))}
      </div>
      {rows.length ? (
        <div className="hr-record-list">
          {rows.map((r) => (
            <article className="hr-record" key={`${r.kind}-${r.id}`}>
              <div className="hr-record-heading">
                <strong>{title(r.kind)}</strong>
                <span className="hr-status" data-status={r.status}>
                  {ar
                    ? {
                        pending: "قيد الانتظار",
                        approved: "معتمد",
                        rejected: "مرفوض",
                        cancelled: "ملغى",
                      }[r.status] || r.status
                    : r.status}
                </span>
              </div>
              <p>
                {r.date}
                {r.end_date && r.end_date !== r.date ? ` – ${r.end_date}` : ""}
              </p>
              <p className="hr-muted">{r.reason}</p>
              {r.review_note && (
                <p>
                  {ar ? "ملاحظة المراجعة" : "Review note"}: {r.review_note}
                </p>
              )}
            </article>
          ))}
        </div>
      ) : (
        <EmptyHR>{ar ? "لا توجد طلبات مطابقة." : "No matching requests."}</EmptyHR>
      )}
    </section>
  );
}
export function SalarySlips({
  slips,
  ar,
  canManage,
  onEdit,
}: {
  slips: Payslip[];
  ar: boolean;
  canManage: boolean;
  onEdit: (slip: Payslip) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const slip = slips.find((s) => s.id === selected) ?? slips[0];
  if (!slip)
    return (
      <section className="hr-panel">
        <EmptyHR>
          {ar
            ? "لا توجد قسائم راتب منشورة لهذا العام."
            : "No published salary slips for this year."}
        </EmptyHR>
      </section>
    );
  const money = (n: number) =>
    new Intl.NumberFormat(ar ? "ar-JO" : "en-GB", {
      style: "currency",
      currency: slip.currency,
      minimumFractionDigits: 3,
    }).format(Number(n));
  const month = (s: string) =>
    new Date(`${s}T12:00:00Z`).toLocaleDateString(ar ? "ar-JO" : "en-GB", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
  return (
    <div className="hr-pay-layout">
      <aside className="hr-panel hr-pay-months" aria-label={ar ? "قسائم الراتب" : "Salary slips"}>
        {slips.map((s) => (
          <button
            type="button"
            key={s.id}
            aria-pressed={s.id === slip.id}
            onClick={() => setSelected(s.id)}
          >
            <FileText aria-hidden="true" />
            <span>
              {month(s.period)}
              <small>
                {s.status === "draft" ? (ar ? "مسودة" : "Draft") : ar ? "منشور" : "Published"}
              </small>
            </span>
          </button>
        ))}
      </aside>
      <article className="hr-panel hr-salary-slip" id="hr-salary-print">
        <div className="hr-record-heading">
          <div>
            <p className="hr-eyebrow">{ar ? "قسيمة راتب" : "Salary slip"}</p>
            <h3>{month(slip.period)}</h3>
            <span className="hr-status">
              {slip.status === "draft" ? (ar ? "مسودة" : "Draft") : ar ? "منشور" : "Published"}
            </span>
          </div>
          <div className="hr-pay-actions">
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="size-4" />
              {ar ? "طباعة / حفظ PDF" : "Print / Save PDF"}
            </Button>
            {canManage && slip.status === "draft" && (
              <Button variant="outline" onClick={() => onEdit(slip)}>
                {ar ? "تعديل المسودة" : "Edit draft"}
              </Button>
            )}
          </div>
        </div>
        <section>
          <h4>{ar ? "معلومات الموظف" : "Employee information"}</h4>
          <dl className="hr-info-grid">
            {[
              [ar ? "الاسم" : "Name", slip.employee_name],
              [ar ? "رقم الموظف" : "Employee ID", slip.employee_number],
              [ar ? "القسم" : "Department", slip.department],
              [ar ? "المسمى" : "Job title", slip.job_title],
            ].map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v || "—"}</dd>
              </div>
            ))}
          </dl>
        </section>
        <section>
          <h4>{ar ? "معلومات الراتب" : "Salary information"}</h4>
          <dl className="hr-info-grid">
            {[
              [ar ? "الفترة" : "Pay period", month(slip.period)],
              [ar ? "تاريخ الدفع" : "Payment date", slip.payment_date],
              [ar ? "العملة" : "Currency", slip.currency],
              [ar ? "الطريقة" : "Method", slip.payment_method],
              [
                ar ? "الحساب" : "Account",
                slip.account_last_four ? `•••• ${slip.account_last_four}` : "—",
              ],
            ].map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v || "—"}</dd>
              </div>
            ))}
          </dl>
        </section>
        <div className="hr-pay-breakdown">
          {[
            {
              label: ar ? "الدخل" : "Income",
              items: slip.income,
              total: slip.total_income,
              totalLabel: ar ? "إجمالي الدخل" : "Total income",
            },
            {
              label: ar ? "الاستقطاعات" : "Deductions",
              items: slip.deductions,
              total: slip.total_deductions,
              totalLabel: ar ? "إجمالي الاستقطاعات" : "Total deductions",
            },
          ].map((group) => (
            <section key={group.label}>
              <h4>{group.label}</h4>
              <dl>
                {group.items.length ? (
                  group.items.map((i, index) => (
                    <div key={index}>
                      <dt>{i.label}</dt>
                      <dd>{money(i.amount)}</dd>
                    </div>
                  ))
                ) : (
                  <p className="hr-caption">{ar ? "لا يوجد" : "None"}</p>
                )}
                <div className="hr-pay-total">
                  <dt>{group.totalLabel}</dt>
                  <dd>{money(group.total)}</dd>
                </div>
              </dl>
            </section>
          ))}
        </div>
        <div className="hr-net-pay">
          <span>{ar ? "صافي الراتب" : "Net pay"}</span>
          <strong>{money(slip.net_pay)}</strong>
        </div>
        {slip.notes && <p className="hr-caption">{slip.notes}</p>}
        <p className="hr-caption">
          {ar ? "مرجع" : "Reference"}: {slip.id}
        </p>
      </article>
    </div>
  );
}

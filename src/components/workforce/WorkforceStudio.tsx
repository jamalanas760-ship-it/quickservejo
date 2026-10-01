import { useState } from "react";
import { Download, ChevronRight } from "lucide-react";
import { WorkforceButton as Button } from "./WorkforceButton";
import type { Shift, ShiftAssignment } from "@/hooks/useOperations";
import { ROLE_LABELS } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import {
  lifecycleLabel,
  lifecycleTone,
  memberDayStatus,
  useWorkforceData,
  type WorkforceMember,
} from "./WorkforceInsights";
import {
  localDay,
  moveDay,
  weekOf,
  timeLabel,
  hourLabel,
  dateLabel,
  shiftType,
  Person,
  WeekControl,
  SearchField,
} from "./WorkforcePrimitives";
export {
  localDay,
  moveDay,
  weekOf,
  timeLabel,
  hourLabel,
  dateLabel,
  shiftType,
  Person,
  WeekControl,
  SearchField,
  Inspector,
} from "./WorkforcePrimitives";
export function StatusPill({
  status,
  ar,
}: {
  status: Parameters<typeof lifecycleLabel>[0];
  ar: boolean;
}) {
  return <span className={cn("wf-pill", lifecycleTone(status))}>{lifecycleLabel(status, ar)}</span>;
}
export function WorkforceWeekBoard({
  date,
  onChangeDate,
  shifts,
  assignments,
  members,
  ar,
  onOpen,
  onCreate,
  canManage,
}: {
  date: string;
  onChangeDate: (v: string) => void;
  shifts: Shift[];
  assignments: ShiftAssignment[];
  members: WorkforceMember[];
  ar: boolean;
  onOpen: (s: Shift) => void;
  onCreate: () => void;
  canManage: boolean;
}) {
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("all");
  const days = weekOf(date),
    today = localDay(new Date());
  const rows = members.filter(
    (m) =>
      m.is_active &&
      m.name.toLowerCase().includes(search.toLowerCase()) &&
      (role === "all" || m.role === role),
  );
  const byId = new Map(shifts.map((s) => [s.id, s]));
  const assignedIds = new Set(
    assignments.filter((a) => a.status !== "released").map((a) => a.shift_id),
  );
  const unassigned = shifts.filter((s) => days.includes(s.shift_date) && !assignedIds.has(s.id));
  return (
    <div className="wf-panel">
      <div className="wf-toolbar">
        <WeekControl date={date} onChange={onChangeDate} ar={ar} />
        <div className="wf-toolbar-actions">
          <SearchField value={search} onChange={setSearch} ar={ar} />
          <select
            className="wf-select"
            aria-label={ar ? "الدور" : "Role"}
            value={role}
            onChange={(e) => setRole(e.target.value)}
          >
            <option value="all">{ar ? "كل الأدوار" : "All roles"}</option>
            {Array.from(new Set(members.map((m) => m.role))).map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]?.[ar ? "ar" : "en"] ?? r}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="wf-week-scroll">
        <table className="wf-week-table">
          <thead>
            <tr>
              <th>
                {ar ? "الفريق" : "Team"} ({rows.length})
              </th>
              {days.map((d) => (
                <th key={d} className={d === today ? "is-today" : ""}>
                  <button onClick={() => onChangeDate(d)}>
                    <span>
                      {new Date(`${d}T12:00:00`).toLocaleDateString(ar ? "ar-JO" : "en-US", {
                        weekday: "short",
                      })}
                    </span>
                    <strong>{dateLabel(d, ar)}</strong>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.id}>
                <td>
                  <Person member={m} />
                  <small>{ROLE_LABELS[m.role]?.[ar ? "ar" : "en"]}</small>
                </td>
                {days.map((d) => {
                  const list = assignments.filter(
                    (a) =>
                      a.staff_id === m.id &&
                      a.status !== "released" &&
                      byId.get(a.shift_id)?.shift_date === d,
                  );
                  return (
                    <td key={d} className={d === today ? "is-today" : ""}>
                      {list.map((a) => {
                        const s = byId.get(a.shift_id)!;
                        return (
                          <button
                            key={a.id}
                            className={`wf-shift-block wf-shift-${shiftType(s)}`}
                            onClick={() => onOpen(s)}
                          >
                            <strong>
                              {shiftType(s)} · {timeLabel(a.starts_at ?? s.planned_start, ar)} –{" "}
                              {timeLabel(a.ends_at ?? s.planned_end, ar)}
                            </strong>
                            <small>{s.name}</small>
                          </button>
                        );
                      })}
                      {!list.length ? <span className="wf-empty-cell">—</span> : null}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length ? (
        <p className="wf-empty">{ar ? "لا يوجد أعضاء مطابقون." : "No matching team members."}</p>
      ) : null}
      <div className="wf-legend">
        <span className="wf-shift-A">A</span>
        <span className="wf-shift-B">B</span>
        <span className="wf-shift-C">C</span>
        <small>{ar ? "اضغط على وردية لعرض التفاصيل" : "Select a shift to view details"}</small>
      </div>
      {unassigned.length ? (
        <div className="wf-unassigned">
          <strong>
            {ar ? "ورديات غير معيّنة" : "Unassigned shifts"} ({unassigned.length})
          </strong>
          <div>
            {unassigned.map((s) => (
              <button key={s.id} onClick={() => onOpen(s)}>
                {dateLabel(s.shift_date, ar)} · {s.name}
                <small>
                  {timeLabel(s.planned_start, ar)} – {timeLabel(s.planned_end, ar)}
                </small>
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {!shifts.length && canManage ? (
        <div className="wf-empty">
          <p>{ar ? "ابدأ بإنشاء أول وردية." : "Start by creating your first shift."}</p>
          <Button onClick={onCreate}>{ar ? "إنشاء وردية" : "Create shift"}</Button>
        </div>
      ) : null}
    </div>
  );
}

export function WorkforceToday({
  restaurantId,
  members,
  assignments,
  ar,
  onOpen,
  onAttendance,
}: {
  restaurantId: string;
  members: WorkforceMember[];
  assignments: ShiftAssignment[];
  ar: boolean;
  onOpen: (m: WorkforceMember) => void;
  onAttendance: () => void;
}) {
  const data = useWorkforceData(restaurantId),
    today = localDay(new Date());
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("all");
  const rows = members
    .filter(
      (m) =>
        m.is_active &&
        (role === "all" || role === m.role) &&
        m.name.toLowerCase().includes(search.toLowerCase()),
    )
    .map((m) => ({ m, d: memberDayStatus(m.id, today, assignments, data.data?.entries ?? []) }))
    .filter(({ d }) => d.status !== "off");
  return (
    <section className="wf-panel">
      <header className="wf-toolbar">
        <h2>
          {ar ? "فريق اليوم" : "Today's team"} <small>({rows.length})</small>
        </h2>
        <div className="wf-toolbar-actions">
          <select
            className="wf-select"
            aria-label={ar ? "الدور" : "Role"}
            value={role}
            onChange={(e) => setRole(e.target.value)}
          >
            <option value="all">{ar ? "كل الأدوار" : "All roles"}</option>
            {Array.from(new Set(members.map((m) => m.role))).map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]?.[ar ? "ar" : "en"] ?? r}
              </option>
            ))}
          </select>
          <SearchField value={search} onChange={setSearch} ar={ar} />
        </div>
      </header>
      <div className="wf-table-scroll">
        <table className="wf-table">
          <thead>
            <tr>
              {[
                ar ? "عضو الفريق" : "Team member",
                ar ? "الدور" : "Role",
                ar ? "الحالة" : "Status",
                ar ? "الوردية" : "Shift",
                ar ? "العمل" : "Worked",
              ].map((t) => (
                <th key={t}>{t}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ m, d }) => (
              <tr key={m.id}>
                <td data-label={ar ? "عضو الفريق" : "Team member"}>
                  <button onClick={() => onOpen(m)} className="wf-person-button">
                    <Person member={m} />
                  </button>
                </td>
                <td data-label={ar ? "الدور" : "Role"}>
                  {ROLE_LABELS[m.role]?.[ar ? "ar" : "en"]}
                </td>
                <td data-label={ar ? "الحالة" : "Status"}>
                  <StatusPill status={d.status} ar={ar} />
                </td>
                <td data-label={ar ? "الوردية" : "Shift"}>
                  {timeLabel(d.assignment?.starts_at, ar)} – {timeLabel(d.assignment?.ends_at, ar)}
                </td>
                <td data-label={ar ? "العمل" : "Worked"}>{hourLabel(d.actualH, ar)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data.isError ? (
        <p className="wf-empty">{ar ? "تعذر تحميل الحضور." : "Attendance could not be loaded."}</p>
      ) : !rows.length ? (
        <p className="wf-empty">
          {data.isPending
            ? ar
              ? "جارٍ التحميل…"
              : "Loading attendance…"
            : ar
              ? "لا ورديات مجدولة اليوم."
              : "No team shifts scheduled today."}
        </p>
      ) : null}
      <div className="wf-table-footer">
        <Button variant="ghost" onClick={onAttendance}>
          {ar ? "عرض الحضور" : "View attendance"}
          <ChevronRight className="size-3.5" />
        </Button>
      </div>
    </section>
  );
}

export function WorkforceLabor({
  restaurantId,
  assignments,
  members,
  ar,
  onTimesheets,
}: {
  restaurantId: string;
  assignments: ShiftAssignment[];
  members: WorkforceMember[];
  ar: boolean;
  onTimesheets: () => void;
}) {
  const [date, setDate] = useState(localDay(new Date()));
  const rangeDays = weekOf(date);
  const data = useWorkforceData(restaurantId, { start: rangeDays[0], end: rangeDays[6] });
  const days = weekOf(date),
    start = new Date(`${days[0]}T00:00:00`).getTime(),
    end = new Date(`${moveDay(days[6], 1)}T00:00:00`).getTime(),
    now = Date.now();
  const hours = (s: number, e: number) =>
    Math.max(0, (Math.min(e, end) - Math.max(s, start)) / 3600000);
  const entries = (data.data?.entries ?? []).filter(
    (e) =>
      new Date(e.clock_in).getTime() < end &&
      (e.clock_out ? new Date(e.clock_out).getTime() : now) > start,
  );
  const scheduled = assignments.filter(
    (a) =>
      a.status !== "released" &&
      a.starts_at &&
      a.ends_at &&
      new Date(a.starts_at).getTime() < end &&
      new Date(a.ends_at).getTime() > start,
  );
  const rows = members
    .filter((m) => m.is_active)
    .map((m) => {
      const planned = scheduled
        .filter((a) => a.staff_id === m.id)
        .reduce(
          (n, a) => n + hours(new Date(a.starts_at!).getTime(), new Date(a.ends_at!).getTime()),
          0,
        );
      const worked = entries
        .filter((e) => e.staff_id === m.id)
        .reduce(
          (n, e) =>
            n +
            Math.max(
              0,
              hours(
                new Date(e.clock_in).getTime(),
                e.clock_out ? new Date(e.clock_out).getTime() : now,
              ) -
                (e.break_minutes || 0) / 60,
            ),
          0,
        );
      return { m, planned, worked, variance: worked - planned };
    })
    .filter((r) => r.planned || r.worked);
  const planned = rows.reduce((n, r) => n + r.planned, 0),
    worked = rows.reduce((n, r) => n + r.worked, 0),
    over = rows.filter((r) => r.planned && r.variance > 0.25),
    open = entries.filter((e) => !e.clock_out);
  const chart = days.map((d) => {
    const ds = new Date(`${d}T00:00:00`).getTime(),
      de = new Date(`${moveDay(d, 1)}T00:00:00`).getTime();
    const span = (s: number, e: number) =>
      Math.max(0, (Math.min(e, de) - Math.max(s, ds)) / 3600000);
    return {
      d,
      planned: scheduled.reduce(
        (n, a) => n + span(new Date(a.starts_at!).getTime(), new Date(a.ends_at!).getTime()),
        0,
      ),
      worked: entries.reduce((n, e) => {
        const duration = span(
          new Date(e.clock_in).getTime(),
          e.clock_out ? new Date(e.clock_out).getTime() : now,
        );
        return (
          n +
          Math.max(
            0,
            duration -
              (duration > 0 && localDay(new Date(e.clock_in)) === d
                ? (e.break_minutes || 0) / 60
                : 0),
          )
        );
      }, 0),
    };
  });
  const max = Math.max(1, ...chart.flatMap((v) => [v.planned, v.worked]));
  function exportCsv() {
    const cell = (v: unknown) => `"${String(v).replaceAll('"', '""')}"`;
    const csv = [
      ["Staff", "Role", "Week start", "Scheduled hours", "Worked hours", "Variance hours"],
      ...rows.map((r) => [
        r.m.name,
        ROLE_LABELS[r.m.role]?.en,
        days[0],
        r.planned.toFixed(2),
        r.worked.toFixed(2),
        r.variance.toFixed(2),
      ]),
    ]
      .map((r) => r.map(cell).join(","))
      .join("\r\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `quickserve-payroll-${days[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <section className="wf-labor">
      <div className="wf-toolbar">
        <WeekControl date={date} onChange={setDate} ar={ar} />
        <Button variant="outline" onClick={exportCsv} disabled={data.isPending || data.isError}>
          <Download className="size-4" />
          {ar ? "تصدير CSV" : "Export payroll CSV"}
        </Button>
      </div>
      <div className="wf-metrics">
        {[
          [ar ? "مجدول" : "Scheduled", hourLabel(planned, ar)],
          [ar ? "العمل" : "Worked", hourLabel(worked, ar)],
          [ar ? "الفرق" : "Variance", hourLabel(worked - planned, ar)],
          [ar ? "أعلى من الخطة" : "Over plan", over.length],
          [ar ? "سجلات مفتوحة" : "Open clocks", open.length],
        ].map(([label, value]) => (
          <div key={label}>
            <small>{label}</small>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      {data.isError ? (
        <p role="alert">{ar ? "تعذر تحميل ساعات العمل." : "Labor hours could not be loaded."}</p>
      ) : null}
      <div className="wf-split">
        <div className="space-y-4">
          <section className="wf-panel">
            <header className="wf-toolbar">
              <h2>{ar ? "المجدول مقابل ساعات العمل" : "Scheduled vs worked hours"}</h2>
              <span className="wf-chart-legend">
                <i />
                {ar ? "مجدول" : "Scheduled"}
                <i />
                {ar ? "عمل" : "Worked"}
              </span>
            </header>
            <div
              className="wf-chart"
              role="img"
              aria-label={ar ? "ساعات العمل الأسبوعية" : "Weekly scheduled and worked hours"}
            >
              {chart.map((c) => (
                <div key={c.d}>
                  <div className="wf-bars">
                    <span style={{ height: `${(c.planned / max) * 100}%` }}>
                      <small>{hourLabel(c.planned, ar)}</small>
                    </span>
                    <span style={{ height: `${(c.worked / max) * 100}%` }}>
                      <small>{hourLabel(c.worked, ar)}</small>
                    </span>
                  </div>
                  <p>
                    {new Date(`${c.d}T12:00:00`).toLocaleDateString(ar ? "ar-JO" : "en-US", {
                      weekday: "short",
                    })}
                    <small>{dateLabel(c.d, ar)}</small>
                  </p>
                </div>
              ))}
            </div>
          </section>
          <section className="wf-panel">
            <header className="wf-toolbar">
              <h2>{ar ? "ساعات الفريق" : "Team labor hours"}</h2>
            </header>
            <div className="wf-table-scroll">
              <table className="wf-table">
                <thead>
                  <tr>
                    {[
                      ar ? "عضو الفريق" : "Team member",
                      ar ? "الدور" : "Role",
                      ar ? "مجدول" : "Scheduled",
                      ar ? "عمل" : "Worked",
                      ar ? "الفرق" : "Variance",
                    ].map((v) => (
                      <th key={v}>{v}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.m.id}>
                      <td data-label={ar ? "عضو الفريق" : "Team member"}>
                        <Person member={r.m} />
                      </td>
                      <td data-label={ar ? "الدور" : "Role"}>
                        {ROLE_LABELS[r.m.role]?.[ar ? "ar" : "en"]}
                      </td>
                      <td data-label={ar ? "مجدول" : "Scheduled"}>{hourLabel(r.planned, ar)}</td>
                      <td data-label={ar ? "العمل" : "Worked"}>{hourLabel(r.worked, ar)}</td>
                      <td
                        data-label={ar ? "الفرق" : "Variance"}
                        className={r.variance > 0.25 ? "text-orange-600" : ""}
                      >
                        {r.variance > 0 ? "+" : ""}
                        {hourLabel(r.variance, ar)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!rows.length ? (
              <p className="wf-empty">
                {ar ? "لا ساعات مسجلة لهذه الفترة." : "No hours recorded for this period."}
              </p>
            ) : null}
          </section>
        </div>
        <aside className="wf-panel">
          <header className="wf-toolbar">
            <h2>{ar ? "مراجعة الاستثناءات" : "Review exceptions"}</h2>
          </header>
          {over.map((r) => (
            <div key={r.m.id} className="wf-exception">
              <Person member={r.m} />
              <small>
                +{hourLabel(r.variance, ar)} · {ar ? "أعلى من الخطة" : "Over plan"}
              </small>
              <Button variant="outline" onClick={onTimesheets}>
                {ar ? "عرض سجل الدوام" : "View timesheet"}
              </Button>
            </div>
          ))}
          {open.map((e) => {
            const m = members.find((m) => m.id === e.staff_id);
            return (
              <div key={e.id} className="wf-exception">
                {m ? <Person member={m} /> : null}
                <small>
                  {ar ? "سجل مفتوح" : "Open clock"} · {timeLabel(e.clock_in, ar)}
                </small>
                <Button variant="outline" onClick={onTimesheets}>
                  {ar ? "عرض سجل الدوام" : "View timesheet"}
                </Button>
              </div>
            );
          })}
          {!over.length && !open.length ? (
            <p className="wf-empty">
              {ar ? "لا استثناءات في هذه الفترة." : "No exceptions for this period."}
            </p>
          ) : null}
        </aside>
      </div>
      <p className="wf-note">
        {ar ? "ساعات تشغيلية للتخطيط والمراجعة." : "Operational hours for planning and review."}
      </p>
    </section>
  );
}

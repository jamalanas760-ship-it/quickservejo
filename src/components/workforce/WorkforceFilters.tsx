import { useId, useState, type ReactNode } from "react";
import { Search, SlidersHorizontal, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ROLE_LABELS, type AppRole } from "@/lib/permissions";

type Member = { id: string; name: string; role: AppRole };
export function WorkforceFilters({
  ar,
  search,
  onSearch,
  employee,
  onEmployee,
  role,
  onRole,
  members,
  from,
  until,
  onFrom,
  onUntil,
  status,
  onStatus,
  statuses,
  onReset,
  period,
  action,
}: {
  ar: boolean;
  search: string;
  onSearch: (value: string) => void;
  employee: string;
  onEmployee: (value: string) => void;
  role: string;
  onRole: (value: string) => void;
  members: Member[];
  from: string;
  until: string;
  onFrom: (value: string) => void;
  onUntil: (value: string) => void;
  status: string;
  onStatus: (value: string) => void;
  statuses: { value: string; label: string }[];
  onReset: () => void;
  period?: ReactNode;
  action?: ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  const count =
    Number(employee !== "all") +
    Number(role !== "all") +
    Number(Boolean(from || until)) +
    Number(status !== statuses[0]?.value);
  const invalid = Boolean(
    from && until && (from > until || (Date.parse(until) - Date.parse(from)) / 86400000 > 366),
  );
  return (
    <section className="wf-controls" aria-label={ar ? "بحث وتصفية" : "Search and filters"}>
      {period && (
        <div className="wf-controls-period">
          {period}
          {action}
        </div>
      )}
      <div className="wf-controls-search">
        <label>
          <Search aria-hidden="true" size={18} />
          <input
            aria-label={ar ? "بحث الموظفين" : "Search employees"}
            placeholder={ar ? "ابحث باسم الموظف…" : "Search employees…"}
            value={search}
            onChange={(e) => onSearch(e.target.value)}
          />
        </label>
        <Button
          type="button"
          variant={count ? "secondary" : "outline"}
          aria-expanded={expanded}
          aria-controls={id}
          onClick={() => setExpanded(!expanded)}
        >
          <SlidersHorizontal size={16} />
          {ar ? "الفلاتر" : "Filters"}
          {count > 0 && <span className="wf-filter-count">{count}</span>}
        </Button>
      </div>
      {(from && until && !invalid) || employee !== "all" || role !== "all" ? (
        <p className="wf-filter-summary">
          {[
            from && until && !invalid ? `${from} → ${until}` : null,
            employee !== "all" ? members.find((m) => m.id === employee)?.name : null,
            role !== "all" ? (ROLE_LABELS[role as AppRole]?.[ar ? "ar" : "en"] ?? role) : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      ) : null}
      {expanded && (
        <div id={id} className="wf-controls-panel">
          <label>
            {ar ? "الموظف" : "Employee"}
            <select
              aria-label={ar ? "الموظف" : "Employee"}
              value={employee}
              onChange={(e) => onEmployee(e.target.value)}
            >
              <option value="all">{ar ? "كل الموظفين" : "All employees"}</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            {ar ? "الدور" : "Role"}
            <select
              aria-label={ar ? "الدور" : "Role"}
              value={role}
              onChange={(e) => onRole(e.target.value)}
            >
              <option value="all">{ar ? "كل الأدوار" : "All roles"}</option>
              {[...new Set(members.map((m) => m.role))].map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]?.[ar ? "ar" : "en"] ?? r}
                </option>
              ))}
            </select>
          </label>
          <label>
            {ar ? "الحالة" : "Status"}
            <select
              aria-label={ar ? "الحالة" : "Status"}
              value={status}
              onChange={(e) => onStatus(e.target.value)}
            >
              {statuses.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            {ar ? "من تاريخ" : "From date"}
            <input
              type="date"
              aria-label={ar ? "من تاريخ" : "From date"}
              value={from}
              max={until || undefined}
              onChange={(e) => onFrom(e.target.value)}
            />
          </label>
          <label>
            {ar ? "حتى تاريخ" : "Through date"}
            <input
              type="date"
              aria-label={ar ? "حتى تاريخ" : "Through date"}
              value={until}
              min={from || undefined}
              onChange={(e) => onUntil(e.target.value)}
            />
          </label>
          <Button type="button" variant="ghost" onClick={onReset}>
            <RotateCcw size={16} />
            {ar ? "إعادة ضبط" : "Reset filters"}
          </Button>
          {invalid && (
            <p role="alert" className="text-destructive">
              {ar ? "اختر فترة صحيحة حتى 366 يوماً" : "Choose a valid range of up to 366 days"}
            </p>
          )}
          {Boolean(from) !== Boolean(until) && (
            <p role="status">
              {ar ? "اختر التاريخين لتطبيق الفترة" : "Choose both dates to apply the range."}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

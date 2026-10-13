import { arSA, enGB } from "date-fns/locale";
import { PickerSurface } from "@/components/app/PickerSurface";
import { useIsMobile } from "@/hooks/use-mobile";
import { Calendar } from "@/components/ui/calendar";
import { ActionMenu, type CompactAction } from "@/components/app/ActionMenu";
import { useState, type ReactNode } from "react";
import {
  Search,
  UsersRound,
  BriefcaseBusiness,
  Clock3,
  CalendarDays,
  ChevronDown,
  X,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { FilterChip, FilterPanel } from "@/components/app/FilterChip";
import { ROLE_LABELS, type AppRole } from "@/lib/permissions";
import { workforceDayKey } from "@/lib/workforce-hours";
import { weekOf, moveDay } from "./WorkforcePrimitives";

const calendarDay = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
type Props = {
  ar: boolean;
  search: string;
  onSearch: (value: string) => void;
  employee: string;
  onEmployee: (value: string) => void;
  role: string;
  onRole: (value: string) => void;
  members: { id: string; name: string; role: AppRole }[];
  from: string;
  until: string;
  onFrom: (value: string) => void;
  onUntil: (value: string) => void;
  status: string;
  onStatus: (value: string) => void;
  statuses: { value: string; label: string }[];
  onReset: () => void;
  date: string;
  onDate: (value: string) => void;
  timeZone?: string;
  action?: ReactNode;
  actionMenu?: CompactAction[];
};
export function WorkforceFilters(p: Props) {
  const { ar } = p;
  const mobile = useIsMobile();
  const [periodOpen, setPeriodOpen] = useState(false);
  const [periodMonth, setPeriodMonth] = useState(() => new Date(`${p.date}T12:00:00`));
  const [open, setOpen] = useState(false);
  const current = () => ({
    employee: p.employee,
    role: p.role,
    status: p.status,
    from: p.from,
    until: p.until,
  });
  const [draft, setDraft] = useState(current);
  const employeeOptions = [
    { value: "all", label: ar ? "الكل" : "All" },
    ...p.members.map((m) => ({ value: m.id, label: m.name })),
  ];
  const roleOptions = [
    { value: "all", label: ar ? "الكل" : "All" },
    ...[...new Set(p.members.map((m) => m.role))].map((role) => ({
      value: role,
      label: ROLE_LABELS[role]?.[ar ? "ar" : "en"] ?? role,
    })),
  ];
  const count =
    Number(p.employee !== "all") +
    Number(p.role !== "all") +
    Number(p.status !== p.statuses[0]?.value) +
    Number(Boolean(p.from && p.until));
  const invalid =
    Boolean(draft.from) !== Boolean(draft.until) ||
    Boolean(
      draft.from &&
      draft.until &&
      (draft.from > draft.until ||
        (Date.parse(draft.until) - Date.parse(draft.from)) / 86400000 > 366),
    );
  const days = weekOf(p.date);
  const first = p.from || days[0],
    last = p.until || days.at(-1);
  const format = (day: string) =>
    new Date(`${day}T12:00:00`).toLocaleDateString(ar ? "ar-JO" : "en-GB", {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    });
  function apply() {
    if (invalid) return;
    p.onEmployee(draft.employee);
    p.onRole(draft.role);
    p.onStatus(draft.status);
    p.onFrom(draft.from);
    p.onUntil(draft.until);
    setOpen(false);
  }
  function selectWeek(day: string) {
    p.onDate(day);
    setPeriodMonth(new Date(`${day}T12:00:00`));
    p.onFrom("");
    p.onUntil("");
  }
  return (
    <section className="p2-controls" aria-label={ar ? "بحث وتصفية" : "Search and filters"}>
      <div className="p2-toolbar">
        <label className="p2-search">
          <Search size={17} aria-hidden="true" />
          <input
            aria-label={ar ? "بحث الموظفين" : "Search employees"}
            placeholder={ar ? "ابحث باسم الموظف…" : "Search employees…"}
            value={p.search}
            onChange={(e) => p.onSearch(e.target.value)}
          />
        </label>
        <PickerSurface
          ar={ar}
          title={ar ? "اختر الأسبوع" : "Choose week"}
          open={periodOpen}
          onOpenChange={(value) => {
            if (value) {
              setOpen(false);
              setPeriodMonth(new Date(`${p.date}T12:00:00`));
            }
            setPeriodOpen(value);
          }}
          trigger={
            <button
              type="button"
              className="p2-chip p2-period"
              aria-label={ar ? "الفترة" : "Period"}
            >
              <CalendarDays size={16} />
              <span>
                {p.from
                  ? ar
                    ? "فترة مخصصة"
                    : "Custom period"
                  : ar
                    ? "الأسبوع المحدد"
                    : "Selected week"}
                <small>
                  {format(first!)} – {format(last!)}
                </small>
              </span>
              <ChevronDown size={14} />
            </button>
          }
        >
          <div className="p2-week-picker">
            {mobile ? (
              <Calendar
                locale={ar ? arSA : enGB}
                mode="single"
                month={periodMonth}
                onMonthChange={setPeriodMonth}
                selected={new Date(`${p.date}T12:00:00`)}
                onSelect={(date) => {
                  if (date) {
                    selectWeek(calendarDay(date));
                    setPeriodOpen(false);
                  }
                }}
              />
            ) : (
              <label className="p2-field">
                {ar ? "أسبوع التاريخ" : "Week of date"}
                <input
                  type="date"
                  aria-label={ar ? "تاريخ الأسبوع" : "Week date"}
                  value={p.date}
                  onChange={(e) => {
                    if (e.target.value) selectWeek(e.target.value);
                  }}
                />
              </label>
            )}
            <div className="p2-week-actions">
              <Button
                variant="outline"
                aria-label={ar ? "الأسبوع السابق" : "Previous week"}
                onClick={() => selectWeek(moveDay(p.date, -7))}
              >
                <ChevronLeft size={16} />
              </Button>
              <Button
                variant="outline"
                aria-label={ar ? "الأسبوع التالي" : "Next week"}
                onClick={() => selectWeek(moveDay(p.date, 7))}
              >
                <ChevronRight size={16} />
              </Button>
            </div>
            <Button
              variant="ghost"
              className="w-full"
              onClick={() => selectWeek(workforceDayKey(new Date(), p.timeZone ?? "Asia/Amman"))}
            >
              {ar ? "هذا الأسبوع" : "This week"}
            </Button>
          </div>
        </PickerSurface>
        <div className="p2-desktop-chips">
          <FilterChip
            ar={ar}
            label={ar ? "الموظف" : "Employee"}
            icon={UsersRound}
            value={p.employee}
            options={employeeOptions}
            onChange={p.onEmployee}
            searchable
          />
          <FilterChip
            ar={ar}
            label={ar ? "الدور" : "Role"}
            icon={BriefcaseBusiness}
            value={p.role}
            options={roleOptions}
            onChange={p.onRole}
          />
          <FilterChip
            ar={ar}
            label={ar ? "الحالة" : "Status"}
            icon={Clock3}
            value={p.status}
            options={p.statuses}
            onChange={p.onStatus}
          />
        </div>
        <FilterPanel
          ar={ar}
          open={open}
          onOpenChange={(next) => {
            if (next) {
              setPeriodOpen(false);
              setDraft(current());
            }
            setOpen(next);
          }}
          count={count}
          footer={
            <>
              <Button
                variant="ghost"
                onClick={() =>
                  setDraft({
                    employee: "all",
                    role: "all",
                    status: p.statuses[0]!.value,
                    from: "",
                    until: "",
                  })
                }
              >
                {ar ? "إعادة ضبط" : "Reset"}
              </Button>
              <Button disabled={invalid} onClick={apply}>
                {ar ? "تطبيق" : "Apply filters"}
              </Button>
            </>
          }
        >
          <h4>{ar ? "الفريق" : "People"}</h4>
          {(
            [
              { key: "employee", label: ar ? "الموظف" : "Employee", options: employeeOptions },
              { key: "role", label: ar ? "الدور" : "Role", options: roleOptions },
              { key: "status", label: ar ? "الحالة" : "Status", options: p.statuses },
            ] as const
          ).map((field) => (
            <label key={field.key} className="p2-field">
              {field.label}
              <select
                aria-label={field.label}
                value={draft[field.key]}
                onChange={(e) => setDraft({ ...draft, [field.key]: e.target.value })}
              >
                {field.options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <h4>{ar ? "الفترة" : "Period"}</h4>
          {mobile ? (
            <div className="p2-inline-calendar">
              <Calendar
                locale={ar ? arSA : enGB}
                mode="range"
                selected={
                  draft.from
                    ? {
                        from: new Date(`${draft.from}T12:00:00`),
                        to: draft.until ? new Date(`${draft.until}T12:00:00`) : undefined,
                      }
                    : undefined
                }
                onSelect={(range) =>
                  setDraft({
                    ...draft,
                    from: range?.from ? calendarDay(range.from) : "",
                    until: range?.to ? calendarDay(range.to) : "",
                  })
                }
              />
              <p className="p2-calendar-help">
                {ar
                  ? "اختر بداية الفترة ونهايتها، أو اتركها فارغة للأسبوع المحدد."
                  : "Select the start and end, or leave empty to use the selected week."}
              </p>
            </div>
          ) : (
            <div className="p2-date-grid">
              <label className="p2-field">
                {ar ? "من" : "From"}
                <input
                  aria-label={ar ? "من تاريخ" : "From date"}
                  type="date"
                  value={draft.from}
                  max={draft.until || undefined}
                  onChange={(e) => setDraft({ ...draft, from: e.target.value })}
                />
              </label>
              <label className="p2-field">
                {ar ? "حتى" : "Through"}
                <input
                  aria-label={ar ? "حتى تاريخ" : "Through date"}
                  type="date"
                  min={draft.from || undefined}
                  value={draft.until}
                  onChange={(e) => setDraft({ ...draft, until: e.target.value })}
                />
              </label>
            </div>
          )}

          {invalid && (
            <p role="alert" className="text-destructive">
              {ar
                ? "اختر تاريخين صالحين حتى 366 يوماً."
                : "Choose both dates in a valid range of up to 366 days."}
            </p>
          )}
        </FilterPanel>
        {p.action && (
          <div className={`p2-context-action ${p.actionMenu ? "p2-has-mobile-menu" : ""}`}>
            {p.action}
          </div>
        )}
        {p.actionMenu && (
          <div className="p2-mobile-action">
            <ActionMenu ar={ar} actions={p.actionMenu} />
          </div>
        )}
      </div>
      {count > 0 && (
        <div className="p2-active-filters">
          {p.employee !== "all" && (
            <button onClick={() => p.onEmployee("all")}>
              {employeeOptions.find((o) => o.value === p.employee)?.label}
              <X size={12} />
            </button>
          )}
          {p.role !== "all" && (
            <button onClick={() => p.onRole("all")}>
              {roleOptions.find((o) => o.value === p.role)?.label}
              <X size={12} />
            </button>
          )}
          {p.status !== p.statuses[0]?.value && (
            <button onClick={() => p.onStatus(p.statuses[0]!.value)}>
              {p.statuses.find((o) => o.value === p.status)?.label}
              <X size={12} />
            </button>
          )}
          {p.from && p.until && (
            <button
              onClick={() => {
                p.onFrom("");
                p.onUntil("");
              }}
            >
              {format(p.from)} – {format(p.until)}
              <X size={12} />
            </button>
          )}
          <button className="p2-clear" onClick={p.onReset}>
            {ar ? "مسح الكل" : "Clear all"}
          </button>
        </div>
      )}
    </section>
  );
}

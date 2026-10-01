import { type ReactNode } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { WorkforceButton as Button } from "./WorkforceButton";
import { Input } from "@/components/ui/input";
import { DetailSheet } from "@/components/operations/DetailSheet";
import { useIsMobile } from "@/hooks/use-mobile";
import type { Shift } from "@/hooks/useOperations";
import type { WorkforceMember } from "./WorkforceInsights";
export const localDay = (date: Date) => date.toLocaleDateString("en-CA");
export function moveDay(key: string, days: number) {
  const d = new Date(`${key}T12:00:00`);
  d.setDate(d.getDate() + days);
  return localDay(d);
}
export function weekOf(key: string) {
  const d = new Date(`${key}T12:00:00`);
  return Array.from({ length: 7 }, (_, i) => moveDay(key, i - d.getDay()));
}
export const timeLabel = (value: string | null | undefined, ar: boolean) =>
  value
    ? new Date(value).toLocaleTimeString(ar ? "ar-JO" : "en-US", {
        hour: "numeric",
        minute: "2-digit",
      })
    : "—";
export const hourLabel = (value: number, ar: boolean) =>
  `${Number(value.toFixed(1))}${ar ? "س" : "h"}`;
export function dateLabel(key: string, ar: boolean) {
  return new Date(`${key}T12:00:00`).toLocaleDateString(ar ? "ar-JO" : "en-US", {
    month: "short",
    day: "2-digit",
  });
}
export function shiftType(shift: Shift) {
  return (
    /Shift type: ([ABC])/.exec(shift.notes ?? "")?.[1] ?? /\b([ABC])\b/.exec(shift.name)?.[1] ?? "A"
  );
}
export function Person({ member }: { member: WorkforceMember }) {
  return (
    <span className="wf-person">
      <span className="wf-avatar">
        {member.name
          .split(" ")
          .map((v) => v[0])
          .slice(0, 2)
          .join("")}
      </span>
      <span>
        <strong>{member.name}</strong>
      </span>
    </span>
  );
}
export function Inspector({
  title,
  description,
  onClose,
  children,
  footer,
}: {
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const mobile = useIsMobile();
  if (mobile)
    return (
      <DetailSheet
        open
        onOpenChange={(v) => {
          if (!v) onClose();
        }}
        title={title}
        description={description}
        footer={footer}
      >
        {children}
      </DetailSheet>
    );
  return (
    <aside className="wf-inspector wf-panel">
      <header>
        <div>
          <h3>{title}</h3>
          {description ? <p>{description}</p> : null}
        </div>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label="Close details"
          onClick={onClose}
        >
          <X className="size-4" />
        </Button>
      </header>
      <div className="wf-inspector-body">{children}</div>
      {footer ? <footer>{footer}</footer> : null}
    </aside>
  );
}
export function WeekControl({
  date,
  onChange,
  ar,
}: {
  date: string;
  onChange: (d: string) => void;
  ar: boolean;
}) {
  const days = weekOf(date);
  return (
    <div className="wf-period">
      <Button
        size="icon"
        variant="outline"
        aria-label={ar ? "الأسبوع السابق" : "Previous week"}
        onClick={() => onChange(moveDay(date, -7))}
      >
        <ChevronLeft className="size-4" />
      </Button>
      <span>
        <CalendarDays className="size-4" />
        <strong>
          {dateLabel(days[0], ar)} – {dateLabel(days[6], ar)}, {days[0].slice(0, 4)}
        </strong>
      </span>
      <Button
        size="icon"
        variant="outline"
        aria-label={ar ? "الأسبوع القادم" : "Next week"}
        onClick={() => onChange(moveDay(date, 7))}
      >
        <ChevronRight className="size-4" />
      </Button>
      <Button variant="outline" onClick={() => onChange(localDay(new Date()))}>
        {ar ? "اليوم" : "Today"}
      </Button>
    </div>
  );
}
export function SearchField({
  value,
  onChange,
  ar,
}: {
  value: string;
  onChange: (v: string) => void;
  ar: boolean;
}) {
  return (
    <div className="wf-search">
      <Search className="size-4" />
      <Input
        aria-label={ar ? "البحث في الفريق" : "Search team"}
        placeholder={ar ? "البحث في الفريق…" : "Search team…"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

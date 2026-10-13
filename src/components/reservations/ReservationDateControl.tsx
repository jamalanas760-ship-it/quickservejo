import { arSA, enGB } from "date-fns/locale";
import { useState } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { CalendarDays } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { PickerSurface } from "@/components/app/PickerSurface";
export function ReservationDateControl({
  value,
  onChange,
  ar,
  emptyLabel,
  clearable = false,
  inlineMobile = false,
}: {
  value: string;
  onChange: (value: string) => void;
  ar: boolean;
  emptyLabel?: string;
  clearable?: boolean;
  inlineMobile?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const mobile = useIsMobile();
  const date = value ? new Date(`${value}T12:00:00`) : undefined;
  const content = (
    <>
      <Calendar
        locale={ar ? arSA : enGB}
        mode="single"
        selected={date}
        defaultMonth={date ?? new Date()}
        onSelect={(next) => {
          if (next) {
            onChange(
              `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`,
            );
            setOpen(false);
          }
        }}
      />
      {clearable ? (
        <Button
          type="button"
          variant="ghost"
          className="w-full min-h-11"
          onClick={() => {
            onChange("");
            setOpen(false);
          }}
        >
          {ar ? "كل التواريخ" : "All dates"}
        </Button>
      ) : null}
    </>
  );
  if (mobile && inlineMobile) return <div className="p2-inline-calendar">{content}</div>;
  return (
    <PickerSurface
      open={open}
      onOpenChange={setOpen}
      ar={ar}
      title={ar ? "اختر تاريخاً" : "Choose date"}
      trigger={
        <Button variant="outline" className="rs-date-control p2-chip">
          <CalendarDays className="size-4 shrink-0" />
          {date
            ? new Intl.DateTimeFormat(ar ? "ar-JO" : "en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              }).format(date)
            : (emptyLabel ?? (ar ? "اختر تاريخاً" : "Choose date"))}
        </Button>
      }
    >
      {content}
    </PickerSurface>
  );
}

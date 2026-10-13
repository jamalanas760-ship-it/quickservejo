import { PickerSurface } from "@/components/app/PickerSurface";
import { useIsMobile } from "@/hooks/use-mobile";
import { useState } from "react";
import { arSA, enGB } from "date-fns/locale";
import {
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ListFilter,
  Search,
} from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { FilterChip, FilterPanel } from "@/components/app/FilterChip";
import { ReservationDateControl } from "./ReservationDateControl";
import { addReservationDays, reservationDay } from "@/lib/reservation-studio";

export function ReservationsToolbar({
  ar,
  day,
  timeZone,
  status,
  search,
  counts,
  onDay,
  onStatus,
  onSearch,
}: {
  ar: boolean;
  day: string;
  timeZone: string;
  status: string;
  search: string;
  counts: Record<string, number>;
  onDay: (day: string) => void;
  onStatus: (status: string) => void;
  onSearch: (value: string) => void;
}) {
  const mobile = useIsMobile();
  const [dateOpen, setDateOpen] = useState(false),
    [filtersOpen, setFiltersOpen] = useState(false);
  const [month, setMonth] = useState(() => new Date(`${day}T12:00:00`));
  const [draftDay, setDraftDay] = useState(day),
    [draftStatus, setDraftStatus] = useState(status);
  const today = reservationDay(new Date(), timeZone);
  const selectedDate = new Date(`${day}T12:00:00`);
  const options = [
    { value: "all", label: ar ? "الكل" : "All" },
    { value: "upcoming", label: ar ? "قادمة" : "Upcoming" },
    { value: "seated", label: ar ? "جالسون" : "Seated" },
    { value: "pending", label: ar ? "معلقة" : "Pending" },
  ];
  const dateLabel = new Intl.DateTimeFormat(ar ? "ar-JO" : "en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(selectedDate);
  function changeDay(next: string) {
    onDay(next);
    setMonth(new Date(`${next}T12:00:00`));
  }
  return (
    <div className="rs-schedule-toolbar rs-phase-two-toolbar">
      <div className="p2-toolbar">
        <label className="p2-search">
          <Search size={17} aria-hidden="true" />
          <input
            aria-label={ar ? "بحث عن حجز" : "Search reservations"}
            placeholder={ar ? "اسم الضيف، الهاتف أو الرمز…" : "Guest, phone or code…"}
            value={search}
            onChange={(e) => onSearch(e.target.value)}
          />
        </label>
        <PickerSurface
          ar={ar}
          title={ar ? "تاريخ الجدول" : "Schedule date"}
          open={dateOpen}
          onOpenChange={(open) => {
            if (open) {
              setMonth(selectedDate);
              setFiltersOpen(false);
            }
            setDateOpen(open);
          }}
          trigger={
            <button
              type="button"
              className="p2-chip rs-phase-two-date"
              aria-label={`${ar ? "تاريخ الجدول" : "Schedule date"}: ${dateLabel}`}
            >
              <CalendarDays size={16} aria-hidden="true" />
              <span>{dateLabel}</span>
              <ChevronDown size={14} aria-hidden="true" />
            </button>
          }
        >
          <div className="rs-phase-two-calendar">
            {!mobile && (
              <label className="p2-field rs-phase-two-jump">
                {ar ? "انتقل إلى تاريخ" : "Jump to date"}
                <input
                  type="date"
                  aria-label={ar ? "انتقل إلى تاريخ" : "Jump to date"}
                  value={day}
                  onChange={(event) => {
                    if (event.target.value) changeDay(event.target.value);
                  }}
                />
              </label>
            )}
            <Calendar
              mode="single"
              selected={selectedDate}
              month={month}
              onMonthChange={setMonth}
              locale={ar ? arSA : enGB}
              onSelect={(date) => {
                if (date) {
                  changeDay(
                    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`,
                  );
                  setDateOpen(false);
                }
              }}
            />
            <div className="rs-phase-two-day-arrows">
              <Button
                variant="outline"
                aria-label={ar ? "اليوم السابق" : "Previous day"}
                onClick={() => changeDay(addReservationDays(day, -1))}
              >
                <ChevronLeft size={16} />
                <span>{ar ? "السابق" : "Previous day"}</span>
              </Button>
              <Button
                variant="outline"
                aria-label={ar ? "اليوم التالي" : "Next day"}
                onClick={() => changeDay(addReservationDays(day, 1))}
              >
                <span>{ar ? "التالي" : "Next day"}</span>
                <ChevronRight size={16} />
              </Button>
            </div>
            <Button
              variant="ghost"
              className="rs-phase-two-today"
              onClick={() => {
                changeDay(today);
                setDateOpen(false);
              }}
            >
              {ar ? "اليوم" : "Today"}
            </Button>
          </div>
        </PickerSurface>
        <div className="rs-phase-two-status">
          <FilterChip
            ar={ar}
            label={ar ? "الحالة" : "Status"}
            value={status}
            options={options}
            onChange={onStatus}
            icon={ListFilter}
          />
        </div>
        <FilterPanel
          ar={ar}
          open={filtersOpen}
          count={Number(day !== today) + Number(status !== "all")}
          onOpenChange={(open) => {
            if (open) {
              setDateOpen(false);
              setDraftDay(day);
              setDraftStatus(status);
            }
            setFiltersOpen(open);
          }}
          footer={
            <>
              <Button
                variant="ghost"
                onClick={() => {
                  setDraftDay(today);
                  setDraftStatus("all");
                }}
              >
                {ar ? "إعادة ضبط" : "Reset"}
              </Button>
              <Button
                disabled={!draftDay}
                onClick={() => {
                  changeDay(draftDay);
                  onStatus(draftStatus);
                  setFiltersOpen(false);
                }}
              >
                {ar ? "تطبيق" : "Apply filters"}
              </Button>
            </>
          }
        >
          <h4>{ar ? "تاريخ الجدول" : "Schedule date"}</h4>
          <ReservationDateControl inlineMobile value={draftDay} onChange={setDraftDay} ar={ar} />
          <label className="p2-field">
            {ar ? "حالة الحجز" : "Reservation status"}
            <select
              aria-label={ar ? "حالة الحجز" : "Reservation status"}
              value={draftStatus}
              onChange={(e) => setDraftStatus(e.target.value)}
            >
              {options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </FilterPanel>
      </div>
      <div
        className="rs-filters rs-phase-two-tabs"
        role="group"
        aria-label={ar ? "حالة الحجوزات" : "Reservation statuses"}
      >
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={status === option.value}
            onClick={() => onStatus(option.value)}
          >
            {option.label}
            <b>{counts[option.value] ?? 0}</b>
          </button>
        ))}
      </div>
    </div>
  );
}

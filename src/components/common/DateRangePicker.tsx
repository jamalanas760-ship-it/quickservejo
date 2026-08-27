import { useState } from "react";
import { CalendarDays } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useI18n } from "@/lib/i18n";
import { formatDate } from "@/lib/format";
import { rangeFromDates, rangeFromPreset, type DateRange, type RangePreset } from "@/lib/range";

const PRESETS: Exclude<RangePreset, "custom">[] = ["today", "7d", "30d", "90d"];

/** Preset + custom date-range control used by every reporting screen. */
export function DateRangePicker({
  value,
  onChange,
  className,
}: {
  value: DateRange;
  onChange: (range: DateRange) => void;
  className?: string;
}) {
  const { t, lang } = useI18n();
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={value.preset}
          onValueChange={(v) => {
            if (v === "custom") setOpen(true);
            else onChange(rangeFromPreset(v as Exclude<RangePreset, "custom">));
          }}
        >
          <SelectTrigger className="h-10 w-[10.5rem]" aria-label={t("range.label")}>
            <CalendarDays className="size-4 shrink-0 text-muted-foreground" />
            <SelectValue placeholder={t("range.label")} />
          </SelectTrigger>
          <SelectContent>
            {PRESETS.map((p) => (
              <SelectItem key={p} value={p}>
                {t(`range.${p}`)}
              </SelectItem>
            ))}
            <SelectItem value="custom">{t("range.custom")}</SelectItem>
          </SelectContent>
        </Select>

        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-10">
              {value.preset === "custom"
                ? `${formatDate(value.from, lang)} — ${formatDate(value.to, lang)}`
                : t("range.custom")}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 space-y-3" align="end">
            <div className="space-y-1.5">
              <Label htmlFor="range-from">{t("range.from")}</Label>
              <Input
                id="range-from"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="range-to">{t("range.to")}</Label>
              <Input id="range-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            <Button
              size="sm"
              className="w-full"
              disabled={!rangeFromDates(from, to)}
              onClick={() => {
                const next = rangeFromDates(from, to);
                if (next) {
                  onChange(next);
                  setOpen(false);
                }
              }}
            >
              {t("range.apply")}
            </Button>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}

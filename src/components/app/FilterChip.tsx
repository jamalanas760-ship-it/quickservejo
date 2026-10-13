import { useId, useState, type ElementType, type ReactNode } from "react";
import { ChevronDown, Search, SlidersHorizontal } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogTrigger,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useIsMobile } from "@/hooks/use-mobile";
export function FilterChip({
  label,
  value,
  options,
  onChange,
  icon: Icon,
  ar = false,
  searchable = false,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  icon: ElementType;
  ar?: boolean;
  searchable?: boolean;
}) {
  const [open, setOpen] = useState(false),
    [search, setSearch] = useState("");
  const selected = options.find((option) => option.value === value)?.label ?? value;
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        setSearch("");
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className="p2-chip"
          aria-label={`${label}: ${selected}`}
          title={`${label}: ${selected}`}
        >
          <Icon size={16} aria-hidden="true" />
          <span>
            {label} · {selected}
          </span>
          <ChevronDown size={14} aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="p2-choice" align="start" dir={ar ? "rtl" : "ltr"}>
        <strong>{label}</strong>
        {searchable && (
          <label className="p2-search">
            <Search size={16} />
            <input
              autoFocus
              aria-label={ar ? "بحث الخيارات" : "Search options"}
              placeholder={ar ? "بحث…" : "Search…"}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
        )}
        <div className="p2-options" role="group" aria-label={label}>
          {options
            .filter((option) => option.label.toLowerCase().includes(search.toLowerCase()))
            .map((option) => (
              <button
                type="button"
                key={option.value}
                aria-pressed={value === option.value}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
              >
                <span className="p2-radio" />
                {option.label}
              </button>
            ))}
        </div>
        {!options.some((option) => option.label.toLowerCase().includes(search.toLowerCase())) && (
          <p role="status">{ar ? "لا توجد نتائج" : "No matches"}</p>
        )}
      </PopoverContent>
    </Popover>
  );
}
export function FilterPanel({
  ar,
  open,
  onOpenChange,
  count = 0,
  children,
  footer,
}: {
  ar: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  count?: number;
  children: ReactNode;
  footer: ReactNode;
}) {
  const mobile = useIsMobile();
  const titleId = useId();
  const trigger = (
    <button type="button" className="p2-filter-trigger" aria-expanded={open}>
      <SlidersHorizontal size={16} />
      <span>{ar ? "الفلاتر" : "Filters"}</span>
      {count > 0 && <b>{count}</b>}
    </button>
  );
  const content = (
    <>
      <div className="p2-panel-body">{children}</div>
      <footer className="p2-panel-footer">{footer}</footer>
    </>
  );
  return mobile ? (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent
        className="p2-filter-sheet"
        dir={ar ? "rtl" : "ltr"}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          document.getElementById(titleId)?.focus({ preventScroll: true });
        }}
      >
        <DialogHeader>
          <DialogTitle id={titleId} tabIndex={-1}>
            {ar ? "الفلاتر" : "Filters"}
          </DialogTitle>
          <DialogDescription>
            {ar ? "اختر الفلاتر ثم اضغط تطبيق." : "Choose your filters, then apply."}
          </DialogDescription>
        </DialogHeader>
        {content}
      </DialogContent>
    </Dialog>
  ) : (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        className="p2-filter-panel"
        align="end"
        dir={ar ? "rtl" : "ltr"}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          document.getElementById(titleId)?.focus({ preventScroll: true });
        }}
      >
        <h3 id={titleId} tabIndex={-1}>
          {ar ? "الفلاتر" : "Filters"}
        </h3>
        {content}
      </PopoverContent>
    </Popover>
  );
}

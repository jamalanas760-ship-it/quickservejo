import { Minus, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
export function GuestCountPicker({
  value,
  onChange,
  min = 1,
  max = 100,
  ar,
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  ar: boolean;
}) {
  return (
    <div className="qs-guest-stepper">
      <button
        type="button"
        aria-label={ar ? "تقليل الضيوف" : "Fewer guests"}
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
      >
        <Minus className="size-4" />
      </button>
      <Input
        aria-label={ar ? "عدد الضيوف" : "Guest count"}
        type="number"
        min={min}
        max={max}
        inputMode="numeric"
        value={value || ""}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <button
        type="button"
        aria-label={ar ? "زيادة الضيوف" : "More guests"}
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
      >
        <Plus className="size-4" />
      </button>
    </div>
  );
}

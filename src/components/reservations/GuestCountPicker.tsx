import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function GuestCountPicker({ value, onChange, min = 1, max = 100, ar }: {
  value: number; onChange: (value: number) => void; min?: number; max?: number; ar: boolean;
}) {
  const counts = Array.from({ length: Math.max(0, Math.min(max, 100) - min + 1) }, (_, i) => min + i);
  return <Select value={String(value)} onValueChange={v => onChange(Number(v))}>
    <SelectTrigger aria-label={ar ? "عدد الضيوف" : "Guest count"}><SelectValue /></SelectTrigger>
    <SelectContent><SelectGroup>{counts.map(count => <SelectItem key={count} value={String(count)}>{count}</SelectItem>)}</SelectGroup></SelectContent>
  </Select>;
}

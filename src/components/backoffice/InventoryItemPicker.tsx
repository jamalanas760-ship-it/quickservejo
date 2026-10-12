import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { erpSelect, type InventoryBalance } from "@/lib/erp";
import { humanError } from "@/lib/errors";
import { useI18n } from "@/lib/i18n";

export function InventoryItemPicker({
  restaurantId,
  selected,
  onSelect,
}: {
  restaurantId: string;
  selected?: InventoryBalance | undefined;
  onSelect: (item: InventoryBalance) => void;
}) {
  const { lang } = useI18n();
  const ar = lang === "ar";
  const [text, setText] = useState("");
  const [term, setTerm] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setTerm(text.trim()), 300);
    return () => clearTimeout(timer);
  }, [text]);
  const items = useQuery({
    queryKey: ["inventory-item-search", restaurantId, term],
    queryFn: () =>
      erpSelect<InventoryBalance>("erp_inventory_balances", (q) =>
        q
          .select("id,name,unit,reorder_level,quantity")
          .eq("restaurant_id", restaurantId)
          .ilike("name", `%${term.replace(/[%_]/g, "")}%`)
          .order("name")
          .limit(50),
      ),
    staleTime: 10_000,
  });
  const choices = selected
    ? [selected, ...(items.data ?? []).filter((item) => item.id !== selected.id)]
    : (items.data ?? []);
  return (
    <div className="grid gap-2">
      <Input
        aria-label={ar ? "البحث عن مادة مخزون" : "Search inventory items"}
        placeholder={ar ? "ابحث باسم المادة…" : "Search by item name…"}
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      <select
        aria-label={ar ? "مادة المخزون" : "Inventory item"}
        name="item"
        required
        value={selected?.id ?? ""}
        disabled={items.isPending || text.trim() !== term}
        onChange={(event) => {
          const item = choices.find((item) => item.id === event.target.value);
          if (item) onSelect(item);
        }}
      >
        <option value="" disabled>
          {ar ? "اختر مادة" : "Choose an item"}
        </option>
        {choices.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name} · {item.quantity} {item.unit}
          </option>
        ))}
      </select>
      {items.isError ? (
        <p role="alert" className="text-xs text-destructive">
          {humanError(items.error, lang)}
        </p>
      ) : items.isPending ? (
        <p role="status" className="text-xs">
          {ar ? "جارٍ البحث…" : "Searching…"}
        </p>
      ) : !items.data.length ? (
        <p className="text-xs">{ar ? "لا توجد نتائج" : "No matching items"}</p>
      ) : (
        <p className="text-xs text-muted-foreground">
          {ar
            ? "أول 50 نتيجة؛ حدد الاسم للبحث الدقيق."
            : "First 50 matches; refine the name to find a specific item."}
        </p>
      )}
    </div>
  );
}

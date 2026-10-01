import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { humanError } from "@/lib/errors";
import { useI18n } from "@/lib/i18n";

type Station = {
  id: string;
  name: string;
  name_ar: string | null;
  display_order: number;
  is_active: boolean;
};
type PrinterRow = {
  id: string;
  name: string;
  purpose: string;
  provider: string;
  kitchen_station_id: string | null;
  is_active: boolean;
};
type MenuItem = {
  id: string;
  name_en: string;
  name_ar: string;
  kitchen_station_id: string | null;
  is_available: boolean;
};

export function KitchenConfigPanel({ restaurantId }: { restaurantId: string }) {
  const { lang } = useI18n();
  const ar = lang === "ar";
  const qc = useQueryClient();
  const [stationName, setStationName] = useState("");
  const [stationNameAr, setStationNameAr] = useState("");
  const [printerName, setPrinterName] = useState("");
  const [printerPurpose, setPrinterPurpose] = useState("kitchen");
  const [printerStation, setPrinterStation] = useState("");

  const query = useQuery({
    queryKey: ["kitchen-config", restaurantId],
    queryFn: async () => {
      const [stationsRes, printersRes, itemsRes] = await Promise.all([
        (supabase as any)
          .from("kitchen_stations")
          .select("id,name,name_ar,display_order,is_active")
          .eq("restaurant_id", restaurantId)
          .order("display_order")
          .order("name"),
        (supabase as any)
          .from("kitchen_printers")
          .select("id,name,purpose,provider,kitchen_station_id,is_active")
          .eq("restaurant_id", restaurantId)
          .order("name"),
        (supabase as any)
          .from("menu_items")
          .select("id,name_en,name_ar,kitchen_station_id,is_available")
          .eq("restaurant_id", restaurantId)
          .order("display_order")
          .order("name_en"),
      ]);
      for (const result of [stationsRes, printersRes, itemsRes])
        if (result.error) throw result.error;
      return {
        stations: (stationsRes.data ?? []) as Station[],
        printers: (printersRes.data ?? []) as PrinterRow[],
        items: (itemsRes.data ?? []) as MenuItem[],
      };
    },
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["kitchen-config", restaurantId] });

  const createStation = useMutation({
    mutationFn: async () => {
      const name = stationName.trim();
      if (!name) throw new Error(ar ? "اسم المحطة مطلوب" : "Station name is required");
      const { error } = await (supabase as any).from("kitchen_stations").insert({
        restaurant_id: restaurantId,
        name,
        name_ar: stationNameAr.trim() || null,
        display_order: (query.data?.stations.length ?? 0) * 10,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      setStationName("");
      setStationNameAr("");
      await refresh();
      toast.success(ar ? "تمت إضافة المحطة" : "Kitchen station added");
    },
    onError: (error) => toast.error(humanError(error, lang)),
  });

  const createPrinter = useMutation({
    mutationFn: async () => {
      const name = printerName.trim();
      if (!name) throw new Error(ar ? "اسم الطابعة مطلوب" : "Printer name is required");
      const { error } = await (supabase as any).from("kitchen_printers").insert({
        restaurant_id: restaurantId,
        name,
        purpose: printerPurpose,
        provider: "browser",
        kitchen_station_id: printerStation || null,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      setPrinterName("");
      setPrinterStation("");
      await refresh();
      toast.success(ar ? "تمت إضافة إعداد الطابعة" : "Printer configuration added");
    },
    onError: (error) => toast.error(humanError(error, lang)),
  });

  const stationMap = useMemo(
    () => new Map((query.data?.stations ?? []).map((station) => [station.id, station])),
    [query.data?.stations],
  );

  async function assignItem(itemId: string, stationId: string) {
    try {
      const { error } = await (supabase as any)
        .from("menu_items")
        .update({ kitchen_station_id: stationId || null })
        .eq("id", itemId)
        .eq("restaurant_id", restaurantId);
      if (error) throw error;
      await Promise.all([
        refresh(),
        qc.invalidateQueries({ queryKey: ["kitchen-menu-stations", restaurantId] }),
      ]);
    } catch (error) {
      toast.error(humanError(error, lang));
    }
  }

  async function removeStation(id: string) {
    try {
      const { error } = await (supabase as any)
        .from("kitchen_stations")
        .delete()
        .eq("id", id)
        .eq("restaurant_id", restaurantId);
      if (error) throw error;
      await refresh();
      toast.success(ar ? "تم حذف المحطة" : "Station removed");
    } catch (error) {
      toast.error(humanError(error, lang));
    }
  }

  async function removePrinter(id: string) {
    try {
      const { error } = await (supabase as any)
        .from("kitchen_printers")
        .delete()
        .eq("id", id)
        .eq("restaurant_id", restaurantId);
      if (error) throw error;
      await refresh();
      toast.success(ar ? "تم حذف إعداد الطابعة" : "Printer configuration removed");
    } catch (error) {
      toast.error(humanError(error, lang));
    }
  }

  if (query.isPending) return <Skeleton className="h-[520px] rounded-2xl" />;
  if (query.isError)
    return (
      <div role="alert" className="qs-card p-6 text-sm text-destructive">
        {humanError(query.error, lang)}
      </div>
    );

  return (
    <div className="bo-kitchen-workspace">
      <header className="bo-section-heading">
        <div>
          <h2>{ar ? "إعداد المطبخ" : "Kitchen setup"}</h2>
          <p>
            {ar
              ? "اضبط المحطات والطباعة وتوجيه الأصناف."
              : "Configure stations, printing and menu item routing."}
          </p>
        </div>
      </header>
      <section className="bo-panel">
        <header>
          <h2>{ar ? "محطات المطبخ" : "Kitchen stations"}</h2>
        </header>
        <div className="bo-kitchen-form">
          <Input
            aria-label={ar ? "اسم المحطة" : "Station name"}
            value={stationName}
            onChange={(e) => setStationName(e.target.value)}
            placeholder={ar ? "اسم المحطة" : "Station name"}
          />
          <Input
            aria-label={ar ? "الاسم بالعربية" : "Arabic name"}
            value={stationNameAr}
            onChange={(e) => setStationNameAr(e.target.value)}
            placeholder={ar ? "اسم عربي اختياري" : "Arabic name (optional)"}
          />
          <Button
            disabled={createStation.isPending || !stationName.trim()}
            onClick={() => createStation.mutate()}
          >
            <Plus size={15} />
            {ar ? "إضافة محطة" : "Add station"}
          </Button>
        </div>
        <div className="bo-table-scroll">
          <table className="bo-data-table">
            <thead>
              <tr>
                <th>{ar ? "المحطة" : "Station"}</th>
                <th>{ar ? "الحالة" : "Status"}</th>
                <th>{ar ? "الإجراءات" : "Actions"}</th>
              </tr>
            </thead>
            <tbody>
              {(query.data?.stations ?? []).map((station) => (
                <tr key={station.id}>
                  <td>
                    <strong>{ar ? station.name_ar || station.name : station.name}</strong>
                  </td>
                  <td>
                    {station.is_active ? (ar ? "فعالة" : "Active") : ar ? "غير فعالة" : "Inactive"}
                  </td>
                  <td>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={ar ? "حذف المحطة" : "Delete station"}
                      onClick={() => void removeStation(station.id)}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="bo-panel">
        <header>
          <h2>{ar ? "إعداد الطباعة" : "Printing stations"}</h2>
        </header>
        <div className="bo-kitchen-form">
          <Input
            aria-label={ar ? "اسم الطابعة" : "Printer name"}
            value={printerName}
            onChange={(e) => setPrinterName(e.target.value)}
            placeholder={ar ? "اسم الطابعة" : "Printer name"}
          />
          <div className="bo-field-grid">
            <select
              aria-label={ar ? "الغرض" : "Printer purpose"}
              value={printerPurpose}
              onChange={(e) => setPrinterPurpose(e.target.value)}
            >
              <option value="kitchen">{ar ? "مطبخ" : "Kitchen"}</option>
              <option value="cashier">{ar ? "كاشير" : "Cashier"}</option>
              <option value="receipt">{ar ? "إيصال" : "Receipt"}</option>
            </select>
            <select
              aria-label={ar ? "المحطة" : "Printer station"}
              value={printerStation}
              onChange={(e) => setPrinterStation(e.target.value)}
            >
              <option value="">{ar ? "كل المحطات" : "All stations"}</option>
              {(query.data?.stations ?? []).map((station) => (
                <option key={station.id} value={station.id}>
                  {ar ? station.name_ar || station.name : station.name}
                </option>
              ))}
            </select>
          </div>
          <Button
            disabled={createPrinter.isPending || !printerName.trim()}
            onClick={() => createPrinter.mutate()}
          >
            <Plus size={15} />
            {ar ? "إضافة طابعة" : "Add printer"}
          </Button>
        </div>
        <div className="bo-table-scroll">
          <table className="bo-data-table">
            <thead>
              <tr>
                <th>{ar ? "الطابعة" : "Printer"}</th>
                <th>{ar ? "المحطة" : "Station"}</th>
                <th>{ar ? "الإجراءات" : "Actions"}</th>
              </tr>
            </thead>
            <tbody>
              {(query.data?.printers ?? []).map((printer) => (
                <tr key={printer.id}>
                  <td>
                    <strong>{printer.name}</strong>
                    <small>
                      {printer.purpose} · {printer.provider}
                    </small>
                  </td>
                  <td>
                    {printer.kitchen_station_id
                      ? (stationMap.get(printer.kitchen_station_id)?.name ?? "—")
                      : ar
                        ? "كل المحطات"
                        : "All stations"}
                  </td>
                  <td>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={ar ? "حذف الطابعة" : "Delete printer"}
                      onClick={() => void removePrinter(printer.id)}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!query.data?.printers.length ? (
            <p className="bo-empty">{ar ? "لا طابعات بعد." : "No printers configured yet."}</p>
          ) : null}
        </div>
      </section>
      <section className="bo-panel bo-kitchen-routing">
        <header>
          <h2>{ar ? "توجيه أصناف القائمة" : "Menu item routing"}</h2>
          <span className="text-xs text-muted-foreground">
            {ar ? "يُحفظ التغيير تلقائياً" : "Changes save automatically"}
          </span>
        </header>
        <div className="bo-table-scroll">
          <table className="bo-data-table">
            <thead>
              <tr>
                <th>{ar ? "الصنف" : "Menu item"}</th>
                <th>{ar ? "الحالة" : "Status"}</th>
                <th>{ar ? "المحطة" : "Station"}</th>
              </tr>
            </thead>
            <tbody>
              {(query.data?.items ?? []).map((item) => (
                <tr key={item.id}>
                  <td>
                    <strong>
                      {ar ? item.name_ar || item.name_en : item.name_en || item.name_ar}
                    </strong>
                  </td>
                  <td>
                    {item.is_available
                      ? ar
                        ? "متوفر"
                        : "Available"
                      : ar
                        ? "غير متوفر"
                        : "Unavailable"}
                  </td>
                  <td>
                    <select
                      aria-label={`${ar ? "محطة" : "Station for"} ${ar ? item.name_ar || item.name_en : item.name_en || item.name_ar}`}
                      value={item.kitchen_station_id ?? ""}
                      onChange={(e) => void assignItem(item.id, e.target.value)}
                    >
                      <option value="">{ar ? "بدون محطة / عام" : "Unassigned / general"}</option>
                      {(query.data?.stations ?? []).map((station) => (
                        <option key={station.id} value={station.id}>
                          {ar ? station.name_ar || station.name : station.name}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

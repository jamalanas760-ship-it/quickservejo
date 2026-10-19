import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { humanError } from "@/lib/errors";
import {
  COMMON_HOLIDAYS,
  holidayOccurrences,
  type WorkforceHoliday,
} from "@/lib/workforce-holidays";
import { MasterPageHeader } from "@/components/app/MasterPage";
import { ActionMenu } from "@/components/app/ActionMenu";
import { Button } from "@/components/ui/button";

function useHolidays(restaurantId: string) {
  return useQuery({
    queryKey: ["workforce-holidays", restaurantId],
    queryFn: async () => {
      const rows: WorkforceHoliday[] = [];
      for (let offset = 0; ; offset += 500) {
        const { data, error } = await (supabase as any)
          .from("workforce_holidays")
          .select("id,name,holiday_date,annual")
          .eq("restaurant_id", restaurantId)
          .order("holiday_date")
          .order("id")
          .range(offset, offset + 499);
        if (error) throw error;
        rows.push(...data);
        if (data.length < 500) return rows;
      }
    },
  });
}
export function WorkforceHolidayNotice({
  restaurantId,
  date,
  ar,
}: {
  restaurantId: string;
  date: string;
  ar: boolean;
}) {
  const query = useHolidays(restaurantId);
  const names = holidayOccurrences(query.data ?? [], Number(date.slice(0, 4)))
    .filter((h) => h.date === date)
    .map((h) => h.name);
  if (!names.length) return null;
  return (
    <aside className="wf-holiday-notice">
      <CalendarDays aria-hidden="true" />
      <span>
        {ar ? "عطلة لجميع الموظفين" : "Workspace holiday"}: <strong>{names.join(" · ")}</strong>
      </span>
    </aside>
  );
}
export function WorkforceHolidays({
  restaurantId,
  today,
  canManage,
  ar,
}: {
  restaurantId: string;
  today: string;
  canManage: boolean;
  ar: boolean;
}) {
  const query = useHolidays(restaurantId),
    qc = useQueryClient();
  const [year, setYear] = useState(Number(today.slice(0, 4)));
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: "", date: today, annual: true });
  const records = holidayOccurrences(query.data ?? [], year);
  const save = useMutation({
    mutationFn: async (common: boolean) => {
      if (!canManage) throw new Error("Holiday management access required.");
      const rows = common
        ? COMMON_HOLIDAYS.filter(
            (h) => !records.some((r) => r.date === `${year}-${h.monthDay}` && r.name === h.name),
          ).map((h) => ({
            restaurant_id: restaurantId,
            name: h.name,
            holiday_date: `${year}-${h.monthDay}`,
            annual: true,
          }))
        : [
            {
              restaurant_id: restaurantId,
              name: form.name.trim(),
              holiday_date: form.date,
              annual: form.annual,
            },
          ];
      if (!rows.length) return;
      const { error } = await (supabase as any)
        .from("workforce_holidays")
        .upsert(rows, { onConflict: "restaurant_id,holiday_date,name", ignoreDuplicates: true });
      if (error) throw error;
    },
    onSuccess: async (_data, common) => {
      if (!common) setYear(Number(form.date.slice(0, 4)));
      await qc.invalidateQueries({ queryKey: ["workforce-holidays", restaurantId] });
      setEditing(false);
      toast.success(ar ? "تم حفظ العطلات" : "Holidays saved");
    },
    onError: (error) => toast.error(humanError(error, ar ? "ar" : "en")),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      if (!canManage) throw new Error("Holiday management access required.");
      const { error } = await (supabase as any)
        .from("workforce_holidays")
        .delete()
        .eq("restaurant_id", restaurantId)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["workforce-holidays", restaurantId] }),
    onError: (error) => toast.error(humanError(error, ar ? "ar" : "en")),
  });
  const busy = save.isPending || remove.isPending;
  return (
    <section className="wf-holiday-calendar">
      <MasterPageHeader
        title={ar ? "تقويم العطلات" : "Holiday calendar"}
        description={
          ar
            ? "عطلات مشتركة لجميع موظفي مساحة العمل."
            : "Shared holidays for everyone in this workspace."
        }
        actions={
          canManage ? (
            <>
              <Button onClick={() => setEditing(true)} disabled={busy}>
                <Plus className="size-4" />
                {ar ? "إضافة عطلة" : "Add holiday"}
              </Button>
              <ActionMenu
                ar={ar}
                actions={[
                  {
                    label: ar
                      ? "إضافة رأس السنة وعيد العمال والميلاد"
                      : "Add New Year, Labour Day & Christmas",
                    disabled: busy || query.isPending || !!query.error,
                    onSelect: () => save.mutate(true),
                  },
                ]}
              />
            </>
          ) : undefined
        }
      />
      <label className="wf-holiday-year">
        {ar ? "السنة" : "Year"}
        <select value={year} onChange={(event) => setYear(Number(event.target.value))}>
          {Array.from({ length: 201 }, (_, index) => 2200 - index).map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </label>
      {editing && canManage && (
        <form
          className="hr-panel hr-edit-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (!busy) save.mutate(false);
          }}
        >
          <fieldset disabled={busy} className="hr-form-grid">
            <label>
              {ar ? "نوع العطلة" : "Preset"}
              <select
                defaultValue=""
                onChange={(e) => {
                  const h = COMMON_HOLIDAYS.find((h) => h.name === e.target.value);
                  if (h) setForm({ name: h.name, date: `${year}-${h.monthDay}`, annual: true });
                }}
              >
                <option value="">{ar ? "تاريخ مخصص" : "Custom date"}</option>
                {COMMON_HOLIDAYS.map((h) => (
                  <option key={h.name}>{h.name}</option>
                ))}
              </select>
            </label>
            <label>
              {ar ? "الاسم" : "Name"}
              <input
                value={form.name}
                required
                minLength={2}
                maxLength={120}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </label>
            <label>
              {ar ? "التاريخ" : "Date"}
              <input
                type="date"
                min="2000-01-01"
                max="2200-12-31"
                value={form.date}
                required
                onChange={(e) => setForm({ ...form, date: e.target.value })}
              />
            </label>
            <label className="wf-holiday-repeat">
              <input
                type="checkbox"
                checked={form.annual}
                onChange={(e) => setForm({ ...form, annual: e.target.checked })}
              />
              {ar ? "تكرار كل سنة" : "Repeat every year"}
            </label>
          </fieldset>
          <div className="wf-holiday-form-actions">
            <Button type="submit" disabled={busy}>
              {ar ? "حفظ العطلة" : "Save holiday"}
            </Button>
            <Button type="button" variant="ghost" disabled={busy} onClick={() => setEditing(false)}>
              {ar ? "إلغاء" : "Cancel"}
            </Button>
          </div>
        </form>
      )}
      {query.isPending ? (
        <p role="status">{ar ? "جارٍ التحميل…" : "Loading holidays…"}</p>
      ) : query.error ? (
        <div role="alert">
          <p>{humanError(query.error, ar ? "ar" : "en")}</p>
          <Button variant="outline" onClick={() => void query.refetch()}>
            {ar ? "إعادة المحاولة" : "Retry"}
          </Button>
        </div>
      ) : records.length ? (
        <ul className="wf-holiday-list">
          {records.map((h) => (
            <li key={h.id}>
              <CalendarDays aria-hidden="true" />
              <div>
                <strong>{h.name}</strong>
                <span>
                  {h.date} · {h.annual ? (ar ? "سنوية" : "Annual") : ar ? "مرة واحدة" : "One-off"}
                </span>
              </div>
              {canManage && (
                <ActionMenu
                  ar={ar}
                  actions={[
                    {
                      label: ar ? "حذف من التقويم" : "Remove from calendar",
                      destructive: true,
                      disabled: busy,
                      onSelect: () => {
                        if (
                          window.confirm(
                            ar
                              ? "حذف هذه العطلة وتكرارها السنوي؟"
                              : "Remove this holiday and its annual recurrence?",
                          )
                        )
                          remove.mutate(h.id);
                      },
                    },
                  ]}
                />
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="hr-panel">
          {ar
            ? "لا توجد عطلات. يمكن للموارد البشرية إضافتها لجميع الموظفين."
            : "No holidays configured. HR can add dates for everyone."}
        </p>
      )}
      <p className="hr-caption">
        {ar
          ? "لا يغيّر هذا التقويم الورديات القائمة أو أرصدة الإجازة أو الرواتب تلقائياً."
          : "This calendar does not change existing shifts, leave balances or pay automatically."}
      </p>
    </section>
  );
}

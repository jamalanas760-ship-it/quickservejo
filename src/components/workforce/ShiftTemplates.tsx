import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ActionMenu } from "@/components/app/ActionMenu";
import { humanError } from "@/lib/errors";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Copy, Pencil, Trash2, Power } from "lucide-react";
export type ShiftTemplateValues = {
  name: string;
  start_time: string;
  end_time: string;
  notes: string;
  weekdays: number[];
};
type Template = ShiftTemplateValues & { id: string; is_active: boolean };
export function ShiftTemplates({
  restaurantId,
  values,
  ar,
  lang,
  onApply,
}: {
  restaurantId: string;
  values: ShiftTemplateValues;
  ar: boolean;
  lang: "en" | "ar";
  onApply: (template: ShiftTemplateValues) => void;
}) {
  const qc = useQueryClient();
  const [selected, setSelected] = useState("");
  const [managing, setManaging] = useState(false);
  const [saving, setSaving] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const key = ["shift-templates", restaurantId];
  const templates = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shift_templates" as never)
        .select("id,name,start_time,end_time,notes,weekdays,is_active")
        .eq("restaurant_id", restaurantId)
        .order("name");
      if (error) throw error;
      return data as unknown as Template[];
    },
  });
  const write = useMutation({
    mutationFn: async (input: {
      id?: string;
      duplicate?: boolean;
      remove?: boolean;
      active?: boolean;
    }) => {
      const row = templates.data?.find((row) => row.id === input.id);
      let error;
      if (input.remove && input.id)
        ({ error } = await supabase
          .from("shift_templates" as never)
          .delete()
          .eq("restaurant_id", restaurantId)
          .eq("id", input.id)
          .select("id")
          .single());
      else if (input.id && !input.duplicate)
        ({ error } = await supabase
          .from("shift_templates" as never)
          .update((input.active === undefined ? values : { is_active: input.active }) as never)
          .eq("restaurant_id", restaurantId)
          .eq("id", input.id)
          .select("id")
          .single());
      else
        ({ error } = await supabase
          .from("shift_templates" as never)
          .insert({
            restaurant_id: restaurantId,
            ...(input.duplicate && row
              ? {
                  name: (() => {
                    let n = 1;
                    let candidate = `${row.name.slice(0, 65)} (copy ${n})`;
                    while (
                      templates.data?.some((t) => t.name.toLowerCase() === candidate.toLowerCase())
                    )
                      candidate = `${row.name.slice(0, 65)} (copy ${++n})`;
                    return candidate;
                  })(),
                  start_time: row.start_time,
                  end_time: row.end_time,
                  notes: row.notes,
                  weekdays: row.weekdays,
                }
              : { ...values, name: templateName.trim() }),
          } as never)
          .select("id")
          .single());
      if (error) throw error;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: key });
      setSaving(false);
      toast.success(ar ? "تم حفظ القالب" : "Template saved");
    },
    onError: (error) => toast.error(humanError(error, lang)),
  });
  return (
    <section className="p2-shift-templates">
      <div className="p2-template-picker">
        <label>
          <span>{ar ? "قالب الوردية" : "Shift template"}</span>
          <select
            value={selected}
            disabled={templates.isPending || write.isPending}
            onChange={(event) => {
              const row = templates.data?.find((row) => row.id === event.target.value);
              setSelected(event.target.value);
              if (row?.is_active)
                onApply({
                  ...row,
                  start_time: row.start_time.slice(0, 5),
                  end_time: row.end_time.slice(0, 5),
                });
            }}
          >
            <option value="">{ar ? "إعداد مخصص" : "Custom shift"}</option>
            {(templates.data ?? [])
              .filter((row) => row.is_active)
              .map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name} · {row.start_time.slice(0, 5)}–{row.end_time.slice(0, 5)}
                </option>
              ))}
          </select>
        </label>
        <ActionMenu
          ar={ar}
          label={ar ? "خيارات القوالب" : "Template options"}
          actions={[
            {
              label: ar ? "حفظ النموذج كقالب" : "Save current as template",
              icon: Copy,
              disabled:
                write.isPending || !values.name.trim() || values.start_time === values.end_time,
              onSelect: () => {
                setTemplateName(values.name);
                setSaving(true);
              },
            },
            {
              label: ar ? "إدارة القوالب المحفوظة" : "Manage saved templates",
              icon: Pencil,
              onSelect: () => setManaging((value) => !value),
            },
          ]}
        />
      </div>
      <p className="p2-template-hint">
        {ar
          ? "القالب يملأ الأوقات والأيام؛ اختر التواريخ والفريق قبل الإنشاء."
          : "Templates fill times and weekdays. Choose dates and people before creating shifts."}
      </p>
      {templates.isPending ? (
        <p role="status">{ar ? "تحميل القوالب…" : "Loading templates…"}</p>
      ) : templates.isError ? (
        <div role="alert" className="text-sm">
          <p>
            {ar
              ? "تعذر تحميل القوالب. يمكنك إعداد الوردية يدوياً."
              : "Templates could not be loaded. You can still configure this shift manually."}
          </p>
          <Button variant="outline" onClick={() => templates.refetch()}>
            {ar ? "إعادة المحاولة" : "Retry"}
          </Button>
        </div>
      ) : (
        <div className="wf-template-grid" hidden={!managing}>
          {(templates.data ?? []).map((row) => (
            <div key={row.id} className="wf-template-card" aria-current={selected === row.id}>
              <button
                type="button"
                disabled={!row.is_active || write.isPending}
                onClick={() => {
                  setSelected(row.id);
                  onApply({
                    ...row,
                    start_time: row.start_time.slice(0, 5),
                    end_time: row.end_time.slice(0, 5),
                  });
                }}
              >
                <strong>
                  {row.name}
                  {!row.is_active ? (ar ? " · غير نشط" : " · Inactive") : ""}
                </strong>
                <small>
                  {row.start_time.slice(0, 5)}–{row.end_time.slice(0, 5)} · {row.weekdays.length}{" "}
                  {ar ? "أيام" : "days"}
                </small>
              </button>
              <ActionMenu
                ar={ar}
                label={`${ar ? "إدارة" : "Manage"} ${row.name}`}
                actions={[
                  {
                    label: ar ? "تحديث من النموذج الحالي" : "Update from current form",
                    icon: Pencil,
                    disabled: write.isPending,
                    onSelect: () => {
                      if (
                        confirm(
                          ar
                            ? "تحديث القالب من النموذج الحالي؟"
                            : "Replace this template with the current form values?",
                        )
                      )
                        write.mutate({ id: row.id });
                    },
                  },
                  {
                    label: ar ? "نسخ" : "Duplicate",
                    icon: Copy,
                    disabled: write.isPending,
                    onSelect: () => write.mutate({ id: row.id, duplicate: true }),
                  },
                  {
                    label: row.is_active
                      ? ar
                        ? "تعطيل"
                        : "Deactivate"
                      : ar
                        ? "تفعيل"
                        : "Activate",
                    icon: Power,
                    disabled: write.isPending,
                    onSelect: () => write.mutate({ id: row.id, active: !row.is_active }),
                  },
                  {
                    label: ar ? "حذف" : "Delete",
                    icon: Trash2,
                    destructive: true,
                    disabled: write.isPending,
                    onSelect: () => {
                      if (
                        confirm(
                          ar
                            ? "حذف القالب؟"
                            : "Delete this template? Existing shifts are preserved.",
                        )
                      )
                        write.mutate({ id: row.id, remove: true });
                    },
                  },
                ]}
              />
            </div>
          ))}
        </div>
      )}
      {!templates.isPending && !templates.isError && !templates.data?.length && (
        <p className="text-xs text-muted-foreground">
          {ar
            ? "لا توجد قوالب بعد. اضبط أوقات الخدمة واحفظها لإعادة استخدامها."
            : "No templates yet. Set your service times below and save them for reuse."}
        </p>
      )}
      <Dialog
        open={saving}
        onOpenChange={(value) => {
          if (!write.isPending) setSaving(value);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{ar ? "حفظ قالب وردية" : "Save shift template"}</DialogTitle>
            <DialogDescription>
              {ar
                ? "يحفظ الأوقات والأيام والملاحظات. اختر الموظفين والتواريخ عند التطبيق."
                : "Saves times, weekdays and notes. Choose employees and dates when applying it."}
            </DialogDescription>
          </DialogHeader>
          <label className="grid gap-2 text-sm">
            {ar ? "اسم القالب" : "Template name"}
            <Input
              autoFocus
              value={templateName}
              maxLength={80}
              onChange={(e) => setTemplateName(e.target.value)}
            />
          </label>
          <p className="text-sm">
            {values.start_time}–{values.end_time} · {values.weekdays.length} {ar ? "أيام" : "days"}
          </p>
          <DialogFooter>
            <Button variant="outline" disabled={write.isPending} onClick={() => setSaving(false)}>
              {ar ? "إلغاء" : "Cancel"}
            </Button>
            <Button
              disabled={
                write.isPending ||
                !templateName.trim() ||
                values.start_time === values.end_time ||
                !values.weekdays.length
              }
              onClick={() => write.mutate({})}
            >
              {write.isPending ? (ar ? "حفظ…" : "Saving…") : ar ? "حفظ القالب" : "Save template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

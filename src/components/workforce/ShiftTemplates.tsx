import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ActionMenu } from "@/components/app/ActionMenu";
import { humanError } from "@/lib/errors";
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
                  name: `${row.name} (copy)`,
                  start_time: row.start_time,
                  end_time: row.end_time,
                  notes: row.notes,
                  weekdays: row.weekdays,
                }
              : values),
          } as never)
          .select("id")
          .single());
      if (error) throw error;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: key });
      toast.success(ar ? "تم حفظ القالب" : "Template saved");
    },
    onError: (error) => toast.error(humanError(error, lang)),
  });
  return (
    <section className="rounded-xl border bg-muted/20 p-3 space-y-2">
      <label className="text-sm font-bold">
        {ar ? "قوالب الورديات المحفوظة" : "Saved shift templates"}
        <select
          className="mt-2 min-h-11 w-full rounded-lg border bg-card px-3"
          value={selected}
          onChange={(event) => {
            const id = event.target.value;
            setSelected(id);
            const row = templates.data?.find((row) => row.id === id);
            if (row)
              onApply({
                ...row,
                start_time: row.start_time.slice(0, 5),
                end_time: row.end_time.slice(0, 5),
              });
          }}
        >
          <option value="">{ar ? "اختيار قالب" : "Choose a template"}</option>
          {(templates.data ?? [])
            .filter((row) => row.is_active)
            .map((row) => (
              <option key={row.id} value={row.id}>
                {row.name} · {row.start_time.slice(0, 5)}–{row.end_time.slice(0, 5)}
              </option>
            ))}
        </select>
      </label>
      {templates.isError ? (
        <p role="alert" className="text-xs text-destructive">
          {humanError(templates.error, lang)}
        </p>
      ) : (
        <div className="flex items-center justify-between gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={
              write.isPending || !values.name.trim() || values.start_time === values.end_time
            }
            onClick={() => write.mutate({})}
          >
            {ar ? "حفظ كقالب جديد" : "Save as new template"}
          </Button>
          <ActionMenu
            ar={ar}
            actions={(templates.data ?? []).flatMap((row) => [
              {
                label: `${ar ? "تحديث" : "Update"} ${row.name}`,
                icon: Pencil,
                onSelect: () => {
                  if (
                    confirm(
                      ar
                        ? "تحديث القالب من النموذج الحالي؟ الورديات السابقة لن تتغير."
                        : "Update template from this form? Existing shifts will stay unchanged.",
                    )
                  )
                    write.mutate({ id: row.id });
                },
              },
              {
                label: `${ar ? "نسخ" : "Duplicate"} ${row.name}`,
                icon: Copy,
                onSelect: () => write.mutate({ id: row.id, duplicate: true }),
              },
              {
                label: `${row.is_active ? (ar ? "تعطيل" : "Deactivate") : ar ? "تفعيل" : "Activate"} ${row.name}`,
                icon: Power,
                onSelect: () => write.mutate({ id: row.id, active: !row.is_active }),
              },
              {
                label: `${ar ? "حذف" : "Delete"} ${row.name}`,
                icon: Trash2,
                destructive: true,
                onSelect: () => {
                  if (
                    confirm(
                      ar
                        ? "حذف القالب؟ تبقى الورديات المعينة محفوظة."
                        : "Delete template? Assigned shifts will be preserved.",
                    )
                  )
                    write.mutate({ id: row.id, remove: true });
                },
              },
            ])}
          />
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        {ar
          ? "القالب يملأ النموذج. راجع الجدول والموظفين قبل إنشاء الورديات."
          : "Templates fill this form. Review dates and employees before creating shifts."}
      </p>
    </section>
  );
}

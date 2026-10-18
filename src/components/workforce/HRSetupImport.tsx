import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { humanError } from "@/lib/errors";
import { HR_IMPORT_COLUMNS, parseHRSetupCsv } from "@/lib/hr-setup-import";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { HRStaff } from "./HRRecordViews";
export function HRSetupImport({
  open,
  onClose,
  restaurantId,
  staff,
  ar,
}: {
  open: boolean;
  onClose: () => void;
  restaurantId: string;
  staff: HRStaff[];
  ar: boolean;
}) {
  const qc = useQueryClient();
  const [rows, setRows] = useState<ReturnType<typeof parseHRSetupCsv>>([]),
    [error, setError] = useState("");
  const save = useMutation({
    mutationFn: async () => {
      const { data, error } = await (supabase as any).rpc("import_staff_hr_setups", {
        _restaurant_id: restaurantId,
        _rows: rows,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: async (data) => {
      await qc.invalidateQueries({ queryKey: ["employee-hr", restaurantId] });
      toast.success(
        ar ? `تم استيراد ${data.imported} موظف` : `${data.imported} employees imported`,
      );
      setRows([]);
      onClose();
    },
    onError: (e) => setError(humanError(e, ar ? "ar" : "en")),
  });
  const template = () => {
    const escape = (s: string) => `"${(/^[=+@-]/.test(s) ? "\'" + s : s).replaceAll('"', '""')}"`;
    const text = [
      HR_IMPORT_COLUMNS.join(","),
      ...staff.map((s) =>
        HR_IMPORT_COLUMNS.map((c) =>
          escape(c === "staff_id" ? s.id : c === "employee_name" ? s.name : ""),
        ).join(","),
      ),
    ].join("\r\n");
    const url = URL.createObjectURL(
      new Blob(["\uFEFF" + text], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "employee-hr-setup-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v && !save.isPending) onClose();
      }}
    >
      <DialogContent className="hr-edit-dialog" dir={ar ? "rtl" : "ltr"}>
        <DialogHeader>
          <DialogTitle>{ar ? "استيراد إعداد الموظفين" : "Import employee setup"}</DialogTitle>
          <DialogDescription>
            {ar
              ? "تنزيل القالب، تعبئة البيانات الفعلية في Excel، ثم حفظ CSV UTF-8."
              : "Download the template, enter actual records in Excel, then save as CSV UTF-8."}
          </DialogDescription>
        </DialogHeader>
        <div className="hr-edit-form">
          <Button variant="outline" onClick={template}>
            {ar ? "تنزيل قالب الموظفين" : "Download employee template"}
          </Button>
          <p className="hr-caption">
            {ar
              ? "حتى 200 موظف موجود في نطاقك. يتطلب كل صف راتباً وسياسة إجازات كاملة. تحفظ كل الصفوف معاً أو لا يحفظ أي منها."
              : "Up to 200 existing employees in your workspace. Each row requires a full salary and leave policy. All rows save together, or none do."}
          </p>
          <details>
            <summary>{ar ? "مساعدة الأعمدة" : "Column guide"}</summary>
            <p className="hr-caption">
              {ar
                ? "التواريخ: YYYY-MM-DD، شهر الراتب: YYYY-MM. البدلات والاستقطاعات: الوصف = المبلغ؛ افصل البنود بعلامة ; ."
                : "Dates: YYYY-MM-DD; payroll_start: YYYY-MM. Allowances/deductions: Description = amount; separate items with ; ."}{" "}
              salary_proration: full_month / calendar_days. annual_accrual, sick_accrual: daily /
              upfront. day_basis: calendar / workdays. workweek: 0–6, comma-separated.{" "}
              {ar
                ? "الأرصدة الافتتاحية تخص سنة البداية فقط ولا تشمل طلبات تلك السنة."
                : "Opening balances apply only to leave_start_year and exclude that year’s requests."}
            </p>
          </details>
          <label>
            {ar ? "ملف CSV" : "CSV file"}
            <input
              disabled={save.isPending}
              type="file"
              accept=".csv,text/csv"
              onChange={async (e) => {
                setRows([]);
                setError("");
                const file = e.target.files?.[0];
                if (!file) return;
                try {
                  if (file.size > 1000000) throw new Error("CSV must be smaller than 1 MB.");
                  setRows(parseHRSetupCsv(await file.text(), new Set(staff.map((s) => s.id))));
                } catch (error) {
                  setError(humanError(error, ar ? "ar" : "en"));
                }
              }}
            />
          </label>
          {error && (
            <p role="alert" className="hr-negative">
              {error}
            </p>
          )}
          {rows.length > 0 && (
            <>
              <p role="status">
                {ar
                  ? `${rows.length} موظف جاهز للاستيراد`
                  : `${rows.length} employees ready to import`}
              </p>
              <ul className="max-h-40 overflow-auto">
                {rows.map((r) => (
                  <li key={r.staff_id}>
                    {staff.find((s) => s.id === r.staff_id)?.name} · {r.employment.hired_on} ·{" "}
                    {r.setup.currency} {r.setup.income.reduce((n, i) => n + i.amount, 0).toFixed(3)}
                  </li>
                ))}
              </ul>
            </>
          )}
          <Button disabled={!rows.length || save.isPending} onClick={() => save.mutate()}>
            {save.isPending
              ? ar
                ? "جارٍ الاستيراد…"
                : "Importing…"
              : ar
                ? "تأكيد الاستيراد"
                : "Confirm import"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

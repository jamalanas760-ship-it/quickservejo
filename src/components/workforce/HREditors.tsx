import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { humanError } from "@/lib/errors";
import { type LeaveAccount, parsePayItems, payTotal } from "@/lib/employee-hr";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { EmploymentProfile, HRStaff, Payslip } from "./HRRecordViews";

type Editor = "employment" | "balances" | "payslip";
export function HREditor({
  kind,
  restaurantId,
  staff,
  profile,
  accounts,
  year,
  slip,
  currency,
  ar,
  onClose,
}: {
  kind: Editor;
  restaurantId: string;
  staff: HRStaff;
  profile: EmploymentProfile | undefined;
  accounts: LeaveAccount[];
  year: number;
  slip: Payslip | undefined;
  currency: string;
  ar: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [type, setType] = useState<"annual" | "sick">("annual");
  const [form, setForm] = useState<Record<string, string>>(() => {
    if (kind === "employment")
      return {
        employee_number: profile?.employee_number || "",
        department: profile?.department || "",
        job_title: profile?.job_title || "",
        hired_on: profile?.hired_on || "",
        ended_on: profile?.ended_on || "",
      };
    if (kind === "payslip")
      return {
        period:
          slip?.period.slice(0, 7) ||
          `${year}-${String(new Date().getMonth() + 1).padStart(2, "0")}`,
        payment_date: slip?.payment_date || "",
        currency: slip?.currency || currency,
        employee_name: slip?.employee_name || staff.name,
        employee_number: slip?.employee_number || profile?.employee_number || "",
        department: slip?.department || profile?.department || "",
        job_title: slip?.job_title || profile?.job_title || "",
        payment_method: slip?.payment_method || "",
        account_last_four: slip?.account_last_four || "",
        income: slip?.income.map((i) => `${i.label} = ${i.amount}`).join("\n") || "",
        deductions: slip?.deductions.map((i) => `${i.label} = ${i.amount}`).join("\n") || "",
        notes: slip?.notes || "",
        status: slip?.status || "draft",
      };
    return accountForm(
      accounts.find((a) => a.leave_type === "annual"),
      year,
    );
  });
  const change = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value }));
  const save = useMutation({
    mutationFn: async () => {
      const db = supabase as any;
      const scope = { staff_id: staff.id, restaurant_id: restaurantId };
      let result;
      if (kind === "employment")
        result = await db
          .from("staff_employment_profiles")
          .upsert(
            { ...scope, ...form, hired_on: form.hired_on || null, ended_on: form.ended_on || null },
            { onConflict: "staff_id" },
          )
          .select("staff_id")
          .single();
      else if (kind === "balances") {
        const n = (key: string) => {
          if (!form[key]?.trim() || !Number.isFinite(Number(form[key])))
            throw new Error(ar ? "أكمل جميع حقول السياسة." : "Complete all policy fields.");
          return Number(form[key]);
        };
        const workweek = form.workweek!.split(",").map(Number);
        if (!form.workweek?.trim() || workweek.some((d) => !Number.isInteger(d) || d < 0 || d > 6))
          throw new Error("Workweek uses comma-separated days: 0 Sunday through 6 Saturday.");
        result = await db
          .from("staff_leave_accounts")
          .upsert(
            {
              ...scope,
              year,
              leave_type: type,
              opening_days: n("opening_days"),
              entitlement_days: n("entitlement_days"),
              accrual_method: form.accrual_method,
              accrual_start: form.accrual_start,
              accrual_end: form.accrual_end,
              day_basis: form.day_basis,
              workweek: [...new Set(workweek)],
              hours_per_day: n("hours_per_day"),
            },
            { onConflict: "staff_id,year,leave_type" },
          )
          .select("id")
          .single();
      } else {
        const income = parsePayItems(form.income!),
          deductions = parsePayItems(form.deductions!);
        if (!income.length)
          throw new Error(ar ? "أضف بند دخل واحد على الأقل." : "Add at least one income item.");
        if (payTotal(deductions) > payTotal(income))
          throw new Error(ar ? "الاستقطاعات تتجاوز الدخل." : "Deductions exceed income.");
        if (form.status === "published" && !form.payment_date)
          throw new Error(
            ar ? "حدد تاريخ الدفع للنشر." : "Set the payment date before publishing.",
          );
        const payload = {
          ...scope,
          ...form,
          period: `${form.period}-01`,
          payment_date: form.payment_date || null,
          currency: form.currency?.toUpperCase(),
          income,
          deductions,
        };
        result = slip
          ? await db
              .from("staff_payslips")
              .update(payload)
              .eq("id", slip.id)
              .eq("restaurant_id", restaurantId)
              .select("id")
              .single()
          : await db.from("staff_payslips").insert(payload).select("id").single();
      }
      if (result.error) throw result.error;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["employee-hr", restaurantId] });
      toast.success(ar ? "تم الحفظ" : "Saved");
      onClose();
    },
    onError: (e) => toast.error(humanError(e, ar ? "ar" : "en")),
  });
  const totals = (() => {
    if (kind !== "payslip") return null;
    try {
      const income = payTotal(parsePayItems(form.income || ""));
      const deductions = payTotal(parsePayItems(form.deductions || ""));
      return { income, deductions, net: Math.round((income - deductions) * 1000) / 1000 };
    } catch {
      return null;
    }
  })();
  const field = (key: string, en: string, arabic: string, inputType = "text", required = false) => (
    <label key={key}>
      {ar ? arabic : en}
      <input
        type={inputType}
        value={form[key] || ""}
        onChange={(e) => change(key, e.target.value)}
        required={required}
        maxLength={key === "notes" ? 2000 : key === "employee_name" ? 200 : 120}
        {...(inputType === "number" ? { step: "0.0001" } : {})}
      />
    </label>
  );
  const select = (key: string, en: string, arabic: string, options: [string, string, string][]) => (
    <label>
      {ar ? arabic : en}
      <select required value={form[key] || ""} onChange={(e) => change(key, e.target.value)}>
        <option value="" disabled>
          {ar ? "اختر" : "Choose"}
        </option>
        {options.map(([v, e, a]) => (
          <option key={v} value={v}>
            {ar ? a : e}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !save.isPending) onClose();
      }}
    >
      <DialogContent className="hr-edit-dialog" dir={ar ? "rtl" : "ltr"}>
        <DialogHeader>
          <DialogTitle>
            {kind === "employment"
              ? ar
                ? "بيانات التوظيف"
                : "Employment details"
              : kind === "balances"
                ? ar
                  ? "سياسة رصيد الإجازات"
                  : "Leave balance policy"
                : ar
                  ? "قسيمة راتب"
                  : "Salary slip"}
          </DialogTitle>
          <DialogDescription>
            {staff.name} · {kind === "balances" ? year : ar ? "مساحة الموظف" : "Employee workspace"}
          </DialogDescription>
        </DialogHeader>
        <form
          className="hr-edit-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (!save.isPending) save.mutate();
          }}
        >
          <fieldset disabled={save.isPending}>
            {kind === "employment" ? (
              <>
                <div className="hr-form-grid">
                  {field("employee_number", "Employee ID", "رقم الموظف")}
                  {field("department", "Department", "القسم")}
                  {field("job_title", "Job title", "المسمى الوظيفي")}
                  {field("hired_on", "Employment start", "تاريخ بدء العمل", "date")}
                  {field("ended_on", "Employment end (optional)", "نهاية العمل (اختياري)", "date")}
                </div>
                <p className="hr-caption">
                  {ar
                    ? "مدة الخدمة تحسب من تاريخ التوظيف الفعلي، وليس تاريخ إنشاء الحساب."
                    : "Service period uses the actual employment start, never the account creation date."}
                </p>
              </>
            ) : kind === "balances" ? (
              <>
                <label>
                  {ar ? "نوع الإجازة" : "Leave type"}
                  <select
                    value={type}
                    onChange={(e) => {
                      const next = e.target.value as "annual" | "sick";
                      setType(next);
                      setForm(
                        accountForm(
                          accounts.find((a) => a.leave_type === next),
                          year,
                        ),
                      );
                    }}
                  >
                    <option value="annual">{ar ? "سنوية" : "Annual"}</option>
                    <option value="sick">{ar ? "مرضية" : "Sick"}</option>
                  </select>
                </label>
                <p className="hr-caption">
                  {ar
                    ? "احفظ سياسة كل نوع على حدة. لا توجد قيم قانونية مفترضة. الرصيد الافتتاحي لا يشمل طلبات السنة الحالية."
                    : "Save each leave type separately. No statutory entitlement is assumed. Opening balance excludes current-year requests."}
                </p>
                <div className="hr-form-grid">
                  {field(
                    "opening_days",
                    "Opening days (+ / −)",
                    "الرصيد الافتتاحي",
                    "number",
                    true,
                  )}
                  {field(
                    "entitlement_days",
                    "Entitlement for this accrual interval",
                    "استحقاق فترة التراكم",
                    "number",
                    true,
                  )}
                  {select("accrual_method", "Accrual method", "طريقة الاستحقاق", [
                    ["upfront", "Full grant on accrual start", "منح كامل في تاريخ البداية"],
                    ["daily", "Daily, over the configured interval", "يومي خلال الفترة المحددة"],
                  ])}
                  {select("day_basis", "Days deducted", "الأيام المخصومة", [
                    ["calendar", "Calendar days", "أيام تقويمية"],
                    ["workdays", "Configured working days", "أيام العمل المحددة"],
                  ])}
                  {field("accrual_start", "Accrual start", "بداية الاستحقاق", "date", true)}
                  {field("accrual_end", "Accrual end", "نهاية الاستحقاق", "date", true)}
                  {field(
                    "workweek",
                    "Working days (0=Sun … 6=Sat)",
                    "أيام العمل (0 أحد … 6 سبت)",
                    "text",
                    true,
                  )}
                  {field(
                    "hours_per_day",
                    "Hours per leave day",
                    "ساعات يوم الإجازة",
                    "number",
                    true,
                  )}
                </div>
                <p className="hr-caption">
                  {ar
                    ? "أدخل الاستحقاق المتفق عليه للفترة المحددة؛ لا يتم تقسيمه تلقائياً حسب مدة الخدمة. لا يخصم الطلب المعلق."
                    : "Enter the agreed entitlement for the configured interval; it is not automatically prorated for service. Pending requests do not consume balance."}
                </p>
              </>
            ) : (
              <>
                <div className="hr-form-grid">
                  {field("period", "Month and year", "الشهر والسنة", "month", true)}
                  {field("payment_date", "Payment date", "تاريخ الدفع", "date")}
                  {field("currency", "Currency (3 letters)", "العملة (3 أحرف)", "text", true)}
                  {field("employee_name", "Employee name", "اسم الموظف", "text", true)}
                  {field("employee_number", "Employee ID", "رقم الموظف")}
                  {field("department", "Department", "القسم")}
                  {field("job_title", "Job title", "المسمى")}
                  {field("payment_method", "Payment method", "طريقة الدفع")}
                  {field(
                    "account_last_four",
                    "Account last four digits only",
                    "آخر أربعة أرقام للحساب فقط",
                  )}
                  {select("status", "Visibility", "الظهور", [
                    ["draft", "Draft · managers only", "مسودة · المدير فقط"],
                    ["published", "Publish · visible to employee", "نشر · يظهر للموظف"],
                  ])}
                </div>
                <label>
                  {ar ? "بنود الدخل" : "Income items"}
                  <textarea
                    required
                    rows={4}
                    value={form.income}
                    onChange={(e) => change("income", e.target.value)}
                    placeholder={
                      ar
                        ? "الوصف = المبلغ (كل بند بسطر)"
                        : "Description = amount (one item per line)"
                    }
                  />
                </label>
                <label>
                  {ar ? "الاستقطاعات" : "Deduction items"}
                  <textarea
                    rows={3}
                    value={form.deductions}
                    onChange={(e) => change("deductions", e.target.value)}
                    placeholder={ar ? "الوصف = المبلغ" : "Description = amount"}
                  />
                </label>
                {totals && (
                  <dl className="hr-mini-summary" aria-live="polite">
                    <div>
                      <dt>{ar ? "إجمالي الدخل" : "Total income"}</dt>
                      <dd>{totals.income.toFixed(3)}</dd>
                    </div>
                    <div>
                      <dt>{ar ? "إجمالي الاستقطاعات" : "Total deductions"}</dt>
                      <dd>{totals.deductions.toFixed(3)}</dd>
                    </div>
                    <div>
                      <dt>
                        {ar ? "صافي الراتب" : "Net pay"} · {form.currency}
                      </dt>
                      <dd>{totals.net.toFixed(3)}</dd>
                    </div>
                  </dl>
                )}
                <label>
                  {ar ? "ملاحظات" : "Notes"}
                  <textarea
                    rows={2}
                    maxLength={2000}
                    value={form.notes}
                    onChange={(e) => change("notes", e.target.value)}
                  />
                </label>
                <p className="hr-caption">
                  {ar
                    ? "راجع جميع المبالغ قبل النشر. القسيمة المنشورة غير قابلة للتعديل. تاريخ الدفع معلومة مسجلة؛ النشر لا ينفذ تحويلاً مالياً."
                    : "Review all amounts before publishing. Published slips cannot be edited. Payment date is a recorded detail; publishing does not transfer money."}
                </p>
              </>
            )}
          </fieldset>
          <Button type="submit" disabled={save.isPending} aria-busy={save.isPending}>
            {save.isPending ? (ar ? "جارٍ الحفظ…" : "Saving…") : ar ? "حفظ" : "Save"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
function accountForm(a: LeaveAccount | undefined, year: number): Record<string, string> {
  return {
    opening_days: a ? String(a.opening_days) : "",
    entitlement_days: a ? String(a.entitlement_days) : "",
    accrual_method: a?.accrual_method || "",
    accrual_start: a?.accrual_start || `${year}-01-01`,
    accrual_end: a?.accrual_end || `${year}-12-31`,
    day_basis: a?.day_basis || "",
    workweek: a?.workweek.join(",") || "",
    hours_per_day: a ? String(a.hours_per_day) : "",
  };
}

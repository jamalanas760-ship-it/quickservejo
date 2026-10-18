import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, BriefcaseBusiness } from "lucide-react";
import { toast } from "sonner";
import { useAccess } from "@/hooks/useSession";
import { supabase } from "@/integrations/supabase/client";
import { humanError } from "@/lib/errors";
import { payTotal, servicePeriod, type PayItem } from "@/lib/employee-hr";
import { workforceDayKey } from "@/lib/workforce-hours";
import { Button } from "@/components/ui/button";
import type { EmploymentProfile } from "./HRRecordViews";
import "./employee-hr.css";
import "./hr-setup.css";

type RawItem = { label: string; amount: string };
export function EmployeeSetupPanel({
  restaurantId,
  staffId,
  ar,
  formId,
  hideSubmit = false,
}: {
  formId?: string;
  hideSubmit?: boolean;
  restaurantId: string;
  staffId: string;
  ar: boolean;
}) {
  const access = useAccess(),
    canManage = access.canFor(restaurantId, "manage_shifts");
  const query = useQuery({
    queryKey: ["employee-hr", restaurantId, staffId, "setup", canManage],
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const db = supabase as any;
      const [p, h, r] = await Promise.all([
        db
          .from("staff_employment_profiles")
          .select("staff_id,employee_number,department,job_title,hired_on,ended_on")
          .eq("restaurant_id", restaurantId)
          .eq("staff_id", staffId)
          .maybeSingle(),
        canManage
          ? db
              .from("staff_hr_setups")
              .select("*")
              .eq("restaurant_id", restaurantId)
              .eq("staff_id", staffId)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        db.from("restaurants").select("currency,timezone").eq("id", restaurantId).single(),
      ]);
      for (const result of [p, h, r]) if (result.error) throw result.error;
      return {
        profile: p.data as EmploymentProfile | null,
        setup: h.data,
        currency: r.data.currency || "JOD",
        timeZone: r.data.timezone || "Asia/Amman",
      };
    },
  });
  if (query.isPending)
    return (
      <p role="status" className="hr-caption">
        {ar ? "جارٍ تحميل إعداد الموظف…" : "Loading employee setup…"}
      </p>
    );
  if (query.error)
    return (
      <div role="alert">
        <p>{humanError(query.error, ar ? "ar" : "en")}</p>
        <Button variant="outline" onClick={() => void query.refetch()}>
          {ar ? "إعادة المحاولة" : "Retry"}
        </Button>
      </div>
    );
  return (
    <SetupForm
      key={`${staffId}-${query.data.setup?.updated_at || query.data.profile?.hired_on || "new"}`}
      restaurantId={restaurantId}
      staffId={staffId}
      ar={ar}
      canManage={canManage}
      hideSubmit={hideSubmit}
      {...(formId ? { formId } : {})}
      {...query.data}
    />
  );
}
function SetupForm({
  restaurantId,
  staffId,
  ar,
  canManage,
  profile,
  setup,
  currency,
  timeZone,
  formId,
  hideSubmit,
}: {
  formId?: string;
  hideSubmit: boolean;
  restaurantId: string;
  staffId: string;
  ar: boolean;
  canManage: boolean;
  profile: EmploymentProfile | null;
  setup: any;
  currency: string;
  timeZone: string;
}) {
  const qc = useQueryClient(),
    today = workforceDayKey(new Date(), timeZone),
    year = Number(today.slice(0, 4));
  const [employment, setEmployment] = useState({
    employee_number: profile?.employee_number || "",
    department: profile?.department || "",
    job_title: profile?.job_title || "",
    hired_on: profile?.hired_on || "",
    ended_on: profile?.ended_on || "",
  });
  const [payroll, setPayroll] = useState(Boolean(setup?.payroll_enabled)),
    [leave, setLeave] = useState(Boolean(setup?.leave_enabled));
  const raw = (items: PayItem[] | undefined, fallback: RawItem[]) =>
    items?.length ? items.map((i) => ({ label: i.label, amount: String(i.amount) })) : fallback;
  const [income, setIncome] = useState<RawItem[]>(
    raw(setup?.income, [{ label: ar ? "راتب أساسي" : "Basic salary", amount: "" }]),
  );
  const [deductions, setDeductions] = useState<RawItem[]>(raw(setup?.deductions, []));
  const [settings, setSettings] = useState<Record<string, string>>({
    currency: setup?.currency || currency,
    payroll_start: setup?.payroll_start?.slice(0, 7) || today.slice(0, 7),
    generate_day: String(setup?.generate_day || 1),
    salary_proration: setup?.salary_proration || "full_month",
    leave_start_year: String(setup?.leave_start_year || year),
    annual_days: setup ? String(setup.annual_days) : "",
    sick_days: setup ? String(setup.sick_days) : "",
    annual_opening: setup ? String(setup.annual_opening) : "",
    sick_opening: setup ? String(setup.sick_opening) : "",
    annual_accrual: setup?.annual_accrual || "daily",
    sick_accrual: setup?.sick_accrual || "daily",
    day_basis: setup?.day_basis || "calendar",
    workweek: setup ? setup.workweek.join(",") : "",
    hours_per_day: setup ? String(setup.hours_per_day) : "",
  });
  const change = (k: string, v: string) => setSettings((s) => ({ ...s, [k]: v }));
  const period = servicePeriod(
    employment.hired_on,
    employment.ended_on && employment.ended_on < today ? employment.ended_on : today,
  );
  const parse = (items: RawItem[]) =>
    items.map((i) => {
      const amount = Number(i.amount);
      if (
        !i.label.trim() ||
        !i.amount.trim() ||
        !Number.isFinite(amount) ||
        amount < 0 ||
        amount > 100000000 ||
        Math.abs(amount * 1000 - Math.round(amount * 1000)) > 0.000001
      )
        throw new Error(
          ar
            ? "أكمل بنود الراتب بمبالغ صحيحة حتى 3 منازل عشرية."
            : "Complete salary items with valid amounts of up to 3 decimal places.",
        );
      return { label: i.label.trim(), amount };
    });
  const save = useMutation({
    mutationFn: async () => {
      if ((payroll || leave) && !employment.hired_on)
        throw new Error(ar ? "حدد تاريخ التوظيف الفعلي." : "Set the real joining date.");
      const n = (k: string) => {
        const v = Number(settings[k]);
        if (!settings[k]?.trim() || !Number.isFinite(v))
          throw new Error(ar ? "أكمل سياسة الإجازات." : "Complete the leave policy fields.");
        return v;
      };
      const saveLeave =
        leave ||
        [
          "annual_days",
          "sick_days",
          "annual_opening",
          "sick_opening",
          "hours_per_day",
          "workweek",
        ].every((key) => settings[key]?.trim());
      const policyKeys = [
        "annual_days",
        "sick_days",
        "annual_opening",
        "sick_opening",
        "hours_per_day",
        "workweek",
      ];
      if (!leave && policyKeys.some((key) => settings[key]?.trim()) && !saveLeave)
        throw new Error(
          ar ? "أكمل سياسة الإجازات قبل حفظها." : "Complete the leave policy before saving it.",
        );
      const weekdays = saveLeave
        ? settings.workweek!.split(",").map((d) => {
            if (!d.trim()) throw new Error("Choose working weekdays.");
            return Number(d);
          })
        : [0];
      if (weekdays.some((n) => !Number.isInteger(n) || n < 0 || n > 6))
        throw new Error("Working days use 0 (Sunday) through 6 (Saturday).");
      const payload = {
        currency: settings.currency!.toUpperCase(),
        income:
          payroll || income.some((i) => i.amount.trim()) ? parse(income) : setup?.income || [],
        deductions:
          payroll || deductions.some((i) => i.amount.trim())
            ? parse(deductions)
            : setup?.deductions || [],
        payroll_enabled: payroll,
        payroll_start: `${settings.payroll_start}-01`,
        generate_day: Number(settings.generate_day),
        salary_proration: settings.salary_proration,
        leave_enabled: leave,
        leave_start_year: Number(settings.leave_start_year),
        annual_days: saveLeave ? n("annual_days") : setup?.annual_days || 0,
        sick_days: saveLeave ? n("sick_days") : setup?.sick_days || 0,
        annual_opening: saveLeave ? n("annual_opening") : setup?.annual_opening || 0,
        sick_opening: saveLeave ? n("sick_opening") : setup?.sick_opening || 0,
        annual_accrual: settings.annual_accrual,
        sick_accrual: settings.sick_accrual,
        day_basis: settings.day_basis,
        workweek: saveLeave ? [...new Set(weekdays)] : setup?.workweek || [0],
        hours_per_day: saveLeave ? n("hours_per_day") : setup?.hours_per_day || 1,
      };
      const { data, error } = await (supabase as any).rpc("save_staff_hr_setup", {
        _staff_id: staffId,
        _employment: employment,
        _setup: payload,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: async (data) => {
      await qc.invalidateQueries({ queryKey: ["employee-hr", restaurantId] });
      toast.success(
        ar
          ? `تم الحفظ · ${data.drafts_created} مسودات و${data.accounts_created} أرصدة جديدة`
          : `Setup saved · ${data.drafts_created} drafts and ${data.accounts_created} new leave accounts`,
      );
    },
    onError: (e) => toast.error(humanError(e, ar ? "ar" : "en")),
  });
  const field = (key: string, en: string, arabic: string, type = "text", required = true) => (
    <label>
      {ar ? arabic : en}
      <input
        type={type}
        value={settings[key]}
        required={
          required &&
          (["currency", "payroll_start", "generate_day"].includes(key) ? payroll : leave)
        }
        onChange={(e) => change(key, e.target.value)}
        {...(key === "generate_day"
          ? { min: 1, max: 28 }
          : key === "leave_start_year"
            ? { min: 2000, max: 2200 }
            : key === "annual_days" || key === "sick_days"
              ? { min: 0, max: 366 }
              : key.endsWith("_opening")
                ? { min: -10000, max: 10000 }
                : key === "hours_per_day"
                  ? { min: 0.01, max: 24 }
                  : key === "currency"
                    ? { maxLength: 3, pattern: "[A-Za-z]{3}" }
                    : key === "payroll_start"
                      ? { min: "2000-01", max: "2200-12" }
                      : {})}
        {...(type === "number"
          ? { step: key === "generate_day" || key === "leave_start_year" ? "1" : "0.0001" }
          : {})}
      />
    </label>
  );
  const select = (key: string, en: string, arabic: string, options: [string, string, string][]) => (
    <label>
      {ar ? arabic : en}
      <select value={settings[key]} onChange={(e) => change(key, e.target.value)}>
        {options.map(([v, en, arabic]) => (
          <option key={v} value={v}>
            {ar ? arabic : en}
          </option>
        ))}
      </select>
    </label>
  );
  const totalIncome = payTotal(
      income.map((i) => ({ label: i.label, amount: Number(i.amount) || 0 })),
    ),
    totalDeductions = payTotal(
      deductions.map((i) => ({ label: i.label, amount: Number(i.amount) || 0 })),
    );
  const itemEditor = (items: RawItem[], onChange: (items: RawItem[]) => void, deduct: boolean) => (
    <div className="hr-setup-items">
      <h4>
        {deduct
          ? ar
            ? "استقطاعات متكررة"
            : "Recurring deductions"
          : ar
            ? "الراتب والبدلات"
            : "Salary & allowances"}
      </h4>
      {items.map((item, index) => (
        <div className="hr-setup-pay-row" key={index}>
          <label>
            <span className="sr-only">{ar ? "الوصف" : "Description"}</span>
            <input
              required={payroll}
              maxLength={120}
              value={item.label}
              onChange={(e) =>
                onChange(items.map((i, n) => (n === index ? { ...i, label: e.target.value } : i)))
              }
            />
          </label>
          <label>
            <span className="sr-only">{ar ? "المبلغ" : "Amount"}</span>
            <input
              required={payroll}
              type="number"
              min={0}
              step="0.001"
              value={item.amount}
              placeholder="0.000"
              onChange={(e) =>
                onChange(items.map((i, n) => (n === index ? { ...i, amount: e.target.value } : i)))
              }
            />
          </label>
          <button
            type="button"
            aria-label={ar ? "إزالة البند" : "Remove item"}
            disabled={!deduct && items.length === 1}
            onClick={() => onChange(items.filter((_, n) => n !== index))}
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      ))}
      <button
        className="hr-setup-add"
        type="button"
        onClick={() => onChange([...items, { label: "", amount: "" }])}
      >
        <Plus className="size-4" />
        {deduct ? (ar ? "إضافة استقطاع" : "Add deduction") : ar ? "إضافة بدل" : "Add allowance"}
      </button>
    </div>
  );
  return (
    <form
      className="hr-setup-panel hr-setup-smart"
      id={formId}
      onInvalidCapture={(event) => {
        // Native form validation must reveal invalid fields inside closed disclosures.
        const input = event.target as HTMLElement;
        let parent = input.parentElement;
        while (parent && parent !== event.currentTarget) {
          if (parent instanceof HTMLDetailsElement) parent.open = true;
          parent = parent.parentElement;
        }
      }}
      onSubmit={(e) => {
        e.preventDefault();
        if (canManage && !save.isPending) save.mutate();
      }}
    >
      <details
        className="hr-panel hr-setup-employment"
        open={!profile?.hired_on ? true : undefined}
      >
        <summary>
          <span>
            <BriefcaseBusiness className="size-4" />
            {ar ? "بيانات التوظيف" : "Employment"}
          </span>
          <span className="hr-caption">
            {employment.hired_on || (ar ? "حدد تاريخ التوظيف" : "Set joining date")} ·{" "}
            {period ? `${period.years}y ${period.months}m ${period.days}d` : "—"}
          </span>
          <span className="hr-setup-edit-link">{ar ? "تعديل" : "Edit"}</span>
        </summary>
        <h3>
          <BriefcaseBusiness className="size-4" />
          {ar ? "بيانات التوظيف" : "Employment"}
        </h3>
        <fieldset disabled={!canManage || save.isPending}>
          <div className="hr-form-grid">
            {(["employee_number", "department", "job_title", "hired_on", "ended_on"] as const).map(
              (k, i) => (
                <label key={k}>
                  {ar
                    ? [
                        "رقم الموظف",
                        "القسم",
                        "المسمى الوظيفي",
                        "تاريخ التوظيف",
                        "نهاية العمل (اختياري)",
                      ][i]
                    : [
                        "Employee ID",
                        "Department",
                        "Job title",
                        "Joining date",
                        "Employment end (optional)",
                      ][i]}
                  <input
                    type={k.endsWith("_on") ? "date" : "text"}
                    maxLength={k === "employee_number" ? 80 : 120}
                    {...(k === "ended_on" && employment.hired_on
                      ? { min: employment.hired_on }
                      : {})}
                    required={k === "hired_on" && (payroll || leave)}
                    value={employment[k]}
                    onChange={(e) => setEmployment((p) => ({ ...p, [k]: e.target.value }))}
                  />
                </label>
              ),
            )}
          </div>
        </fieldset>
        <p className="hr-setup-service">
          {ar ? "مدة الخدمة" : "Service period"}{" "}
          <strong>
            {period
              ? `${period.years}y ${period.months}m ${period.days}d`
              : ar
                ? "حدد تاريخ التوظيف"
                : "Set joining date"}
          </strong>
        </p>
      </details>
      {canManage && (
        <>
          <div className="hr-setup-summary-grid">
            <details className="hr-panel hr-setup-summary-card">
              <summary>
                <span className="hr-setup-card-heading">
                  {ar ? "الراتب" : "Salary"}
                  <small>
                    {payroll
                      ? ar
                        ? "مسودات تلقائية"
                        : "Automatic drafts"
                      : ar
                        ? "متوقف"
                        : "Paused"}
                  </small>
                </span>
                <strong className="hr-setup-summary-value">
                  {income.some((i) => i.amount.trim())
                    ? `${(totalIncome - totalDeductions).toFixed(3)} ${settings.currency}`
                    : ar
                      ? "لم يُعد بعد"
                      : "Not configured"}
                </strong>
                <span className="hr-caption">{ar ? "صافي الراتب الشهري" : "Monthly net pay"}</span>
                <span className="hr-setup-summary-line">
                  {ar ? "الدخل" : "Income"} {totalIncome.toFixed(3)} ·{" "}
                  {ar ? "الاستقطاعات" : "Deductions"} {totalDeductions.toFixed(3)}
                </span>
                <span className="hr-setup-edit-link">{ar ? "تعديل الإعداد" : "Edit setup"}</span>
              </summary>
              <fieldset disabled={save.isPending}>
                <fieldset>
                  <details className="hr-setup-advanced">
                    <summary>
                      {ar ? "الجدول وإعدادات الراتب" : "Schedule & salary settings"}
                    </summary>
                    <div className="hr-form-grid">
                      {field("currency", "Currency", "العملة")}
                      {field("payroll_start", "First payroll month", "أول شهر راتب", "month")}
                      {field(
                        "generate_day",
                        "Generate on day of month (1–28)",
                        "يوم إنشاء المسودة (1–28)",
                        "number",
                      )}
                      {select("salary_proration", "Partial employment month", "شهر عمل جزئي", [
                        ["full_month", "Full monthly amounts", "مبالغ شهرية كاملة"],
                        [
                          "calendar_days",
                          "Prorate all recurring items by calendar days",
                          "تقسيم كل البنود حسب أيام العمل التقويمية",
                        ],
                      ])}
                    </div>
                  </details>
                  {itemEditor(income, setIncome, false)}
                  {itemEditor(deductions, setDeductions, true)}
                  <dl className="hr-setup-totals">
                    <div>
                      <dt>{ar ? "الدخل" : "Income"}</dt>
                      <dd>{totalIncome.toFixed(3)}</dd>
                    </div>
                    <div>
                      <dt>{ar ? "الاستقطاعات" : "Deductions"}</dt>
                      <dd>{totalDeductions.toFixed(3)}</dd>
                    </div>
                    <div>
                      <dt>
                        {ar ? "الصافي الشهري" : "Monthly net"} · {settings.currency}
                      </dt>
                      <dd>{(totalIncome - totalDeductions).toFixed(3)}</dd>
                    </div>
                  </dl>
                </fieldset>
              </fieldset>
            </details>
            <details className="hr-panel hr-setup-summary-card">
              <summary>
                <span className="hr-setup-card-heading">
                  {ar ? "الإجازات" : "Leave"}
                  <small>
                    {leave
                      ? ar
                        ? "استحقاق تلقائي"
                        : "Automatic accrual"
                      : ar
                        ? "متوقف"
                        : "Paused"}
                  </small>
                </span>
                <span className="hr-setup-leave-summary">
                  <span>
                    {ar ? "السنوية" : "Annual"}
                    <strong>{settings.annual_days || "—"}</strong>
                  </span>
                  <span>
                    {ar ? "المرضية" : "Sick"}
                    <strong>{settings.sick_days || "—"}</strong>
                  </span>
                </span>
                <span className="hr-caption">
                  {ar ? "أيام الاستحقاق لسنة كاملة" : "Entitlement days per full year"}
                </span>
                <span className="hr-setup-edit-link">{ar ? "تعديل الإعداد" : "Edit setup"}</span>
              </summary>
              <fieldset disabled={save.isPending}>
                <fieldset>
                  <div className="hr-form-grid">
                    {field("leave_start_year", "First policy year", "سنة بدء السياسة", "number")}
                    {field(
                      "annual_days",
                      "Annual entitlement per full year",
                      "استحقاق سنوي لسنة كاملة",
                      "number",
                    )}
                    {field(
                      "sick_days",
                      "Sick entitlement per full year",
                      "استحقاق مرضي لسنة كاملة",
                      "number",
                    )}
                  </div>
                  <details className="hr-setup-advanced">
                    <summary>
                      {ar
                        ? "الأرصدة الافتتاحية وتفاصيل السياسة"
                        : "Opening balances & policy details"}
                    </summary>
                    <div className="hr-form-grid">
                      {field(
                        "annual_opening",
                        "Annual opening days in first year",
                        "رصيد سنوي افتتاحي لسنة البداية",
                        "number",
                      )}
                      {field(
                        "sick_opening",
                        "Sick opening days in first year",
                        "رصيد مرضي افتتاحي لسنة البداية",
                        "number",
                      )}
                      {select("annual_accrual", "Annual accrual", "الاستحقاق السنوي", [
                        [
                          "daily",
                          "Daily · prorated employment year",
                          "يومي · حسب مدة الخدمة في السنة",
                        ],
                        [
                          "upfront",
                          "Full grant at employment/year start",
                          "منح كامل في بداية الخدمة/السنة",
                        ],
                      ])}
                      {select("sick_accrual", "Sick accrual", "الاستحقاق المرضي", [
                        [
                          "daily",
                          "Daily · prorated employment year",
                          "يومي · حسب مدة الخدمة في السنة",
                        ],
                        [
                          "upfront",
                          "Full grant at employment/year start",
                          "منح كامل في بداية الخدمة/السنة",
                        ],
                      ])}
                      {select("day_basis", "Deduct leave on", "خصم أيام الإجازة", [
                        ["calendar", "Calendar days", "الأيام التقويمية"],
                        ["workdays", "Working days only", "أيام العمل فقط"],
                      ])}
                      {field("workweek", "Workdays (0=Sun … 6=Sat)", "أيام العمل (0 أحد … 6 سبت)")}
                      {field("hours_per_day", "Hours per leave day", "ساعات يوم الإجازة", "number")}
                    </div>
                  </details>
                  <p className="hr-caption">
                    {ar
                      ? "الأرصدة الافتتاحية لا تشمل طلبات السنة المختارة. في السنوات التالية يبدأ الرصيد الافتتاحي بصفر؛ لا ترحيل تلقائي. تبقى حسابات الإجازة الموجودة كما هي."
                      : "Opening balances exclude requests in the selected year. Later years start with zero opening balance; no automatic carryover. Existing leave accounts are preserved."}
                  </p>
                </fieldset>
              </fieldset>
            </details>
          </div>
          <section className="hr-panel hr-setup-automation">
            <h3>{ar ? "الأتمتة" : "Automation"}</h3>
            <fieldset disabled={save.isPending}>
              <label className="hr-setup-toggle">
                <input
                  type="checkbox"
                  role="switch"
                  checked={payroll}
                  onChange={(e) => setPayroll(e.target.checked)}
                />
                <span>
                  {ar ? "إنشاء مسودة راتب شهرياً" : "Generate monthly salary drafts"}
                  <small>
                    {ar
                      ? "يراجع المدير قبل النشر؛ لا تحويل مالي."
                      : "Edit settings anytime. Manager reviews drafts before publishing."}
                  </small>
                </span>
              </label>
              <label className="hr-setup-toggle">
                <input
                  type="checkbox"
                  role="switch"
                  checked={leave}
                  onChange={(e) => setLeave(e.target.checked)}
                />
                <span>
                  {ar
                    ? "تجديد سياسة الإجازات سنوياً"
                    : "Create leave accounts automatically each year"}
                  <small>
                    {ar
                      ? "يتحدث الرصيد من الطلبات المعتمدة."
                      : "Edit settings anytime. Balances update from approved requests."}
                  </small>
                </span>
              </label>
            </fieldset>
            <p className="hr-caption">
              {ar
                ? "يتطلب نشر مسودات الراتب مراجعة المدير. التغييرات تؤثر على السجلات الجديدة فقط."
                : "Salary drafts need manager review before publishing. Changes apply to newly generated records only."}
            </p>
          </section>
          {!hideSubmit && (
            <>
              <Button type="submit" disabled={save.isPending} aria-busy={save.isPending}>
                {save.isPending
                  ? ar
                    ? "جارٍ الحفظ…"
                    : "Saving…"
                  : ar
                    ? "حفظ الإعداد"
                    : "Save setup"}
              </Button>
            </>
          )}
        </>
      )}
    </form>
  );
}

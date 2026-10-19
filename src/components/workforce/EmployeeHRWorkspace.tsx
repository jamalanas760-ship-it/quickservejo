import { ROLE_LABELS, type AppRole } from "@/lib/permissions";
import { toast } from "sonner";
import { EmployeeSetupPanel } from "./EmployeeSetupPanel";
import { HRSetupImport } from "./HRSetupImport";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowUpRight,
  CalendarDays,
  FileText,
  HeartPulse,
  UserRound,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { humanError } from "@/lib/errors";
import {
  type LeaveAccount,
  type LeaveRecord,
  leaveBalance,
  servicePeriod,
  daysText,
} from "@/lib/employee-hr";
import { workforceDayKey, workforceDayStart } from "@/lib/workforce-hours";
import { MasterPageHeader } from "@/components/app/MasterPage";
import { ActionMenu } from "@/components/app/ActionMenu";
import { Button } from "@/components/ui/button";
import { HREditor } from "./HREditors";
import {
  AttendanceHistory,
  BalanceCards,
  EmptyHR,
  LeaveLedger,
  RequestHistory,
  SalarySlips,
  type AttendanceRecord,
  type EmploymentProfile,
  type HRRequest,
  type HRStaff,
  type Payslip,
} from "./HRRecordViews";
import "./employee-hr.css";

type Tab = "overview" | "leave" | "attendance" | "requests" | "payslips";
/** Explicit columns and paginated reads avoid silently losing records at the API row limit. */
async function allRows(build: () => any) {
  const rows: any[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await build().range(offset, offset + 499);
    if (error) throw error;
    rows.push(...data);
    if (data.length < 500) return rows;
  }
}
export function EmployeeHRWorkspace({
  restaurantId,
  currentStaffId,
  canManage,
  ar,
  timeZone,
  currency,
  onRequestLeave,
  selectedTab,
  onTabChange,
  hrMode = false,
}: {
  hrMode?: boolean;
  selectedTab?: Tab;
  onTabChange?: (tab: Tab) => void;
  restaurantId: string;
  currentStaffId: string;
  canManage: boolean;
  ar: boolean;
  timeZone: string;
  currency: string;
  onRequestLeave: () => void;
}) {
  const today = workforceDayKey(new Date(), timeZone);
  const qc = useQueryClient();
  const [setupOpen, setSetupOpen] = useState(false),
    [importOpen, setImportOpen] = useState(false);
  const generate = useMutation({
    mutationFn: async () => {
      const { data, error } = await (supabase as any).rpc("generate_hr_drafts", {
        _restaurant_id: restaurantId,
        _period: `${month}-01`,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: async (data) => {
      await qc.invalidateQueries({ queryKey: ["employee-hr", restaurantId] });
      toast.success(
        ar
          ? `تم إنشاء ${data.drafts_created} مسودة و${data.accounts_created} أرصدة`
          : `${data.drafts_created} drafts and ${data.accounts_created} leave accounts created`,
      );
    },
    onError: (e) => toast.error(humanError(e, ar ? "ar" : "en")),
  });
  const [year, setYear] = useState(Number(today.slice(0, 4))),
    [month, setMonth] = useState(today.slice(0, 7));
  const [scope, setScope] = useState<"self" | "team">(hrMode && canManage ? "team" : "self"),
    [selected, setSelected] = useState<string | null>(null),
    [internalTab, setInternalTab] = useState<Tab>("overview");
  const tab = selectedTab ?? internalTab;
  const setTab = (value: Tab) => {
    setInternalTab(value);
    onTabChange?.(value);
  };
  const [search, setSearch] = useState(""),
    [department, setDepartment] = useState("all");
  const [editor, setEditor] = useState<"employment" | "balances" | "payslip" | null>(null),
    [editSlip, setEditSlip] = useState<Payslip | undefined>();
  const team = canManage && scope === "team";
  const staffId = team ? selected : currentStaffId;
  const db = supabase as any;
  const directory = useQuery({
    queryKey: [
      "employee-hr",
      restaurantId,
      currentStaffId,
      team ? "team" : "self",
      "directory",
      year,
    ],
    queryFn: async () => {
      const filter = (q: any) => (team ? q : q.eq("staff_id", currentStaffId));
      const [staff, profiles, accounts] = await Promise.all([
        allRows(() => {
          const q = db
            .from("staff")
            .select("id,name,role")
            .eq("restaurant_id", restaurantId)
            .order("id");
          return team ? q : q.eq("id", currentStaffId);
        }),
        allRows(() =>
          filter(
            db
              .from("staff_employment_profiles")
              .select("staff_id,employee_number,department,job_title,hired_on,ended_on")
              .eq("restaurant_id", restaurantId)
              .order("staff_id"),
          ),
        ),
        allRows(() =>
          filter(
            db
              .from("staff_leave_accounts")
              .select(
                "staff_id,year,leave_type,opening_days,entitlement_days,accrual_method,accrual_start,accrual_end,day_basis,workweek,hours_per_day",
              )
              .eq("restaurant_id", restaurantId)
              .eq("year", year)
              .order("id"),
          ),
        ),
      ]);
      return {
        staff: staff as HRStaff[],
        profiles: profiles as EmploymentProfile[],
        accounts: accounts as LeaveAccount[],
      };
    },
    refetchInterval: 60000,
  });
  const leaves = useQuery({
    queryKey: ["employee-hr", restaurantId, currentStaffId, team ? "team" : "self", "leaves", year],
    queryFn: () =>
      allRows(() => {
        let q = db
          .from("staff_leave_requests")
          .select(
            "id,staff_id,leave_type,start_date,end_date,start_time,end_time,status,reason,created_at,review_note",
          )
          .eq("restaurant_id", restaurantId)
          .lte("start_date", `${year}-12-31`)
          .gte("end_date", `${year}-01-01`)
          .order("id");
        if (!team) q = q.eq("staff_id", currentStaffId);
        return q;
      }),
    refetchInterval: 20000,
  });
  const records = useQuery({
    queryKey: [
      "employee-hr",
      restaurantId,
      currentStaffId,
      staffId,
      "records",
      year,
      month,
      timeZone,
    ],
    enabled: !!staffId,
    queryFn: async () => {
      const nextMonth = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 1))
        .toISOString()
        .slice(0, 10);
      const [attendance, permissions, missing, slips] = await Promise.all([
        allRows(() =>
          db
            .from("staff_time_entries")
            .select("id,staff_id,clock_in,clock_out,break_minutes,review_status")
            .eq("restaurant_id", restaurantId)
            .eq("staff_id", staffId)
            .gte("clock_in", new Date(workforceDayStart(`${month}-01`, timeZone)).toISOString())
            .lt("clock_in", new Date(workforceDayStart(nextMonth, timeZone)).toISOString())
            .order("clock_in", { ascending: false })
            .order("id"),
        ),
        allRows(() =>
          db
            .from("staff_permission_requests")
            .select("id,staff_id,permission_type,request_date,reason,status,review_note")
            .eq("restaurant_id", restaurantId)
            .eq("staff_id", staffId)
            .gte("request_date", `${year}-01-01`)
            .lte("request_date", `${year}-12-31`)
            .order("id"),
        ),
        allRows(() =>
          db
            .from("staff_missing_punch_requests")
            .select("id,staff_id,clock_in,clock_out,reason,status,review_note")
            .eq("restaurant_id", restaurantId)
            .eq("staff_id", staffId)
            .gte("clock_in", new Date(workforceDayStart(`${year}-01-01`, timeZone)).toISOString())
            .lt(
              "clock_in",
              new Date(workforceDayStart(`${year + 1}-01-01`, timeZone)).toISOString(),
            )
            .order("id"),
        ),
        allRows(() =>
          db
            .from("staff_payslips")
            .select(
              "id,staff_id,period,payment_date,currency,employee_name,employee_number,department,job_title,payment_method,account_last_four,income,deductions,total_income,total_deductions,net_pay,status,notes",
            )
            .eq("restaurant_id", restaurantId)
            .eq("staff_id", staffId)
            .gte("period", `${year}-01-01`)
            .lte("period", `${year}-12-01`)
            .order("period", { ascending: false })
            .order("id"),
        ),
      ]);
      return {
        attendance: attendance as AttendanceRecord[],
        permissions,
        missing,
        slips: slips as Payslip[],
      };
    },
    refetchInterval: 20000,
  });
  const people = directory.data?.staff ?? [],
    profiles = directory.data?.profiles ?? [],
    accounts = directory.data?.accounts ?? [];
  const staff = people.find((s) => s.id === staffId),
    profile = profiles.find((p) => p.staff_id === staffId);
  const personAccounts = accounts.filter((a) => a.staff_id === staffId),
    personLeaves = (leaves.data ?? []).filter((l) => l.staff_id === staffId) as LeaveRecord[];
  const period = (p: EmploymentProfile | undefined) => {
    const result = servicePeriod(
      p?.hired_on,
      p?.ended_on && p.ended_on < today ? p.ended_on : today,
    );
    return result
      ? `${result.years}${ar ? " سنة" : "y"} ${result.months}${ar ? " شهر" : "m"} ${result.days}${ar ? " يوم" : "d"}`
      : ar
        ? "تاريخ التوظيف غير محدد"
        : "Employment start not set";
  };
  const tabs: [Tab, string][] = [
    ["overview", ar ? "نظرة عامة" : "Overview"],
    ["leave", ar ? "حركات الإجازات" : "Leave transactions"],
    ["attendance", ar ? "الحضور" : "Attendance"],
    ["requests", ar ? "الطلبات" : "Requests"],
    ["payslips", ar ? "قسائم الراتب" : "Payslips"],
  ];
  const requestRows: HRRequest[] = [
    ...personLeaves.map((l) => ({
      id: l.id,
      staff_id: l.staff_id,
      kind: l.leave_type,
      date: l.start_date,
      end_date: l.end_date,
      reason: l.reason || "",
      status: l.status,
      review_note: (l as any).review_note,
    })),
    ...(records.data?.permissions ?? []).map((p) => ({
      ...p,
      kind: "permission",
      date: p.request_date,
    })),
    ...(records.data?.missing ?? []).map((p) => ({
      ...p,
      kind: "missing_punch",
      date: workforceDayKey(new Date(p.clock_in), timeZone),
    })),
  ].sort((a, b) => b.date.localeCompare(a.date));
  const openEditor = (kind: typeof editor, slip?: Payslip) => {
    setEditSlip(slip);
    setEditor(kind);
  };
  const error = directory.error || leaves.error || (staffId && records.error);
  const loading = directory.isPending || leaves.isPending || (staffId && records.isPending);
  return (
    <section className="hr-workspace" dir={ar ? "rtl" : "ltr"}>
      {canManage && (
        <div
          className="hr-tabs hr-scope"
          role="group"
          aria-label={ar ? "نطاق العرض" : "Workspace scope"}
        >
          <button
            type="button"
            aria-pressed={!team}
            onClick={() => {
              setScope("self");
              setSelected(null);
              setTab("overview");
            }}
          >
            {ar ? "مساحتي" : "My workspace"}
          </button>
          <button
            type="button"
            aria-pressed={team}
            onClick={() => {
              setScope("team");
              setSelected(null);
              setTab("overview");
            }}
          >
            {hrMode ? (ar ? "إدارة الموارد البشرية" : "HR console") : ar ? "الفريق" : "Team view"}
          </button>
        </div>
      )}
      <MasterPageHeader
        title={
          team
            ? hrMode
              ? ar
                ? "الموارد البشرية"
                : "HR workspace"
              : ar
                ? "مساحة الفريق"
                : "Team workspace"
            : ar
              ? "مساحتي"
              : "My workspace"
        }
        description={
          team
            ? ar
              ? "بيانات موظفي نطاقك المصرح فقط."
              : "Employee records within your authorized workspace."
            : ar
              ? "وقتك وإجازاتك وراتبك في مكان واحد."
              : "Your time, leave and pay in one place."
        }
        actions={
          team ? (
            <>
              <Button onClick={() => generate.mutate()} disabled={generate.isPending}>
                {ar ? "إنشاء المسودات" : "Generate drafts"}
              </Button>
              <ActionMenu
                ar={ar}
                actions={[
                  {
                    label: ar ? "استيراد إعداد الموظفين" : "Import employee setup",
                    onSelect: () => setImportOpen(true),
                  },
                  { label: ar ? "طلب إجازتي" : "Request my leave", onSelect: onRequestLeave },
                ]}
              />
            </>
          ) : (
            <Button onClick={onRequestLeave}>
              <CalendarDays className="size-4" />
              {ar ? "طلب إجازة" : "Request leave"}
            </Button>
          )
        }
      />
      <div className="hr-toolbar hr-top-toolbar">
        {team && (
          <label>
            {ar ? "شهر الراتب" : "Payroll month"}
            <input
              type="month"
              value={month}
              min="2000-01"
              max={today.slice(0, 7)}
              onChange={(e) => {
                if (e.target.value) {
                  setMonth(e.target.value);
                  setYear(Number(e.target.value.slice(0, 4)));
                }
              }}
            />
          </label>
        )}
        <label>
          {ar ? "السنة" : "Year"}
          <select
            value={year}
            onChange={(e) => {
              const next = Number(e.target.value);
              setYear(next);
              setMonth(`${next}-${month.slice(5, 7)}`);
            }}
          >
            {Array.from(
              { length: Math.max(Number(today.slice(0, 4)) + 2, year) - 2000 + 1 },
              (_, i) => Math.max(Number(today.slice(0, 4)) + 2, year) - i,
            ).map((y) => (
              <option key={y}>{y}</option>
            ))}
          </select>
        </label>
        {team && selected && (
          <Button
            variant="ghost"
            onClick={() => {
              setSelected(null);
              setTab("overview");
            }}
          >
            <ArrowLeft className="size-4" />
            {ar ? "كل الموظفين" : "All employees"}
          </Button>
        )}
      </div>
      {error ? (
        <div className="hr-error" role="alert">
          <p>{humanError(error, ar ? "ar" : "en")}</p>
          <Button
            variant="outline"
            onClick={() => {
              void directory.refetch();
              void leaves.refetch();
              if (staffId) void records.refetch();
            }}
          >
            {ar ? "إعادة المحاولة" : "Retry"}
          </Button>
        </div>
      ) : loading ? (
        <p role="status" className="hr-empty">
          {ar ? "جارٍ تحميل السجلات…" : "Loading employee records…"}
        </p>
      ) : team && !selected ? (
        <>
          <section className="hr-panel">
            <h3>{ar ? "الموظفون" : "People"}</h3>
            <div className="hr-toolbar">
              <label className="hr-search">
                {ar ? "ابحث عن موظف" : "Search employees"}
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={ar ? "الاسم أو رقم الموظف" : "Name or employee ID"}
                />
              </label>
              <label>
                {ar ? "القسم" : "Department"}
                <select value={department} onChange={(e) => setDepartment(e.target.value)}>
                  <option value="all">{ar ? "كل الأقسام" : "All departments"}</option>
                  {[...new Set(profiles.map((p) => p.department).filter(Boolean))]
                    .sort()
                    .map((d) => (
                      <option key={d}>{d}</option>
                    ))}
                </select>
              </label>
            </div>
            <div className="hr-people-list">
              {people
                .filter((s) => {
                  const p = profiles.find((p) => p.staff_id === s.id);
                  return (
                    `${s.name} ${p?.employee_number || ""}`
                      .toLowerCase()
                      .includes(search.toLowerCase()) &&
                    (department === "all" || p?.department === department)
                  );
                })
                .map((s) => {
                  const p = profiles.find((p) => p.staff_id === s.id);
                  return (
                    <button
                      type="button"
                      className="hr-person-row"
                      key={s.id}
                      onClick={() => {
                        setSelected(s.id);
                        setTab("overview");
                      }}
                    >
                      <span className="hr-person-name">
                        <span className="hr-avatar">
                          <UserRound aria-hidden="true" />
                        </span>
                        <span>
                          <strong>{s.name}</strong>
                          <small>{p?.department || "—"}</small>
                        </span>
                      </span>
                      <span>
                        <small>{ar ? "مدة الخدمة" : "Service period"}</small>
                        {period(p)}
                      </span>
                      {(["annual", "sick"] as const).map((type) => {
                        const a = accounts.find(
                          (a) => a.staff_id === s.id && a.leave_type === type,
                        );
                        return (
                          <span key={type}>
                            <small>
                              {type === "annual"
                                ? ar
                                  ? "رصيد سنوي"
                                  : "Annual available"
                                : ar
                                  ? "رصيد مرضي"
                                  : "Sick available"}
                            </small>
                            {a
                              ? daysText(leaveBalance(a, leaves.data ?? [], today).available, ar)
                              : "—"}
                          </span>
                        );
                      })}
                      <ArrowUpRight aria-hidden="true" />
                    </button>
                  );
                })}
            </div>
            {!people.length && <EmptyHR>{ar ? "لا يوجد موظفون" : "No employees found."}</EmptyHR>}
          </section>
        </>
      ) : staff ? (
        <>
          <div className="hr-identity">
            <div className="hr-person-name">
              <span className="hr-avatar">
                <UserRound aria-hidden="true" />
              </span>
              <div>
                <h2>{staff.name}</h2>
                <p>
                  {profile?.job_title ||
                    ROLE_LABELS[staff.role as AppRole]?.[ar ? "ar" : "en"] ||
                    staff.role}
                  {profile?.department ? ` · ${profile.department}` : ""}
                  {profile?.employee_number ? ` · ${profile.employee_number}` : ""}
                </p>
              </div>
            </div>
            <div>
              <small>{ar ? "مدة الخدمة" : "Service period"}</small>
              <strong>{period(profile)}</strong>
              <small>
                {profile?.hired_on ? `${ar ? "تاريخ التوظيف" : "Joined"} ${profile.hired_on}` : ""}
                {profile?.ended_on ? ` · ${ar ? "نهاية العمل" : "Ended"} ${profile.ended_on}` : ""}
              </small>
            </div>
            {canManage && team && (
              <ActionMenu
                ar={ar}
                actions={[
                  {
                    label: ar ? "إعداد الراتب والإجازات مرة واحدة" : "Salary & leave setup",
                    onSelect: () => setSetupOpen(true),
                  },
                  {
                    label: ar ? "بيانات التوظيف" : "Edit employment",
                    onSelect: () => openEditor("employment"),
                  },
                  {
                    label: ar ? "ضبط رصيد الإجازات" : "Configure leave balances",
                    onSelect: () => openEditor("balances"),
                  },
                  {
                    label: ar ? "إضافة قسيمة راتب" : "Add salary slip",
                    onSelect: () => openEditor("payslip"),
                  },
                ]}
              />
            )}
          </div>
          <div className="hr-tabs" aria-label={ar ? "سجلات الموظف" : "Employee records"}>
            {tabs.map(([id, label]) => (
              <button type="button" key={id} aria-pressed={tab === id} onClick={() => setTab(id)}>
                {label}
              </button>
            ))}
          </div>
          {tab === "overview" ? (
            <>
              <BalanceCards accounts={personAccounts} leaves={personLeaves} today={today} ar={ar} />
              <div className="hr-recent-grid">
                <section className="hr-panel">
                  <div className="hr-record-heading">
                    <h3>{ar ? "آخر الطلبات" : "Recent requests"}</h3>
                    <button type="button" onClick={() => setTab("requests")}>
                      {ar ? "عرض الكل" : "View all"} →
                    </button>
                  </div>
                  {requestRows.slice(0, 3).map((r) => (
                    <article className="hr-record" key={r.id}>
                      <div className="hr-record-heading">
                        <strong>{r.kind.replaceAll("_", " ")}</strong>
                        <span className="hr-status" data-status={r.status}>
                          {r.status}
                        </span>
                      </div>
                      <p>{r.date}</p>
                    </article>
                  ))}
                  {!requestRows.length && (
                    <p className="hr-caption">
                      {ar ? "لا توجد طلبات حتى الآن." : "No requests yet."}
                    </p>
                  )}
                </section>
                <section className="hr-panel">
                  <div className="hr-record-heading">
                    <h3>{ar ? "آخر قسيمة راتب" : "Latest payslip"}</h3>
                    <button type="button" onClick={() => setTab("payslips")}>
                      {ar ? "عرض الكل" : "View all"} →
                    </button>
                  </div>
                  {records.data?.slips[0] ? (
                    <div className="hr-latest-pay">
                      <strong>
                        {new Date(`${records.data.slips[0].period}T12:00:00Z`).toLocaleDateString(
                          ar ? "ar-JO" : "en-GB",
                          { month: "long", year: "numeric", timeZone: "UTC" },
                        )}
                      </strong>
                      <span className="hr-status">{records.data.slips[0].status}</span>
                      <Button variant="ghost" onClick={() => setTab("payslips")}>
                        {ar ? "عرض القسيمة" : "View payslip"} →
                      </Button>
                    </div>
                  ) : (
                    <p className="hr-caption">
                      {ar ? "لا توجد قسائم راتب منشورة." : "No published payslips yet."}
                    </p>
                  )}
                </section>
              </div>
            </>
          ) : tab === "leave" ? (
            <LeaveLedger accounts={personAccounts} leaves={personLeaves} today={today} ar={ar} />
          ) : tab === "attendance" ? (
            <AttendanceHistory
              entries={records.data?.attendance ?? []}
              month={month}
              onMonth={(m) => {
                setMonth(m);
                setYear(Number(m.slice(0, 4)));
              }}
              ar={ar}
              timeZone={timeZone}
            />
          ) : tab === "requests" ? (
            <RequestHistory requests={requestRows} ar={ar} />
          ) : (
            <SalarySlips
              slips={records.data?.slips ?? []}
              ar={ar}
              canManage={canManage && team}
              onEdit={(slip) => openEditor("payslip", slip)}
            />
          )}
        </>
      ) : (
        <EmptyHR>
          {ar ? "السجل غير متاح لهذا الموظف." : "This employee record is unavailable."}
        </EmptyHR>
      )}
      {team && canManage && staff && (
        <Dialog open={setupOpen} onOpenChange={setSetupOpen}>
          <DialogContent className="hr-edit-dialog" dir={ar ? "rtl" : "ltr"}>
            <DialogHeader>
              <DialogTitle>{staff.name}</DialogTitle>
              <DialogDescription>
                {ar ? "بيانات التوظيف والإعداد المتكرر" : "Employment & recurring setup"}
              </DialogDescription>
            </DialogHeader>
            <EmployeeSetupPanel
              key={staff.id}
              restaurantId={restaurantId}
              staffId={staff.id}
              ar={ar}
            />
          </DialogContent>
        </Dialog>
      )}
      {team && canManage && (
        <HRSetupImport
          open={importOpen}
          onClose={() => setImportOpen(false)}
          restaurantId={restaurantId}
          staff={people}
          ar={ar}
        />
      )}
      {editor && team && canManage && staff && (
        <HREditor
          kind={editor}
          restaurantId={restaurantId}
          staff={staff}
          profile={profile}
          accounts={personAccounts}
          year={year}
          slip={editSlip}
          currency={currency}
          ar={ar}
          onClose={() => setEditor(null)}
        />
      )}
    </section>
  );
}

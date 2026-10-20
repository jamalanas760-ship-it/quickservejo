export type WorkforceDestination =
  | "overview"
  | "my_workspace"
  | "schedule"
  | "attendance"
  | "timesheets"
  | "time_off"
  | "team"
  | "labor"
  | "payslips"
  | "leave"
  | "holidays";
export function workforceDestinations(ar: boolean, canManage: boolean) {
  return [
    { id: "overview", label: ar ? "نظرة عامة" : "Overview" },
    { id: "my_workspace", label: ar ? "مساحتي" : "My workspace" },
    { id: "schedule", label: ar ? "الجدول" : "Schedule" },
    { id: "attendance", label: ar ? "الحضور" : "Attendance" },
    { id: "timesheets", label: ar ? "سجلات الدوام" : "Timesheets" },
    {
      id: "time_off",
      label: canManage
        ? ar
          ? "الطلبات والموافقات"
          : "Requests & approvals"
        : ar
          ? "الطلبات"
          : "Requests",
    },
    { id: "team", label: ar ? "الفريق" : "Team" },
    ...(canManage ? [{ id: "labor", label: ar ? "العمالة" : "Labor" }] : []),
    { id: "holidays", label: ar ? "العطلات" : "Holidays" },
    { id: "payslips", label: ar ? "قسائم الراتب" : "Pay slips" },
    { id: "leave", label: ar ? "حركات الإجازات" : "Leave transactions" },
  ] as const;
}

export type NotificationKind = "task" | "approval" | "handover" | "shift" | "alert" | "system";
export type NotificationFilter =
  "all" | "unread" | "orders" | "reservations" | "team" | "approvals" | "system" | "finance";
export type NotificationRow = {
  id: string;
  restaurant_id: string;
  staff_id: string | null;
  target_role: string | null;
  kind: NotificationKind;
  title: string;
  body: string | null;
  source_type: string | null;
  source_id: string | null;
  read_at: string | null;
  created_at: string;
};
/** One presentation contract for the inbox, bell and background push worker. */
export function notificationCopy(row: Pick<NotificationRow, "title" | "body" | "kind" | "source_type">, ar = false) {
  const source = (row.source_type ?? "").toLowerCase();
  const text = `${row.title} ${row.body ?? ""}`.toLowerCase();
  const t = (en: string, arabic: string) => ar ? arabic : en;
  const category = source.includes("missing_punch") ? t("Missing punch", "بصمة مفقودة")
    : /clock(?:ed)?[ _-]?out/.test(source + text) ? t("Clock out", "تسجيل المغادرة")
    : /clock(?:ed)?[ _-]?in/.test(source + text) ? t("Clock in", "تسجيل الحضور")
    : source.includes("order") ? t("Order", "طلب")
    : /booking|reservation|waitlist/.test(source) ? t("Reservation", "حجز")
    : row.kind === "shift" || source.includes("shift") ? t("Shift", "وردية")
    : row.kind === "approval" ? t("Approval requested", "طلب موافقة")
    : source === "work_task" || row.kind === "task" ? t("Ticket assigned", "تذكرة مسندة")
    : row.kind === "handover" ? t("Shift handover", "تسليم وردية")
    : /leave|permission/.test(source) ? t("Staff request", "طلب موظف")
    : row.kind === "alert" ? t("Attention needed", "يتطلب اهتمامك") : t("Workspace update", "تحديث مساحة العمل");
  const title = row.title.trim();
  const body = row.body?.trim();
  return {
    title: category,
    body: [title, body && body !== title ? body : ""].filter(Boolean).join(" — ") || t("View the details in your workspace.", "اطلع على التفاصيل في مساحة عملك."),
  };
}
export function filterNotifications(
  rows: NotificationRow[],
  filter: NotificationFilter,
  search: string,
) {
  const query = search.trim().toLocaleLowerCase();
  return rows.filter((row) => {
    const source = (row.source_type ?? "").toLowerCase();
    const matches =
      filter === "all" ||
      (filter === "unread" && !row.read_at) ||
      (filter === "approvals" && row.kind === "approval") ||
      (filter === "team" && (["shift", "handover"].includes(row.kind) || /workforce|staff|missing_punch|clock/.test(source))) ||
      (filter === "system" && row.kind === "system") ||
      (filter === "orders" && source.includes("order")) ||
      (filter === "reservations" &&
        ["booking", "reservation", "waitlist"].some((key) => source.includes(key))) ||
      (filter === "finance" &&
        ["finance", "invoice", "expense", "procurement", "inventory"].some((key) =>
          source.includes(key),
        ));
    return (
      matches &&
      (!query ||
        [row.title, row.body, row.source_type, row.kind, notificationCopy(row).title, notificationCopy(row, true).title].some((value) =>
          value?.toLocaleLowerCase().includes(query),
        ))
    );
  });
}
export function notificationHref(
  row: Pick<NotificationRow, "kind" | "source_type" | "restaurant_id"> & {source_id?: string | null},
): string {
  const source = row.source_type?.toLowerCase() ?? "";
  const record = row.source_id ? `?record=${encodeURIComponent(row.source_id)}` : "";
  if (source === "work_task") return "/work" + record;
  if (["booking", "reservation", "waitlist"].some((key) => source.includes(key)))
    return (source.includes("waitlist") ? "/waitlist" : "/bookings") + record;
  if (source.includes("order")) return `/manage/${encodeURIComponent(row.restaurant_id)}/orders` + record;
  if (source.includes("missing_punch")) return "/shifts" + record + "#timesheets";
  if (/workforce|staff_|missing_punch|clock/.test(source)) return "/shifts";
  if (
    ["finance", "invoice", "expense", "procurement", "inventory"].some((key) =>
      source.includes(key),
    )
  )
    return `/manage/${encodeURIComponent(row.restaurant_id)}/operations`;
  return ["shift", "handover"].includes(row.kind)
    ? "/shifts"
    : ["task", "approval", "alert"].includes(row.kind)
      ? "/work"
      : "/dashboard";
}
export function notificationDayKey(value: string, timezone: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

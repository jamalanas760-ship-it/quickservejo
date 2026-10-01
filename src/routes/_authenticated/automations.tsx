import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Activity, CalendarClock, Plus, Search, Settings2, Workflow, XCircle } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/nav/AppHeader";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  updateOperationalRule,
  useOperationalRules,
  useAutomationRuns,
  type OperationalRule,
} from "@/hooks/useOperations";
import { useAccess } from "@/hooks/useSession";
import { useWorkspaceScope } from "@/hooks/useWorkspace";
import { membershipHasCapability, ROLE_LABELS } from "@/lib/permissions";
import { humanError } from "@/lib/errors";
import { useI18n } from "@/lib/i18n";
import { RuleEditor } from "@/components/automations/RuleEditor";
import {
  EVENTS,
  RuleSwitch as Switch,
  RulePreview,
  RunHistory,
  ruleLabel,
} from "@/components/automations/AutomationPrimitives";
import "@/components/automations/automation-studio.css";

export const Route = createFileRoute("/_authenticated/automations")({
  head: () => ({
    meta: [
      { title: "Automation — QuickServe" },
      {
        name: "description",
        content: "Restaurant automation rules, scheduling and execution history.",
      },
    ],
  }),
  component: AutomationControlCenter,
});

function AutomationControlCenter() {
  const { lang } = useI18n(),
    ar = lang === "ar";
  const scope = useWorkspaceScope(),
    access = useAccess(),
    rid = scope.restaurantId;
  const membership = rid ? access.membershipFor(rid) : null;
  const canManage = Boolean(
    membership &&
    (membershipHasCapability(membership.role, membership.permission_overrides, "manage_work") ||
      membershipHasCapability(membership.role, membership.permission_overrides, "manage_shifts")),
  );
  const rules = useOperationalRules(rid, canManage),
    runs = useAutomationRuns(rid, canManage);
  const [editor, setEditor] = useState<"new" | string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [tab, setTab] = useState<"rules" | "history">("rules");
  const [search, setSearch] = useState(""),
    [trigger, setTrigger] = useState("all"),
    [status, setStatus] = useState("all");
  const rows = rules.data ?? [],
    runRows = runs.data ?? [];
  const selected = rows.find((r) => r.id === previewId) ?? rows.find((r) => r.enabled) ?? rows[0];
  const editingRule = rows.find((r) => r.id === editor);
  const filtered = rows.filter(
    (r) =>
      (trigger === "all" || r.event_type === trigger) &&
      (status === "all" || (status === "active" ? r.enabled : !r.enabled)) &&
      `${r.name} ${ruleLabel(r.event_type, ar)} ${r.target_role ? ROLE_LABELS[r.target_role]?.[lang] : ""}`
        .toLocaleLowerCase()
        .includes(search.trim().toLocaleLowerCase()),
  );
  const today = new Date().toLocaleDateString("en-CA");

  if (scope.isPending || access.isPending)
    return (
      <div className="min-h-dvh bg-background">
        <AppHeader />
        <main className="qs-page">
          <Skeleton className="h-[500px] rounded-xl" />
        </main>
      </div>
    );
  if (!rid || !membership || !canManage)
    return (
      <div className="min-h-dvh bg-background">
        <AppHeader />
        <main className="qs-page">
          <h1 className="text-xl font-bold">
            {ar ? "الأتمتة غير متاحة" : "Automation is not available"}
          </h1>
          <p className="mt-2 text-muted-foreground">
            {ar
              ? "هذا الحساب لا يملك صلاحية إدارة قواعد التشغيل."
              : "This account does not have permission to manage automation rules."}
          </p>
        </main>
      </div>
    );

  return (
    <div className="min-h-dvh bg-background">
      <AppHeader title={ar ? "الأتمتة" : "Automation"} />
      <main className="qs-page qs-compact-page au-studio" dir={ar ? "rtl" : "ltr"}>
        <>
          <header className="au-heading">
            <div>
              <h1>{ar ? "الأتمتة" : "Automation"}</h1>
              <p>
                {ar
                  ? "حافظ على سلاسة الخدمة. دع القواعد تتولى المهام المتكررة."
                  : "Keep service moving. Let the rules handle the routine."}
              </p>
            </div>
            <Button className="au-primary" onClick={() => setEditor("new")}>
              <Plus className="size-4" />
              {ar ? "قاعدة جديدة" : "New rule"}
            </Button>
          </header>
          <section className="au-metrics" aria-label={ar ? "ملخص الأتمتة" : "Automation summary"}>
            {[
              {
                icon: Workflow,
                label: ar ? "قواعد فعالة" : "Active rules",
                count: rows.filter((r) => r.enabled).length,
                hint: ar ? "مفعلة" : "Enabled",
                tone: "orange",
              },
              {
                icon: CalendarClock,
                label: ar ? "مجدولة" : "Scheduled",
                count: rows.filter((r) => r.enabled && r.schedule_time).length,
                hint: ar ? "تعمل تلقائياً" : "Run automatically",
                tone: "blue",
              },
              {
                icon: XCircle,
                label: ar ? "تشغيلات فاشلة" : "Failed runs",
                count: runRows.filter((r) => r.status === "failed").length,
                hint: ar ? "تحتاج مراجعة" : "Need review",
                tone: "slate",
              },
              {
                icon: Activity,
                label: ar ? "نفذت اليوم" : "Executed today",
                count: runRows.filter(
                  (r) => new Date(r.started_at).toLocaleDateString("en-CA") === today,
                ).length,
                hint: ar ? "سجل اليوم" : "Today’s run log",
                tone: "green",
              },
            ].map((m) => (
              <article key={m.tone}>
                <span className={`au-icon ${m.tone}`}>
                  <m.icon size={20} />
                </span>
                <div>
                  <p>{m.label}</p>
                  <strong>{rules.isPending || runs.isPending ? "—" : m.count}</strong>
                  <small>{m.hint}</small>
                </div>
              </article>
            ))}
          </section>
          <div className="au-workspace">
            <section className="au-main">
              <div
                className="au-tabs"
                role="tablist"
                aria-label={ar ? "الأتمتة" : "Automation views"}
              >
                {(["rules", "history"] as const).map((t) => (
                  <button
                    key={t}
                    role="tab"
                    aria-selected={tab === t}
                    aria-controls={`au-${t}`}
                    id={`au-tab-${t}`}
                    onClick={() => setTab(t)}
                  >
                    {t === "rules"
                      ? ar
                        ? "القواعد"
                        : "Rules"
                      : ar
                        ? "سجل التنفيذ"
                        : "Execution history"}
                  </button>
                ))}
              </div>
              {tab === "rules" ? (
                <div
                  className="au-panel"
                  role="tabpanel"
                  id="au-rules"
                  aria-labelledby="au-tab-rules"
                >
                  <div className="au-toolbar">
                    <label className="au-search">
                      <Search size={18} aria-hidden="true" />
                      <input
                        aria-label={ar ? "البحث في القواعد" : "Search rules"}
                        placeholder={ar ? "البحث في القواعد…" : "Search rules…"}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                      {search ? (
                        <button
                          type="button"
                          aria-label={ar ? "مسح البحث" : "Clear search"}
                          onClick={() => setSearch("")}
                        >
                          <XCircle size={17} />
                        </button>
                      ) : null}
                    </label>
                    <select
                      aria-label={ar ? "تصفية المشغل" : "Filter trigger"}
                      value={trigger}
                      onChange={(e) => setTrigger(e.target.value)}
                    >
                      <option value="all">{ar ? "كل المشغلات" : "All triggers"}</option>
                      {EVENTS.map((e) => (
                        <option key={e.value} value={e.value}>
                          {ar ? e.ar : e.en}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label={ar ? "تصفية الحالة" : "Filter status"}
                      value={status}
                      onChange={(e) => setStatus(e.target.value)}
                    >
                      <option value="all">{ar ? "كل الحالات" : "All statuses"}</option>
                      <option value="active">{ar ? "فعالة" : "Active"}</option>
                      <option value="paused">{ar ? "متوقفة" : "Paused"}</option>
                    </select>
                  </div>
                  {rules.isError ? (
                    <p className="au-empty text-destructive" role="alert">
                      {humanError(rules.error, lang)}
                    </p>
                  ) : rules.isPending ? (
                    <div className="p-4">
                      <Skeleton className="h-60" />
                    </div>
                  ) : (
                    <>
                      <div className="au-table-wrap">
                        <table className="au-table">
                          <thead>
                            <tr>
                              {[
                                ar ? "القاعدة" : "Rule",
                                ar ? "متى" : "When",
                                ar ? "المسؤول" : "Assigned to",
                                ar ? "المهلة" : "Due",
                                ar ? "الحالة" : "Status",
                                ar ? "تعديل" : "Edit",
                              ].map((s) => (
                                <th key={s}>{s}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {filtered.map((rule) => (
                              <RuleRow
                                key={rule.id}
                                rule={rule}
                                ar={ar}
                                selected={previewId === rule.id}
                                onPreview={() => setPreviewId(rule.id)}
                                onEdit={() => setEditor(rule.id)}
                              />
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {!filtered.length ? (
                        <div className="au-empty">
                          <Workflow size={28} />
                          <strong>
                            {rows.length
                              ? ar
                                ? "لا قواعد تطابق بحثك"
                                : "No matching rules"
                              : ar
                                ? "لا توجد قواعد بعد"
                                : "No rules yet"}
                          </strong>
                          <p>
                            {rows.length
                              ? ar
                                ? "غيّر البحث أو عوامل التصفية."
                                : "Try another search or filter."
                              : ar
                                ? "أنشئ قاعدة لتحويل حدث إلى عمل تلقائي."
                                : "Create a rule to turn an event into automatic work."}
                          </p>
                          {!rows.length ? (
                            <Button className="au-primary" onClick={() => setEditor("new")}>
                              {ar ? "قاعدة جديدة" : "New rule"}
                            </Button>
                          ) : (
                            <Button
                              variant="outline"
                              onClick={() => {
                                setSearch("");
                                setTrigger("all");
                                setStatus("all");
                              }}
                            >
                              {ar ? "مسح التصفية" : "Clear filters"}
                            </Button>
                          )}
                        </div>
                      ) : null}
                    </>
                  )}
                </div>
              ) : (
                <section
                  className="au-panel"
                  role="tabpanel"
                  id="au-history"
                  aria-labelledby="au-tab-history"
                >
                  <RunHistory
                    runs={runRows}
                    rules={rows}
                    ar={ar}
                    pending={runs.isPending}
                    error={runs.isError ? humanError(runs.error, lang) : undefined}
                  />
                </section>
              )}
            </section>
            <aside className="au-panel au-rail">
              <header>
                <h2>{ar ? "سجل التنفيذ" : "Execution history"}</h2>
                <button className="au-text-button" onClick={() => setTab("history")}>
                  {ar ? "عرض الكل" : "View all"}
                </button>
              </header>
              <RunHistory
                runs={runRows.slice(0, 3)}
                rules={rows}
                ar={ar}
                pending={runs.isPending}
                error={runs.isError ? humanError(runs.error, lang) : undefined}
                compact
              />
              {selected ? (
                <div className="au-selected-preview">
                  <header>
                    <h2>{ar ? "معاينة القاعدة المحددة" : "Selected rule preview"}</h2>
                    <button className="au-text-button" onClick={() => setEditor(selected.id)}>
                      {ar ? "تعديل" : "Edit"}
                    </button>
                  </header>
                  <div className="au-preview-title">
                    <strong>{selected.name}</strong>
                    <span className={`au-pill ${selected.enabled ? "active" : "paused"}`}>
                      {selected.enabled ? (ar ? "فعالة" : "Active") : ar ? "متوقفة" : "Paused"}
                    </span>
                  </div>
                  <RulePreview value={selected} ar={ar} compact />
                </div>
              ) : null}
            </aside>
          </div>
        </>
        {editor === "new" || editingRule ? (
          <RuleEditor
            key={editor}
            restaurantId={rid}
            rule={editingRule}
            runs={runRows.filter((r) => r.rule_id === editingRule?.id)}
            ar={ar}
            onClose={() => setEditor(null)}
          />
        ) : null}
      </main>
    </div>
  );
}

function RuleRow({
  rule,
  ar,
  selected,
  onPreview,
  onEdit,
}: {
  rule: OperationalRule;
  ar: boolean;
  selected: boolean;
  onPreview: () => void;
  onEdit: () => void;
}) {
  const qc = useQueryClient(),
    lang = ar ? "ar" : "en";
  const toggle = useMutation({
    mutationFn: (enabled: boolean) => updateOperationalRule(rule.id, { enabled }),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["operations", "rules", rule.restaurant_id] }),
    onError: (error) => toast.error(humanError(error, lang)),
  });
  return (
    <tr className={selected ? "is-selected" : ""}>
      <td data-label={ar ? "القاعدة" : "Rule"}>
        <div className="au-rule-name">
          <Switch
            aria-label={`${ar ? "تفعيل" : "Enable"} ${rule.name}`}
            checked={rule.enabled}
            disabled={toggle.isPending}
            onCheckedChange={(enabled) => toggle.mutate(enabled)}
          />
          <button className="au-name-button" onClick={onPreview} aria-pressed={selected}>
            {rule.name}
          </button>
        </div>
        {rule.last_error ? (
          <small className="au-rule-error" title={rule.last_error}>
            {rule.last_error}
          </small>
        ) : null}
      </td>
      <td data-label={ar ? "متى" : "When"}>{ruleLabel(rule.event_type, ar)}</td>
      <td data-label={ar ? "المسؤول" : "Assigned to"}>
        {rule.target_role ? ROLE_LABELS[rule.target_role]?.[lang] : ar ? "بدون مسؤول" : "No owner"}
      </td>
      <td data-label={ar ? "المهلة" : "Due"}>
        {rule.due_minutes} {ar ? "د" : "min"}
      </td>
      <td data-label={ar ? "الحالة" : "Status"}>
        <span className={`au-pill ${rule.enabled ? "active" : "paused"}`}>
          {rule.enabled ? (ar ? "فعالة" : "Active") : ar ? "متوقفة" : "Paused"}
        </span>
      </td>
      <td>
        <Button
          variant="outline"
          size="sm"
          aria-label={`${ar ? "تعديل" : "Edit"} ${rule.name}`}
          onClick={onEdit}
        >
          <Settings2 size={14} />
          {ar ? "تعديل" : "Edit"}
        </Button>
      </td>
    </tr>
  );
}

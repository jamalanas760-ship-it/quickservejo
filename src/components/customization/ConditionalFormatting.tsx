import { useMemo, useState, type CSSProperties } from "react";
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type ConditionalOperator = "gte" | "gt" | "lte" | "lt" | "eq" | "neq" | "contains" | "not_contains" | "starts_with" | "ends_with" | "empty" | "not_empty";
export type ConditionalRule = {
  id: string;
  column: string;
  operator: ConditionalOperator;
  value: string;
  background: string;
  textColor: string;
  applyTo: "cell" | "row";
};
export type ConditionalColumn = { id: string; en: string; ar: string; numeric?: boolean };

const OPERATORS: Array<{ id: ConditionalOperator; en: string; ar: string }> = [
  { id: "gte", en: "Greater than or equal to", ar: "أكبر من أو يساوي" },
  { id: "gt", en: "Greater than", ar: "أكبر من" },
  { id: "lte", en: "Less than or equal to", ar: "أقل من أو يساوي" },
  { id: "lt", en: "Less than", ar: "أقل من" },
  { id: "eq", en: "Equal to", ar: "يساوي" },
  { id: "neq", en: "Not equal to", ar: "لا يساوي" },
  { id: "contains", en: "Contains", ar: "يحتوي على" },
  { id: "not_contains", en: "Does not contain", ar: "لا يحتوي على" },
  { id: "starts_with", en: "Starts with", ar: "يبدأ بـ" },
  { id: "ends_with", en: "Ends with", ar: "ينتهي بـ" },
  { id: "empty", en: "Is empty", ar: "فارغ" },
  { id: "not_empty", en: "Is not empty", ar: "غير فارغ" },
];

const DEFAULT_RULE: ConditionalRule = {
  id: "",
  column: "",
  operator: "gte",
  value: "",
  background: "#dcfce7",
  textColor: "#166534",
  applyTo: "cell",
};

function validColor(value: unknown, fallback: string) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

export function normalizeConditionalRules(value: unknown, columns: readonly string[]): ConditionalRule[] {
  if (!Array.isArray(value)) return [];
  const allowedColumns = new Set(columns);
  const allowedOperators = new Set<ConditionalOperator>(OPERATORS.map((item) => item.id));
  return value.flatMap((raw, index) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
    const item = raw as Record<string, unknown>;
    const column = typeof item.column === "string" && allowedColumns.has(item.column) ? item.column : "";
    const operator = typeof item.operator === "string" && allowedOperators.has(item.operator as ConditionalOperator) ? item.operator as ConditionalOperator : "eq";
    if (!column) return [];
    return [{
      id: typeof item.id === "string" && item.id ? item.id : `rule-${index}`,
      column,
      operator,
      value: typeof item.value === "string" ? item.value : String(item.value ?? ""),
      background: validColor(item.background, "#dcfce7"),
      textColor: validColor(item.textColor, "#166534"),
      applyTo: item.applyTo === "row" ? "row" as const : "cell" as const,
    }];
  });
}

function normalizedText(value: unknown) {
  return String(value ?? "").trim().toLocaleLowerCase();
}

function numeric(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const parsed = Number(String(value ?? "").replace(/[^0-9.+-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

export function conditionalRuleMatches(rule: ConditionalRule, rawValue: unknown): boolean {
  const actualText = normalizedText(rawValue);
  const expectedText = normalizedText(rule.value);
  if (rule.operator === "empty") return actualText.length === 0;
  if (rule.operator === "not_empty") return actualText.length > 0;
  if (rule.operator === "contains") return actualText.includes(expectedText);
  if (rule.operator === "not_contains") return !actualText.includes(expectedText);
  if (rule.operator === "starts_with") return actualText.startsWith(expectedText);
  if (rule.operator === "ends_with") return actualText.endsWith(expectedText);

  const actualNumber = numeric(rawValue);
  const expectedNumber = numeric(rule.value);
  const bothNumeric = actualNumber !== null && expectedNumber !== null;
  if (rule.operator === "eq") return bothNumeric ? actualNumber === expectedNumber : actualText === expectedText;
  if (rule.operator === "neq") return bothNumeric ? actualNumber !== expectedNumber : actualText !== expectedText;
  if (!bothNumeric) return false;
  if (rule.operator === "gte") return actualNumber >= expectedNumber;
  if (rule.operator === "gt") return actualNumber > expectedNumber;
  if (rule.operator === "lte") return actualNumber <= expectedNumber;
  return actualNumber < expectedNumber;
}

export function conditionalCellStyle(rules: readonly ConditionalRule[], column: string, value: unknown): CSSProperties | undefined {
  const match = rules.find((rule) => rule.column === column && rule.applyTo === "cell" && conditionalRuleMatches(rule, value));
  return match ? { backgroundColor: match.background, color: match.textColor, fontWeight: 650 } : undefined;
}

export function conditionalRowStyle(rules: readonly ConditionalRule[], row: Record<string, unknown>): CSSProperties | undefined {
  const match = rules.find((rule) => rule.applyTo === "row" && conditionalRuleMatches(rule, row[rule.column]));
  return match ? { backgroundColor: match.background, color: match.textColor } : undefined;
}

export function ConditionalFormattingDialog({
  open,
  onOpenChange,
  ar,
  columns,
  rules,
  onChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ar: boolean;
  columns: ConditionalColumn[];
  rules: ConditionalRule[];
  onChange: (rules: ConditionalRule[]) => void;
}) {
  const [draft, setDraft] = useState<ConditionalRule>(DEFAULT_RULE);
  const needsValue = !["empty", "not_empty"].includes(draft.operator);
  const selectedColumn = useMemo(() => columns.find((column) => column.id === draft.column), [columns, draft.column]);

  function addRule() {
    if (!draft.column || (needsValue && !draft.value.trim())) return;
    onChange([...rules, { ...draft, id: `cf-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` }]);
    setDraft({ ...DEFAULT_RULE, column: draft.column });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{ar ? "التنسيق الشرطي" : "Conditional Formatting"}</DialogTitle>
          <DialogDescription>{ar ? "لوّن الخلايا أو الصفوف تلقائياً حسب القيم. يتم تطبيق أول قاعدة مطابقة." : "Automatically color cells or rows based on their values. The first matching rule is applied."}</DialogDescription>
        </DialogHeader>

        <section className="rounded-2xl border border-border bg-muted/20 p-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-1.5"><Label>{ar ? "العمود" : "Column"}</Label><Select value={draft.column} onValueChange={(column) => setDraft((current) => ({ ...current, column }))}><SelectTrigger><SelectValue placeholder={ar ? "اختر عموداً" : "Choose column"} /></SelectTrigger><SelectContent>{columns.map((column) => <SelectItem key={column.id} value={column.id}>{ar ? column.ar : column.en}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1.5"><Label>{ar ? "الشرط" : "Condition"}</Label><Select value={draft.operator} onValueChange={(operator) => setDraft((current) => ({ ...current, operator: operator as ConditionalOperator }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{OPERATORS.map((operator) => <SelectItem key={operator.id} value={operator.id}>{ar ? operator.ar : operator.en}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1.5"><Label>{ar ? "القيمة" : "Value"}</Label><Input disabled={!needsValue} inputMode={selectedColumn?.numeric ? "decimal" : "text"} value={draft.value} onChange={(event) => setDraft((current) => ({ ...current, value: event.target.value }))} placeholder={needsValue ? (selectedColumn?.numeric ? "100" : (ar ? "القيمة" : "Value")) : (ar ? "غير مطلوب" : "Not required")} /></div>
          </div>
          <div className="mt-4 flex flex-wrap items-end gap-4">
            <label className="space-y-1.5 text-xs font-semibold"><span className="block">{ar ? "الخلفية" : "Background"}</span><Input type="color" value={draft.background} onChange={(event) => setDraft((current) => ({ ...current, background: event.target.value }))} className="h-11 w-16 p-1" /></label>
            <label className="space-y-1.5 text-xs font-semibold"><span className="block">{ar ? "لون النص" : "Text color"}</span><Input type="color" value={draft.textColor} onChange={(event) => setDraft((current) => ({ ...current, textColor: event.target.value }))} className="h-11 w-16 p-1" /></label>
            <div className="min-w-[170px] space-y-1.5"><Label>{ar ? "التطبيق على" : "Apply to"}</Label><Select value={draft.applyTo} onValueChange={(applyTo) => setDraft((current) => ({ ...current, applyTo: applyTo as "cell" | "row" }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="cell">{ar ? "الخلية" : "Matching cell"}</SelectItem><SelectItem value="row">{ar ? "الصف كامل" : "Entire row"}</SelectItem></SelectContent></Select></div>
            <Button type="button" className="ms-auto" disabled={!draft.column || (needsValue && !draft.value.trim())} onClick={addRule}><Plus className="size-4" />{ar ? "إضافة قاعدة" : "Add Rule"}</Button>
          </div>
        </section>

        <div className="space-y-2">
          {rules.length ? rules.map((rule) => {
            const column = columns.find((item) => item.id === rule.column);
            const operator = OPERATORS.find((item) => item.id === rule.operator);
            return <div key={rule.id} className="flex flex-col gap-3 rounded-xl border border-border p-3 sm:flex-row sm:items-center"><span className="size-4 shrink-0 rounded-full border border-black/10" style={{ backgroundColor: rule.background }} /><div className="min-w-0 flex-1"><strong className="block text-xs">{ar ? column?.ar : column?.en} · {ar ? operator?.ar : operator?.en}{needsRuleValue(rule.operator) ? ` · ${rule.value}` : ""}</strong><span className="mt-1 block text-[10px] text-muted-foreground">{rule.applyTo === "row" ? (ar ? "الصف كامل" : "Entire row") : (ar ? "الخلية المطابقة" : "Matching cell")}</span></div><button type="button" onClick={() => onChange(rules.filter((item) => item.id !== rule.id))} className="grid size-10 place-items-center rounded-xl text-red-600 hover:bg-red-50" aria-label={ar ? "حذف القاعدة" : "Delete rule"}><Trash2 className="size-4" /></button></div>;
          }) : <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">{ar ? "لا توجد قواعد بعد." : "No formatting rules yet."}</div>}
        </div>
        <DialogFooter><Button onClick={() => onOpenChange(false)}>{ar ? "تم" : "Done"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function needsRuleValue(operator: ConditionalOperator) {
  return operator !== "empty" && operator !== "not_empty";
}

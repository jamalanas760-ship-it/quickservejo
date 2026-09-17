from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{path}: expected one match, got {count} for {old[:80]!r}")
    p.write_text(text.replace(old, new, 1), encoding="utf-8")

# Team page: expose every supported job profile and keep role naming centralized.
replace_once(
    "src/components/manage/StaffManagerAdvanced.tsx",
    'const ROLES: AppRole[] = ["restaurant_admin", "manager", "kitchen", "waiter", "cashier"];\nconst ROLE_NAMES: Record<AppRole, { en: string; ar: string }> = {\n  ...ROLE_LABELS,\n  manager: { en: "Manager", ar: "مدير تشغيل" },\n  kitchen: { en: "Kitchen", ar: "المطبخ" },\n  waiter: { en: "Waiter / Server", ar: "نادل / صالة" },\n  cashier: { en: "Cashier", ar: "كاشير" },\n};\nconst ROLE_TONE: Record<string, string> = {\n  restaurant_admin: "bg-orange-500/12 text-orange-600",\n  manager: "bg-blue-500/12 text-blue-600",\n  kitchen: "bg-rose-500/12 text-rose-600",\n  waiter: "bg-violet-500/12 text-violet-600",\n  cashier: "bg-emerald-500/12 text-emerald-600",\n};',
    'const ROLES: AppRole[] = ["restaurant_admin", "operations_manager", "manager", "kitchen", "waiter", "cashier", "host", "inventory", "procurement", "accountant"];\nconst ROLE_NAMES: Record<AppRole, { en: string; ar: string }> = ROLE_LABELS;\nconst ROLE_TONE: Record<string, string> = {\n  restaurant_admin: "bg-orange-500/12 text-orange-600",\n  operations_manager: "bg-sky-500/12 text-sky-600",\n  manager: "bg-blue-500/12 text-blue-600",\n  kitchen: "bg-rose-500/12 text-rose-600",\n  waiter: "bg-violet-500/12 text-violet-600",\n  cashier: "bg-emerald-500/12 text-emerald-600",\n  host: "bg-cyan-500/12 text-cyan-600",\n  inventory: "bg-indigo-500/12 text-indigo-600",\n  procurement: "bg-amber-500/12 text-amber-700",\n  accountant: "bg-teal-500/12 text-teal-600",\n};',
)

# Generated Supabase types: keep app_role aligned with the production migration.
replace_once(
    "src/integrations/supabase/types.ts",
    '      app_role:\n        | "super_admin"\n        | "restaurant_admin"\n        | "manager"\n        | "kitchen"\n        | "waiter"\n        | "cashier"',
    '      app_role:\n        | "super_admin"\n        | "restaurant_admin"\n        | "operations_manager"\n        | "manager"\n        | "kitchen"\n        | "waiter"\n        | "cashier"\n        | "host"\n        | "inventory"\n        | "procurement"\n        | "accountant"',
)

# Supabase generated Constants mirrors enum values near the bottom of the file.
p = Path("src/integrations/supabase/types.ts")
text = p.read_text(encoding="utf-8")
old = '      app_role: [\n        "super_admin",\n        "restaurant_admin",\n        "manager",\n        "kitchen",\n        "waiter",\n        "cashier",\n      ],'
new = '      app_role: [\n        "super_admin",\n        "restaurant_admin",\n        "operations_manager",\n        "manager",\n        "kitchen",\n        "waiter",\n        "cashier",\n        "host",\n        "inventory",\n        "procurement",\n        "accountant",\n      ],'
if old in text:
    text = text.replace(old, new, 1)
    p.write_text(text, encoding="utf-8")

print("Role/work foundation patches applied.")

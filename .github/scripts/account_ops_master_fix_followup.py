from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")

def write(path: str, content: str) -> None:
    (ROOT / path).write_text(content.rstrip() + "\n", encoding="utf-8")

def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)

# The generated Supabase client types lag the live restaurant_tables schema (zone exists in
# production and is already used by floor management). Keep this narrow query aligned with the
# production schema without weakening runtime validation.
host_path = "src/routes/_authenticated/host.tsx"
host = read(host_path)
host = replace_once(
    host,
    'supabase.from("restaurant_tables").select("id,table_number,table_name,zone")',
    '(supabase.from("restaurant_tables") as any).select("id,table_number,table_name,zone")',
    "host table query",
)
write(host_path, host)

# The OrganizationSection replacement intentionally changes only that section. Restore the
# existing notification preference component if the earlier broad replacement consumed it.
profile_path = "src/routes/_authenticated/profile.tsx"
profile = read(profile_path)
if "function PreferenceGroup(" not in profile:
    anchor = "\nfunction SectionHeading({ icon, title, description }:"
    preference = '''
function PreferenceGroup({ title, subtitle, rows, notif, ar, toggle }: { title: string; subtitle: string; rows: [keyof Notifications, string, string, string, string][]; notif: Notifications; ar: boolean; toggle: (key: keyof Notifications, value: boolean) => void }) {
  return <section className="qs-card overflow-hidden">
    <div className="border-b border-border px-5 py-4"><h2 className="text-sm font-bold">{title}</h2><p className="mt-1 text-xs text-muted-foreground">{subtitle}</p></div>
    <div className="divide-y divide-border">
      {rows.map(([key, en, arabic, hintEn, hintAr], index) => <div key={key} className="flex min-h-[82px] items-center gap-4 px-4 py-3.5 sm:px-5">
        <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", index % 3 === 0 ? "bg-orange-500/10 text-[#ff5a0a]" : index % 3 === 1 ? "bg-emerald-500/10 text-emerald-600" : "bg-blue-500/10 text-blue-600")}><Bell className="size-4" /></span>
        <span className="min-w-0 flex-1"><strong className="block text-sm">{ar ? arabic : en}</strong><span className="mt-1 block text-xs leading-5 text-muted-foreground">{ar ? hintAr : hintEn}</span></span>
        <Switch checked={notif[key]} onCheckedChange={(value) => toggle(key, value)} aria-label={ar ? arabic : en} />
      </div>)}
    </div>
  </section>;
}
'''
    if anchor not in profile:
        raise RuntimeError("profile SectionHeading anchor not found")
    profile = profile.replace(anchor, preference + anchor, 1)
write(profile_path, profile)

# Give handover rows a concrete type so role labels remain type-safe.
shifts_path = "src/routes/_authenticated/shifts.tsx"
shifts = read(shifts_path)
if "type ShiftHandover," not in shifts:
    shifts = replace_once(shifts, "  type ShiftAssignmentStatus,\n", "  type ShiftAssignmentStatus,\n  type ShiftHandover,\n", "ShiftHandover import")
shifts = shifts.replace("handover: any; currentStaffId", "handover: ShiftHandover; currentStaffId")
write(shifts_path, shifts)

print("Account operations validation follow-up applied.")

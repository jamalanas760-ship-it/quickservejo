from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")

def write(path: str, text: str) -> None:
    (ROOT / path).write_text(text.rstrip() + "\n", encoding="utf-8")

def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected 1 match, found {count}")
    return text.replace(old, new, 1)

# Profile: account cover belongs to eligible worker/role accounts only; Restaurant Manager
# keeps restaurant-level cover/branding but no personal account cover.
path = "src/routes/_authenticated/profile.tsx"
s = read(path)
s = replace_once(s,
    '  const canManageRestaurant = Boolean(rid && (access.isSuperAdmin || membership?.role === "restaurant_admin"));\n',
    '  const canManageRestaurant = Boolean(rid && (access.isSuperAdmin || membership?.role === "restaurant_admin"));\n  const personalCoverEligible = Boolean(membership && membership.role !== "restaurant_admin");\n',
    "profile eligibility",
)
s = replace_once(s,
    '  const accountCover = membership?.cover_image_url ?? null;\n',
    '  const accountCover = personalCoverEligible ? (membership?.cover_image_url ?? null) : null;\n',
    "profile header cover",
)
s = replace_once(s,
    '{section === "organization" && rid ? <OrganizationSection ar={ar} restaurantId={rid} canManageRestaurant={canManageRestaurant} /> : null}',
    '{section === "organization" && rid ? <OrganizationSection ar={ar} restaurantId={rid} canManageRestaurant={canManageRestaurant} showAccountCover={personalCoverEligible} /> : null}',
    "organization section call",
)
s = replace_once(s,
    'function OrganizationSection({ ar, restaurantId, canManageRestaurant }: { ar: boolean; restaurantId: string; canManageRestaurant: boolean }) {',
    'function OrganizationSection({ ar, restaurantId, canManageRestaurant, showAccountCover }: { ar: boolean; restaurantId: string; canManageRestaurant: boolean; showAccountCover: boolean }) {',
    "organization section signature",
)
s = replace_once(s,
    '    <AccountCoverEditor restaurantId={restaurantId} />\n',
    '    {showAccountCover ? <AccountCoverEditor restaurantId={restaurantId} /> : null}\n',
    "organization account cover",
)
write(path, s)

# Presence heartbeat: tighter interval for genuinely live Team presence.
path = "src/hooks/usePresenceHeartbeat.ts"
s = read(path)
s = s.replace('setInterval(() => void touch(), 45_000)', 'setInterval(() => void touch(), 30_000)')
write(path, s)

# Team roster: 15s fallback refresh + local clock tick so relative labels update even if no row changes.
path = "src/components/manage/StaffManagerAdvanced.tsx"
s = read(path)
s = replace_once(s,
    '  const [form, setForm] = useState({ name: "", email: "", role: "waiter" as AppRole });\n',
    '  const [form, setForm] = useState({ name: "", email: "", role: "waiter" as AppRole });\n  const [presenceNow, setPresenceNow] = useState(() => Date.now());\n\n  useEffect(() => {\n    const timer = window.setInterval(() => setPresenceNow(Date.now()), 15_000);\n    return () => window.clearInterval(timer);\n  }, []);\n',
    "team local presence clock",
)
s = s.replace('refetchInterval: 30_000,', 'refetchInterval: 15_000,', 1)
s = s.replace('formatLastSeen(member.last_seen_at, ar)', 'formatLastSeen(member.last_seen_at, ar, presenceNow)')
s = s.replace('function formatLastSeen(value: string | null | undefined, ar: boolean) {', 'function formatLastSeen(value: string | null | undefined, ar: boolean, nowMs = Date.now()) {')
s = s.replace('  const diff = Date.now() - date.getTime();', '  const diff = nowMs - date.getTime();')
write(path, s)

# QR lifecycle: scanning/opening a valid table QR activates a free table. The DB RPC is
# idempotent and refuses to overwrite reserved/out-of-service states.
path = "src/lib/diner.ts"
s = read(path)
anchor = '''  for (const result of [settingsRes, tableRes, categoriesRes, itemsRes, groupsRes, modifiersRes, pdfDocumentRes]) {
    if (result.error) throw result.error;
  }
'''
replacement = anchor + '''  if (qrToken && tableRes.data) {
    const { error: activationError } = await (supabase as any).rpc("activate_table_from_qr", { _qr_token: qrToken });
    if (activationError) console.warn("Table activation from QR skipped:", activationError.message);
  }
'''
s = replace_once(s, anchor, replacement, "diner QR activation")
write(path, s)

# Inventory movement history: surface Q x P total and whether Finance was auto-linked.
path = "src/components/backoffice/InventoryPanel.tsx"
s = read(path)
old = '''                    {Number(movement.unit_cost) > 0 ? (
                      <p className="text-xs text-muted-foreground">
                        {formatMoney(Number(movement.unit_cost), currency, lang)} / {historyItem?.unit}
                      </p>
                    ) : null}
'''
new = '''                    {Number(movement.unit_cost) > 0 ? (
                      <div className="space-y-0.5 text-xs text-muted-foreground">
                        <p>{formatMoney(Number(movement.unit_cost), currency, lang)} / {historyItem?.unit}</p>
                        <p className="font-semibold text-foreground">{lang === "ar" ? "الإجمالي" : "Total"}: {formatMoney(Number(movement.total_cost ?? Math.abs(Number(movement.quantity)) * Number(movement.unit_cost)), currency, lang)}</p>
                        {movement.movement_type === "receipt" ? <p className={movement.finance_expense_id ? "text-emerald-600" : "text-amber-600"}>{movement.finance_expense_id ? (lang === "ar" ? "تم ترحيله للمالية تلقائياً" : "Auto-posted to Finance") : (lang === "ar" ? "بانتظار الربط المالي" : "Finance link pending")}</p> : null}
                      </div>
                    ) : null}
'''
s = replace_once(s, old, new, "inventory history cost")
write(path, s)

print("Operations UX follow-up patches applied.")

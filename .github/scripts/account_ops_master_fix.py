from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[2]

def read(path):
    return (ROOT / path).read_text(encoding="utf-8")

def write(path, text):
    p = ROOT / path
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(text.rstrip() + "\n", encoding="utf-8")

def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected one match, found {count}")
    return text.replace(old, new, 1)

# Role routing: Host gets a dedicated workspace.
path = "src/lib/permissions.ts"
text = read(path)
text = replace_once(text, '  host: "/waiter",', '  host: "/host",', "host ROLE_HOME")
text = replace_once(text, '  if (roles.includes("waiter") || roles.includes("host")) return "/waiter";', '  if (roles.includes("host")) return "/host";\n  if (roles.includes("waiter")) return "/waiter";', "frontline host home")
write(path, text)

path = "src/components/nav/BottomNav.tsx"
text = read(path)
text = replace_once(text, '  host: { to: "/waiter", icon: UtensilsCrossed, en: "Host", ar: "الاستقبال" },', '  host: { to: "/host", icon: UtensilsCrossed, en: "Host", ar: "الاستقبال" },', "host bottom nav")
write(path, text)

# Presence heartbeat and role guards.
path = "src/routes/_authenticated/route.tsx"
text = read(path)
text = replace_once(text, 'import { useAccess } from "@/hooks/useSession";\n', 'import { useAccess } from "@/hooks/useSession";\nimport { usePresenceHeartbeat } from "@/hooks/usePresenceHeartbeat";\n', "presence import")
text = replace_once(text, '  const access = useAccess();\n  const { roles, isPending, isError } = access;', '  const access = useAccess();\n  usePresenceHeartbeat(!access.isPending && !access.isError);\n  const { roles, isPending, isError } = access;', "presence call")
text = replace_once(text, '    (pathname.startsWith("/waiter") && !roles.some((role) => role === "waiter" || role === "host")) ||\n    (pathname.startsWith("/cashier") && !roles.includes("cashier"))', '    (pathname.startsWith("/waiter") && !roles.includes("waiter")) ||\n    (pathname.startsWith("/host") && !roles.includes("host")) ||\n    (pathname.startsWith("/cashier") && !roles.includes("cashier"))', "host route guard")
write(path, text)

# Staff membership types now include presence and per-account cover.
path = "src/hooks/useSession.ts"
text = read(path)
text = replace_once(text, '  permission_overrides: PermissionOverrides | null;\n', '  permission_overrides: PermissionOverrides | null;\n  last_seen_at: string | null;\n  cover_image_url: string | null;\n  cover_position_x: number;\n  cover_position_y: number;\n  cover_zoom: number;\n', "membership fields")
text = replace_once(text, '"id, restaurant_id, role, name, is_active, avatar_url, avatar_preset, permission_overrides, restaurant:restaurants', '"id, restaurant_id, role, name, is_active, avatar_url, avatar_preset, permission_overrides, last_seen_at, cover_image_url, cover_position_x, cover_position_y, cover_zoom, restaurant:restaurants', "membership select")
write(path, text)

path = "src/hooks/useWorkspace.ts"
text = read(path)
text = replace_once(text, '  avatar_preset: string | null;\n};', '  avatar_preset: string | null;\n  last_seen_at: string | null;\n};', "workspace member last seen")
text = replace_once(text, '.select("id, name, email, role, is_active, avatar_url, avatar_preset")', '.select("id, name, email, role, is_active, avatar_url, avatar_preset, last_seen_at")', "workspace member select")
write(path, text)

# Authenticated personal cover uploads use the same secure profile storage namespace.
path = "src/lib/storage.ts"
text = read(path)
anchor = '''export async function uploadProfileImage(userId: string, file: File): Promise<string> {\n  if (!userId) throw new Error("Authentication required");\n  return uploadRestaurantMedia(`profiles/${userId}`, "avatar", file, 5 * 1024 * 1024);\n}\n'''
replacement = anchor + '''\nexport async function uploadProfileCover(userId: string, file: File): Promise<string> {\n  if (!userId) throw new Error("Authentication required");\n  return uploadRestaurantMedia(`profiles/${userId}`, "cover", file, 5 * 1024 * 1024);\n}\n'''
text = replace_once(text, anchor, replacement, "profile cover upload")
write(path, text)

# Expanded role-aware avatar catalogue, retaining existing assets and legacy mappings.
path = "src/lib/avatar-presets.ts"
text = read(path)
text = replace_once(text, '  role: "owner" | "manager" | "chef" | "cashier" | "server" | "kitchen";', '  role: "owner" | "manager" | "operations" | "shift_manager" | "chef" | "cashier" | "server" | "kitchen" | "host" | "inventory" | "procurement" | "finance";', "avatar role union")
insert_after = '  { id: "kitchen-female", label: "Kitchen · Female", role: "kitchen", gender: "female", url: portrait("kitchen-female") },\n'
extra = '''  { id: "operations-male", label: "Operations Manager · Male", role: "operations", gender: "male", url: portrait("manager-male") },\n  { id: "operations-female", label: "Operations Manager · Female", role: "operations", gender: "female", url: portrait("manager-female") },\n  { id: "shift-manager-male", label: "Shift Manager · Male", role: "shift_manager", gender: "male", url: portrait("owner-male") },\n  { id: "shift-manager-female", label: "Shift Manager · Female", role: "shift_manager", gender: "female", url: portrait("owner-female") },\n  { id: "host-male", label: "Host · Male", role: "host", gender: "male", url: portrait("server-male") },\n  { id: "host-female", label: "Host · Female", role: "host", gender: "female", url: portrait("server-female") },\n  { id: "inventory-male", label: "Inventory · Male", role: "inventory", gender: "male", url: portrait("kitchen-male") },\n  { id: "inventory-female", label: "Inventory · Female", role: "inventory", gender: "female", url: portrait("kitchen-female") },\n  { id: "procurement-male", label: "Procurement · Male", role: "procurement", gender: "male", url: portrait("manager-male") },\n  { id: "procurement-female", label: "Procurement · Female", role: "procurement", gender: "female", url: portrait("manager-female") },\n  { id: "finance-male", label: "Finance · Male", role: "finance", gender: "male", url: portrait("cashier-male") },\n  { id: "finance-female", label: "Finance · Female", role: "finance", gender: "female", url: portrait("cashier-female") },\n'''
text = replace_once(text, insert_after, insert_after + extra, "avatar options")
write(path, text)

path = "src/components/profile/ProfileAvatarEditor.tsx"
text = read(path)
text = replace_once(text, '          {(["all", "owner", "manager", "chef", "cashier", "server", "kitchen"] as const).map((role) =>', '          {(["all", "owner", "manager", "operations", "shift_manager", "chef", "cashier", "server", "kitchen", "host", "inventory", "procurement", "finance"] as const).map((role) =>', "avatar filters")
write(path, text)

# Operations API: manager delete + safe staff self-service assignment status.
path = "src/hooks/useOperations.ts"
text = read(path)
anchor = '''export async function closeShift(id: string, staffId: string) {\n  const result = await fromOperations("shifts").update({ status: "closed", actual_closed_at: new Date().toISOString(), closed_by_staff_id: staffId }).eq("id", id) as unknown as { error: Error | null };\n  await expectNoError(result);\n}\n'''
replacement = anchor + '''\nexport async function deleteShift(id: string) {\n  const result = await fromOperations("shifts").delete().eq("id", id) as unknown as { error: Error | null };\n  await expectNoError(result);\n}\n\nexport async function updateOwnShiftAssignmentStatus(id: string, status: "present" | "released") {\n  const { error } = await (supabase as any).rpc("update_own_shift_assignment_status", { _assignment_id: id, _status: status });\n  if (error) throw error;\n}\n'''
text = replace_once(text, anchor, replacement, "shift operations")
write(path, text)

# Profile: organization tab for everyone, personal cover for all, manager-only full organization controls.
path = "src/routes/_authenticated/profile.tsx"
text = read(path)
text = replace_once(text, 'import { ProfileAvatarEditor } from "@/components/profile/ProfileAvatarEditor";\n', 'import { ProfileAvatarEditor } from "@/components/profile/ProfileAvatarEditor";\nimport { AccountCoverEditor } from "@/components/profile/AccountCoverEditor";\n', "cover editor import")
text = re.sub(r'\n  useEffect\(\(\) => \{\n    if \(section === "organization" && !canManageRestaurant\) setSection\("profile"\);\n  \}, \[canManageRestaurant, section\]\);\n', '\n', text, count=1)
old_nav = '    ...(canManageRestaurant ? [{ id: "organization" as const, icon: Store, label: ar ? "المؤسسة والمظهر" : "Organization & appearance", hint: ar ? "الهوية والألوان والغلاف" : "Brand, colors and cover" }] : []),'
new_nav = '    { id: "organization" as const, icon: Store, label: ar ? "المؤسسة والمظهر" : "Organization & appearance", hint: canManageRestaurant ? (ar ? "الهوية والألوان والغلاف" : "Brand, colors and cover") : (ar ? "غلاف حسابك" : "Your account cover") },'
text = replace_once(text, old_nav, new_nav, "organization nav")
text = replace_once(text, '  const avatar = membership?.avatar_url || avatarPresetUrl(membership?.avatar_preset) || meta?.avatar_url || avatarPresetUrl(meta?.avatar_preset ?? null);', '  const avatar = membership?.avatar_url || avatarPresetUrl(membership?.avatar_preset) || meta?.avatar_url || avatarPresetUrl(meta?.avatar_preset ?? null);\n  const accountCover = membership?.cover_image_url ?? null;\n  const accountCoverX = Number(membership?.cover_position_x ?? 50);\n  const accountCoverY = Number(membership?.cover_position_y ?? 50);\n  const accountCoverZoom = Number(membership?.cover_zoom ?? 100);', "account cover state")
text = replace_once(text, '        <div className="absolute inset-x-0 top-0 h-28 bg-[radial-gradient(circle_at_18%_0%,rgba(255,90,10,.15),transparent_55%)]" />', '        {accountCover ? <><img src={accountCover} alt="" className="pointer-events-none absolute inset-0 size-full object-cover opacity-30" style={{ objectPosition: `${accountCoverX}% ${accountCoverY}%`, transform: `scale(${accountCoverZoom / 100})` }} /><div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-card/95 via-card/78 to-card/55" /></> : <div className="absolute inset-x-0 top-0 h-28 bg-[radial-gradient(circle_at_18%_0%,rgba(255,90,10,.15),transparent_55%)]" />}', "profile hero cover")
text = replace_once(text, '          {section === "organization" && rid && canManageRestaurant ? <OrganizationSection ar={ar} restaurantId={rid} /> : null}', '          {section === "organization" && rid ? <OrganizationSection ar={ar} restaurantId={rid} canManageRestaurant={canManageRestaurant} /> : null}', "organization render")
pattern = re.compile(r'function OrganizationSection\(\{ ar, restaurantId \}: \{ ar: boolean; restaurantId: string \}\) \{[\s\S]*?\n\}\n\nfunction SectionHeading')
match = pattern.search(text)
if not match:
    raise RuntimeError("OrganizationSection block not found")
org = '''function OrganizationSection({ ar, restaurantId, canManageRestaurant }: { ar: boolean; restaurantId: string; canManageRestaurant: boolean }) {\n  return <div className="space-y-5">\n    <SectionHeading icon={<Store className="size-5" />} title={ar ? "المؤسسة والمظهر" : "Organization & appearance"} description={canManageRestaurant ? (ar ? "إدارة هوية المطعم وإعدادات الحساب من مساحة واحدة منظمة." : "Manage restaurant identity and your account appearance from one organized workspace.") : (ar ? "خصص غلاف حسابك فقط بدون التأثير على هوية المطعم أو إعداداته." : "Customize only your account cover without changing restaurant branding or settings.")} />\n    <AccountCoverEditor restaurantId={restaurantId} />\n    {canManageRestaurant ? <>\n      <div className="flex flex-wrap gap-2 rounded-2xl border border-border bg-muted/20 p-3 text-[10px] font-bold text-muted-foreground">\n        <span className="inline-flex items-center gap-1.5 rounded-full bg-card px-3 py-2"><Building2 className="size-3.5" />{ar ? "هوية المطعم" : "Restaurant identity"}</span>\n        <span className="inline-flex items-center gap-1.5 rounded-full bg-card px-3 py-2"><Palette className="size-3.5" />{ar ? "نظام الألوان" : "Color system"}</span>\n        <span className="inline-flex items-center gap-1.5 rounded-full bg-card px-3 py-2"><SlidersHorizontal className="size-3.5" />{ar ? "مظهر مساحة العمل" : "Workspace appearance"}</span>\n      </div>\n      <RestaurantProfileSettings restaurantId={restaurantId} />\n    </> : <section className="rounded-2xl border border-border bg-muted/20 p-4 text-xs leading-5 text-muted-foreground">{ar ? "إعدادات الشعار والألوان والمطعم تبقى تحت إدارة مدير المطعم. هذا الحساب يستطيع تعديل غلافه الشخصي فقط." : "Restaurant logos, colors and organization settings remain controlled by the Restaurant Manager. This account can edit only its personal cover."}</section>}\n  </div>;\n}\n\nfunction SectionHeading'''
text = text[:match.start()] + org + text[match.end():]
write(path, text)

# Team: true last-seen presence + reliable self-name RPC.
path = "src/components/manage/StaffManagerAdvanced.tsx"
text = read(path)
text = replace_once(text, 'import { useMemo, useState } from "react";', 'import { useEffect, useMemo, useState } from "react";', "staff effect import")
text = replace_once(text, '  permission_overrides?: PermissionOverrides | null;\n};', '  permission_overrides?: PermissionOverrides | null;\n  last_seen_at?: string | null;\n};', "staff row last seen")
text = replace_once(text, '    queryKey: ["platform", "staff", restaurantId],\n    queryFn:', '    queryKey: ["platform", "staff", restaurantId],\n    refetchInterval: 30_000,\n    refetchIntervalInBackground: false,\n    queryFn:', "staff polling")
query_end = '  });\n  const audit = useQuery<AuditRow[]>({'
realtime = '''  });\n  useEffect(() => {\n    const channel = supabase.channel(`team-presence:${restaurantId}`).on(\n      "postgres_changes",\n      { event: "UPDATE", schema: "public", table: "staff", filter: `restaurant_id=eq.${restaurantId}` },\n      () => void qc.invalidateQueries({ queryKey: ["platform", "staff", restaurantId] }),\n    ).subscribe();\n    return () => { void supabase.removeChannel(channel); };\n  }, [qc, restaurantId]);\n  const audit = useQuery<AuditRow[]>({'''
text = replace_once(text, query_end, realtime, "team realtime")
old_self = '''        const { error: authError } = await supabase.auth.updateUser({ data: { full_name: nextName, name: nextName } });\n        if (authError) throw authError;\n        const { error: staffError } = await (supabase.from("staff") as any)\n          .update({ name: nextName })\n          .eq("id", editing.id)\n          .eq("auth_user_id", currentUserId!)\n          .eq("restaurant_id", restaurantId);\n        if (staffError) throw staffError;'''
new_self = '''        const { error: staffError } = await (supabase as any).rpc("update_own_display_name", { _staff_id: editing.id, _name: nextName });\n        if (staffError) throw staffError;\n        const { error: metadataError } = await supabase.auth.updateUser({ data: { full_name: nextName, name: nextName } });\n        if (metadataError) console.warn("Display-name metadata sync skipped:", metadataError.message);'''
text = replace_once(text, old_self, new_self, "self rename rpc")
text = text.replace('member.is_active ? (ar ? "الآن" : "Now") : "—"', 'formatLastSeen(member.last_seen_at, ar)')
if 'function formatLastSeen(' not in text:
    text += '''\nfunction formatLastSeen(value: string | null | undefined, ar: boolean) {\n  if (!value) return ar ? "لم يظهر بعد" : "No activity yet";\n  const date = new Date(value);\n  const diff = Date.now() - date.getTime();\n  if (!Number.isFinite(diff)) return "—";\n  if (diff <= 90_000) return ar ? "متصل الآن" : "Online now";\n  const minutes = Math.floor(diff / 60_000);\n  if (minutes < 60) return ar ? `قبل ${minutes} د` : `${minutes} min ago`;\n  const now = new Date();\n  if (date.toDateString() === now.toDateString()) return ar ? `اليوم ${date.toLocaleTimeString("ar-JO", { hour: "2-digit", minute: "2-digit" })}` : `Today ${date.toLocaleTimeString("en-JO", { hour: "2-digit", minute: "2-digit" })}`;\n  return date.toLocaleString(ar ? "ar-JO" : "en-JO", { dateStyle: "medium", timeStyle: "short" });\n}\n'''
write(path, text)

# Shifts: discoverable manager controls, delete confirmation, self start/end, handover acknowledge.
path = "src/routes/_authenticated/shifts.tsx"
text = read(path)
text = replace_once(text, 'import { CalendarClock, CheckCircle2, Clock3, Handshake, PlayCircle, Plus, StopCircle, UserPlus, UsersRound } from "lucide-react";', 'import { CalendarClock, CheckCircle2, Clock3, Handshake, PlayCircle, Plus, StopCircle, Trash2, UserPlus, UsersRound } from "lucide-react";', "shift trash icon")
text = replace_once(text, '  assignStaffToShift,\n  closeShift,\n  createShift,', '  acknowledgeShiftHandover,\n  assignStaffToShift,\n  closeShift,\n  createShift,\n  deleteShift,', "shift imports 1")
text = replace_once(text, '  updateShiftAssignment,\n', '  updateOwnShiftAssignmentStatus,\n  updateShiftAssignment,\n', "shift imports 2")
text = replace_once(text, '  const [closingShift, setClosingShift] = useState<Shift | null>(null);', '  const [closingShift, setClosingShift] = useState<Shift | null>(null);\n  const [deletingShift, setDeletingShift] = useState<Shift | null>(null);', "delete state")
text = replace_once(text, '<ShiftRow key={shift.id} shift={shift} assignments={(assignments.data ?? []).filter((row) => row.shift_id === shift.id)} canManage={canManage} currentStaffId={membership.id} ar={ar} lang={lang} onClose={() => setClosingShift(shift)} />', '<ShiftRow key={shift.id} shift={shift} assignments={(assignments.data ?? []).filter((row) => row.shift_id === shift.id)} canManage={canManage} currentStaffId={membership.id} ar={ar} lang={lang} onClose={() => setClosingShift(shift)} onDelete={() => setDeletingShift(shift)} />', "shift row props")
# Replace handover card mapping with actionable component.
old_handover = '<div key={handover.id} className="p-4"><div className="flex items-center gap-2"><Handshake className="size-4 text-[#ff5a0a]" /><strong className="text-sm">{handover.summary}</strong></div>{handover.unresolved_items ? <p className="mt-2 text-xs leading-5 text-muted-foreground">{handover.unresolved_items}</p> : null}<div className="mt-2 flex justify-between gap-2 text-[10px] text-muted-foreground"><span>{handover.target_role ? ROLE_LABELS[handover.target_role]?.[lang] ?? handover.target_role : (ar ? "موظف محدد" : "Specific teammate")}</span><span>{handover.acknowledged_at ? (ar ? "تم الاستلام" : "Acknowledged") : (ar ? "بانتظار الاستلام" : "Pending")}</span></div></div>'
new_handover = '<HandoverItem key={handover.id} handover={handover} currentStaffId={membership.id} restaurantId={rid} ar={ar} lang={lang} />'
text = replace_once(text, old_handover, new_handover, "handover card")
text = replace_once(text, '    {canManage && closingShift ? <CloseShiftDialog shift={closingShift} openWorkCount={openWork.data ?? 0} restaurantId={rid} currentStaffId={membership.id} onClose={() => setClosingShift(null)} ar={ar} lang={lang} /> : null}\n', '    {canManage && closingShift ? <CloseShiftDialog shift={closingShift} openWorkCount={openWork.data ?? 0} restaurantId={rid} currentStaffId={membership.id} onClose={() => setClosingShift(null)} ar={ar} lang={lang} /> : null}\n    {canManage && deletingShift ? <DeleteShiftDialog shift={deletingShift} restaurantId={rid} onClose={() => setDeletingShift(null)} ar={ar} lang={lang} /> : null}\n', "delete dialog render")
text = replace_once(text, '<AssignmentChip key={assignment.id} assignment={assignment} name={member?.name ?? (assignment.staff_id === currentStaffId ? (ar ? "أنت" : "You") : (ar ? "عضو فريق" : "Team member"))} canManage={canManage} restaurantId={shift.restaurant_id} ar={ar} lang={lang} />', '<AssignmentChip key={assignment.id} assignment={assignment} name={member?.name ?? (assignment.staff_id === currentStaffId ? (ar ? "أنت" : "You") : (ar ? "عضو فريق" : "Team member"))} canManage={canManage} isSelf={assignment.staff_id === currentStaffId} restaurantId={shift.restaurant_id} ar={ar} lang={lang} />', "assignment self prop")
pattern = re.compile(r'function ShiftRow\([\s\S]*?\n\}\n\nfunction AssignmentChip')
match = pattern.search(text)
if not match:
    raise RuntimeError("ShiftRow block not found")
shiftrow = '''function ShiftRow({ shift, assignments, canManage, currentStaffId, ar, lang, onClose, onDelete }: { shift: Shift; assignments: ShiftAssignment[]; canManage: boolean; currentStaffId: string; ar: boolean; lang: "en" | "ar"; onClose: () => void; onDelete: () => void }) {\n  const qc = useQueryClient();\n  const open = useMutation({ mutationFn: () => openShift(shift.id, currentStaffId), onSuccess: async () => { await qc.invalidateQueries({ queryKey: ["operations", "shifts", shift.restaurant_id] }); await qc.invalidateQueries({ queryKey: ["operations", "automated-alerts", shift.restaurant_id] }); toast.success(ar ? "تم فتح الوردية" : "Shift opened"); }, onError: (error) => toast.error(humanError(error, lang)) });\n  const self = assignments.find((row) => row.staff_id === currentStaffId) ?? null;\n  return <article className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-bold">{shift.name}</h3><Status status={shift.status} ar={ar} />{self ? <span className="rounded-full bg-muted px-2 py-1 text-[10px] font-bold capitalize text-muted-foreground">{self.status}</span> : null}</div><div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-muted-foreground"><span>{shift.shift_date}</span><span>{formatWindow(shift, ar)}</span><span className="inline-flex items-center gap-1"><UsersRound className="size-3" />{assignments.length}</span></div></div><div className="flex flex-wrap items-center gap-2">{self && !canManage && shift.status === "open" ? <SelfShiftControls assignment={self} restaurantId={shift.restaurant_id} ar={ar} lang={lang} /> : null}{canManage ? <>{shift.status === "planned" ? <Button size="sm" disabled={open.isPending} onClick={() => open.mutate()} className="gap-2"><PlayCircle className="size-4" />{ar ? "فتح" : "Open"}</Button> : null}{shift.status === "open" ? <Button size="sm" variant="outline" onClick={onClose}>{ar ? "إغلاق" : "Close"}</Button> : null}{shift.status !== "open" ? <Button size="sm" variant="ghost" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={onDelete}><Trash2 className="size-4" />{ar ? "حذف" : "Delete"}</Button> : <span className="text-[10px] text-muted-foreground">{ar ? "أغلق الوردية قبل حذفها" : "Close before deleting"}</span>}</> : null}</div></article>;\n}\n\nfunction AssignmentChip'''
text = text[:match.start()] + shiftrow + text[match.end():]
pattern = re.compile(r'function AssignmentChip\([\s\S]*?\n\}\n\nfunction CreateShiftDialog')
match = pattern.search(text)
if not match:
    raise RuntimeError("AssignmentChip block not found")
assignment = '''function AssignmentChip({ assignment, name, canManage, isSelf, restaurantId, ar, lang }: { assignment: ShiftAssignment; name: string; canManage: boolean; isSelf: boolean; restaurantId: string; ar: boolean; lang: "en" | "ar" }) {\n  const qc = useQueryClient();\n  const update = useMutation({ mutationFn: (status: ShiftAssignmentStatus) => updateShiftAssignment(assignment.id, { status }), onSuccess: async () => { await qc.invalidateQueries({ queryKey: ["operations", "shift-assignments", restaurantId] }); }, onError: (error) => toast.error(humanError(error, lang)) });\n  const remove = useMutation({ mutationFn: () => removeShiftAssignment(assignment.id), onSuccess: async () => { await qc.invalidateQueries({ queryKey: ["operations", "shift-assignments", restaurantId] }); }, onError: (error) => toast.error(humanError(error, lang)) });\n  if (!canManage) return <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card p-1 ps-3"><span className="text-xs font-semibold">{name}</span><span className="rounded-full bg-muted px-2 py-1 text-[10px] font-bold capitalize text-muted-foreground">{assignment.status}</span>{isSelf ? <SelfShiftControls assignment={assignment} restaurantId={restaurantId} ar={ar} lang={lang} compact /> : null}</div>;\n  return <div className="inline-flex items-center gap-1 rounded-full border border-border bg-card p-1 ps-3"><span className="text-xs font-semibold">{name}</span><Select value={assignment.status} onValueChange={(value) => update.mutate(value as ShiftAssignmentStatus)}><SelectTrigger className="h-7 w-[112px] border-0 bg-transparent px-2 text-[10px] shadow-none"><SelectValue /></SelectTrigger><SelectContent>{(["scheduled","present","late","absent","released"] as ShiftAssignmentStatus[]).map((status) => <SelectItem key={status} value={status}>{status}</SelectItem>)}</SelectContent></Select><button type="button" onClick={() => remove.mutate()} className="rounded-full px-2 py-1 text-[10px] text-muted-foreground hover:text-destructive" aria-label={ar ? "إزالة" : "Remove"}>×</button></div>;\n}\n\nfunction SelfShiftControls({ assignment, restaurantId, ar, lang, compact = false }: { assignment: ShiftAssignment; restaurantId: string; ar: boolean; lang: "en" | "ar"; compact?: boolean }) {\n  const qc = useQueryClient();\n  const update = useMutation({ mutationFn: (status: "present" | "released") => updateOwnShiftAssignmentStatus(assignment.id, status), onSuccess: async (_data, status) => { await qc.invalidateQueries({ queryKey: ["operations", "shift-assignments", restaurantId] }); toast.success(status === "present" ? (ar ? "تم بدء الوردية" : "Shift started") : (ar ? "تم إنهاء الوردية" : "Shift ended")); }, onError: (error) => toast.error(humanError(error, lang)) });\n  if (assignment.status === "released") return <span className="px-2 text-[10px] font-bold text-muted-foreground">{ar ? "تم الانتهاء" : "Ended"}</span>;\n  const present = assignment.status === "present";\n  return <Button size="sm" variant={present ? "outline" : "default"} className={compact ? "h-7 rounded-full px-2 text-[10px]" : "h-9"} disabled={update.isPending} onClick={() => update.mutate(present ? "released" : "present")}>{present ? (ar ? "إنهاء ورديتي" : "End my shift") : (ar ? "بدء ورديتي" : "Start my shift")}</Button>;\n}\n\nfunction HandoverItem({ handover, currentStaffId, restaurantId, ar, lang }: { handover: any; currentStaffId: string; restaurantId: string; ar: boolean; lang: "en" | "ar" }) {\n  const qc = useQueryClient();\n  const acknowledge = useMutation({ mutationFn: () => acknowledgeShiftHandover(handover.id, currentStaffId), onSuccess: async () => { await qc.invalidateQueries({ queryKey: ["operations", "shift-handovers", restaurantId] }); toast.success(ar ? "تم استلام التسليم" : "Handover acknowledged"); }, onError: (error) => toast.error(humanError(error, lang)) });\n  return <div className="p-4"><div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-2"><Handshake className="size-4 text-[#ff5a0a]" /><strong className="text-sm">{handover.summary}</strong></div>{handover.unresolved_items ? <p className="mt-2 text-xs leading-5 text-muted-foreground">{handover.unresolved_items}</p> : null}</div>{!handover.acknowledged_at ? <Button size="sm" variant="outline" disabled={acknowledge.isPending} onClick={() => acknowledge.mutate()}>{ar ? "استلام" : "Acknowledge"}</Button> : null}</div><div className="mt-2 flex justify-between gap-2 text-[10px] text-muted-foreground"><span>{handover.target_role ? ROLE_LABELS[handover.target_role]?.[lang] ?? handover.target_role : (ar ? "موظف محدد" : "Specific teammate")}</span><span>{handover.acknowledged_at ? (ar ? "تم الاستلام" : "Acknowledged") : (ar ? "بانتظار الاستلام" : "Pending")}</span></div></div>;\n}\n\nfunction DeleteShiftDialog({ shift, restaurantId, onClose, ar, lang }: { shift: Shift; restaurantId: string; onClose: () => void; ar: boolean; lang: "en" | "ar" }) {\n  const qc = useQueryClient();\n  const remove = useMutation({ mutationFn: () => deleteShift(shift.id), onSuccess: async () => { await Promise.all([qc.invalidateQueries({ queryKey: ["operations", "shifts", restaurantId] }), qc.invalidateQueries({ queryKey: ["operations", "shift-assignments", restaurantId] }), qc.invalidateQueries({ queryKey: ["operations", "shift-handovers", restaurantId] })]); toast.success(ar ? "تم حذف الوردية" : "Shift deleted"); onClose(); }, onError: (error) => toast.error(humanError(error, lang)) });\n  return <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}><DialogContent className="sm:max-w-[460px]"><DialogHeader><DialogTitle>{ar ? "حذف الوردية؟" : "Delete shift?"}</DialogTitle><DialogDescription>{ar ? `سيتم حذف ${shift.name} وتعيينات الفريق المرتبطة بها. تبقى سجلات التسليم محفوظة بدون ربط بالوردية.` : `This removes ${shift.name} and its team assignments. Existing handover records are preserved but detached from the deleted shift.`}</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={onClose}>{ar ? "إلغاء" : "Cancel"}</Button><Button variant="destructive" disabled={remove.isPending} onClick={() => remove.mutate()}><Trash2 className="size-4" />{ar ? "حذف الوردية" : "Delete shift"}</Button></DialogFooter></DialogContent></Dialog>;\n}\n\nfunction CreateShiftDialog'''
text = text[:match.start()] + assignment + text[match.end():]
write(path, text)

# Sanity checks.
checks = {
    "src/lib/permissions.ts": ['host: "/host"'],
    "src/routes/_authenticated/route.tsx": ['usePresenceHeartbeat', 'pathname.startsWith("/host")'],
    "src/components/manage/StaffManagerAdvanced.tsx": ['update_own_display_name', 'formatLastSeen'],
    "src/routes/_authenticated/shifts.tsx": ['DeleteShiftDialog', 'SelfShiftControls'],
    "src/routes/_authenticated/profile.tsx": ['AccountCoverEditor', 'canManageRestaurant={canManageRestaurant}'],
}
for filename, needles in checks.items():
    body = read(filename)
    for needle in needles:
        if needle not in body:
            raise RuntimeError(f"Verification failed: {needle} missing from {filename}")

print("Account operations master fix applied.")

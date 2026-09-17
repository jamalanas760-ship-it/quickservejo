from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")

def write(path: str, content: str) -> None:
    (ROOT / path).write_text(content, encoding="utf-8")

def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected 1 match, got {count}")
    return text.replace(old, new, 1)

# Profile: remove Restaurant Manager name editing. Keep identity read-only here.
profile_path = "src/routes/_authenticated/profile.tsx"
profile = read(profile_path)
for token in ["  Loader2,\n", "  Pencil,\n", "  User,\n"]:
    profile = profile.replace(token, "")
profile = profile.replace('import { Input } from "@/components/ui/input";\n', '')
profile = profile.replace('import { toast } from "sonner";\n', '')
profile = replace_once(profile,
    '            <p className="mt-2 text-[11px] leading-5 text-muted-foreground">{ar ? "يمكن لمدير المطعم تعديل اسمه، بينما تبقى بيانات الصلاحيات والحساب الأخرى محمية." : "Restaurant Managers can edit their name while access and account-scope details remain protected."}</p>',
    '            <p className="mt-2 text-[11px] leading-5 text-muted-foreground">{ar ? "بيانات الحساب هنا للعرض. يتم تعديل اسم مدير المطعم من صفحة الفريق." : "Account identity is read-only here. Restaurant Manager names are edited from the Team page."}</p>',
    "profile sidebar hint")
profile = replace_once(profile,
    '          {section === "profile" ? <PersonalSection ar={ar} lang={lang} rid={rid} displayName={displayName} email={email} roleLabel={roleLabel} restaurantName={restaurantName} createdAt={user?.created_at} userId={user?.id ?? null} membershipId={membership?.id ?? null} canEditName={Boolean(access.isSuperAdmin || membership?.role === "restaurant_admin")} /> : null}',
    '          {section === "profile" ? <PersonalSection ar={ar} lang={lang} rid={rid} displayName={displayName} email={email} roleLabel={roleLabel} restaurantName={restaurantName} createdAt={user?.created_at} /> : null}',
    "profile personal call")
start = profile.index('function PersonalSection(')
end = profile.index('\nfunction NotificationsSection(', start)
profile = profile[:start] + '''function PersonalSection({ ar, lang, rid, displayName, email, roleLabel, restaurantName, createdAt }: { ar: boolean; lang: "ar" | "en"; rid: string | null; displayName: string; email: string; roleLabel: string; restaurantName: string; createdAt: string | undefined }) {
  return <div className="space-y-5">
    <SectionHeading icon={<UserRound className="size-5" />} title={ar ? "الملف الشخصي" : "Personal profile"} description={ar ? "حدّث صورتك وراجع معلومات حسابك. يتم تعديل اسم مدير المطعم من صفحة الفريق." : "Update your profile image and review account details. Restaurant Manager names are managed from the Team page."} />
    <section className="qs-card overflow-hidden"><div className="p-4 sm:p-6"><ProfileAvatarEditor restaurantId={rid} /></div></section>
    <section className="qs-card overflow-hidden">
      <div className="border-b border-border px-5 py-4 sm:px-6"><h2 className="text-sm font-bold">{ar ? "تفاصيل الحساب" : "Account details"}</h2><p className="mt-1 text-xs text-muted-foreground">{ar ? "بيانات الهوية والدور هنا للعرض فقط. غيّر اسم مدير المطعم من صفحة الفريق." : "Identity and role details are read-only here. Change the Restaurant Manager name from Team."}</p></div>
      <div className="grid gap-px bg-border sm:grid-cols-2">
        <InfoTile icon={<UserRound className="size-4" />} label={ar ? "الاسم الكامل" : "Full name"} value={displayName} />
        <InfoTile icon={<Mail className="size-4" />} label={ar ? "البريد الإلكتروني" : "Email address"} value={email} />
        <InfoTile icon={<ShieldCheck className="size-4" />} label={ar ? "الدور" : "Role"} value={roleLabel} />
        <InfoTile icon={<Building2 className="size-4" />} label={ar ? "المطعم" : "Restaurant"} value={restaurantName} />
        <InfoTile icon={<CheckCircle2 className="size-4" />} label={ar ? "حالة الحساب" : "Account status"} value={ar ? "نشط" : "Active"} accent />
        <InfoTile icon={<CalendarDays className="size-4" />} label={ar ? "عضو منذ" : "Member since"} value={createdAt ? formatDate(createdAt, lang) : "—"} />
      </div>
    </section>
  </div>;
}
''' + profile[end:]
write(profile_path, profile)

# Team: current Restaurant Manager can edit only their own name here.
staff_path = "src/components/manage/StaffManagerAdvanced.tsx"
staff = read(staff_path)
staff = replace_once(staff,
    'import { useAccess } from "@/hooks/useSession";',
    'import { useAccess, useSupabaseSession } from "@/hooks/useSession";',
    "staff session import")
staff = replace_once(staff,
    '  const accessHook = useAccess();\n  const isSuperAdmin = accessHook.isSuperAdmin;',
    '  const accessHook = useAccess();\n  const session = useSupabaseSession();\n  const currentUserId = session.data?.user.id ?? null;\n  const isSuperAdmin = accessHook.isSuperAdmin;',
    "staff session setup")
staff = replace_once(staff,
    '  function startEdit(member: StaffRow) {\n    setEditing({ ...member, password: "", confirmPassword: "", permission_overrides: { ...(member.permission_overrides ?? {}) } });\n    setDrawerTab("permissions");\n  }',
    '  function isOwnRestaurantManager(member: StaffRow) {\n    return !isSuperAdmin && member.role === "restaurant_admin" && Boolean(currentUserId) && member.auth_user_id === currentUserId;\n  }\n  function startEdit(member: StaffRow) {\n    setEditing({ ...member, password: "", confirmPassword: "", permission_overrides: { ...(member.permission_overrides ?? {}) } });\n    setDrawerTab(isOwnRestaurantManager(member) ? "profile" : "permissions");\n  }',
    "staff start edit")
old_save_start = staff.index('  async function saveEdit() {')
old_save_end = staff.index('\n  async function del()', old_save_start)
new_save = '''  async function saveEdit() {
    if (!editing) return;
    const password = editing.password.trim();
    const nextName = editing.name.trim().replace(/\\s+/g, " ");
    if (!nextName) {
      toast.error(ar ? "الاسم مطلوب." : "Name is required.");
      return;
    }
    if (nextName.length > 80) {
      toast.error(ar ? "الاسم طويل جداً. الحد الأقصى 80 حرفاً." : "The name is too long. Maximum 80 characters.");
      return;
    }
    const ownRestaurantManager = isOwnRestaurantManager(editing);
    if (!ownRestaurantManager) {
      if (password && password.length < 8) {
        toast.error(ar ? "كلمة المرور 8 أحرف على الأقل." : "Password must be at least 8 characters.");
        return;
      }
      if (password !== editing.confirmPassword) {
        toast.error(ar ? "كلمتا المرور غير متطابقتين." : "Passwords do not match.");
        return;
      }
    }
    setBusy(true);
    try {
      if (ownRestaurantManager) {
        const { error: authError } = await supabase.auth.updateUser({ data: { full_name: nextName, name: nextName } });
        if (authError) throw authError;
        const { error: staffError } = await (supabase.from("staff") as any)
          .update({ name: nextName })
          .eq("id", editing.id)
          .eq("auth_user_id", currentUserId!)
          .eq("restaurant_id", restaurantId);
        if (staffError) throw staffError;
        await Promise.all([
          refresh(),
          qc.invalidateQueries({ queryKey: ["auth", "session"] }),
          qc.invalidateQueries({ queryKey: ["staff", "memberships"] }),
        ]);
        setEditing(null);
        toast.success(ar ? "تم تحديث اسم مدير المطعم" : "Restaurant Manager name updated");
        return;
      }
      await update({ data: { staffId: editing.id, name: nextName, email: editing.email?.trim() || undefined, role: editing.role, isActive: editing.is_active, permissionOverrides: editing.permission_overrides, ...(password ? { password } : {}) } });
      await refresh();
      setEditing(null);
      toast.success(ar ? "تم حفظ التغييرات" : "Changes saved");
    } catch (error) {
      toast.error(humanError(error, lang));
    } finally {
      setBusy(false);
    }
  }
'''
staff = staff[:old_save_start] + new_save + staff[old_save_end:]
staff = staff.replace('const locked = member.role === "restaurant_admin" && !isSuperAdmin;', 'const locked = member.role === "restaurant_admin" && !isSuperAdmin && !isOwnRestaurantManager(member);')
# For self-manager, open Profile only, protect email/access/delete.
staff = replace_once(staff,
    '        {editing ? <>\n          <div className="border-b border-border px-4 py-4 sm:px-6">',
    '        {editing ? <>\n          {(() => { const ownRestaurantManager = isOwnRestaurantManager(editing); return <>\n          <div className="border-b border-border px-4 py-4 sm:px-6">',
    "staff wrapper open")
staff = replace_once(staff,
    '          <div className="flex shrink-0 overflow-x-auto border-b border-border px-2 sm:px-4">{([["permissions", ar ? "الصلاحيات" : "Permissions", ShieldCheck], ["profile", ar ? "الملف" : "Profile", UserRound], ["log", ar ? "سجل الوصول" : "Access Log", History]] as const).map(([id, label, Icon]) => <button key={id} type="button" onClick={() => setDrawerTab(id)} className={cn("relative flex min-h-14 min-w-[140px] flex-1 items-center justify-center gap-2 px-3 text-sm font-semibold", drawerTab === id ? "text-[#ff5a0a]" : "text-muted-foreground hover:text-foreground")}><Icon className="size-4" />{label}{drawerTab === id ? <span className="absolute inset-x-4 bottom-0 h-0.5 rounded-full bg-[#ff5a0a]" /> : null}</button>)}</div>',
    '          <div className="flex shrink-0 overflow-x-auto border-b border-border px-2 sm:px-4">{(ownRestaurantManager ? [["profile", ar ? "الاسم" : "Manager name", UserRound]] as const : [["permissions", ar ? "الصلاحيات" : "Permissions", ShieldCheck], ["profile", ar ? "الملف" : "Profile", UserRound], ["log", ar ? "سجل الوصول" : "Access Log", History]] as const).map(([id, label, Icon]) => <button key={id} type="button" onClick={() => setDrawerTab(id)} className={cn("relative flex min-h-14 min-w-[140px] flex-1 items-center justify-center gap-2 px-3 text-sm font-semibold", drawerTab === id ? "text-[#ff5a0a]" : "text-muted-foreground hover:text-foreground")}><Icon className="size-4" />{label}{drawerTab === id ? <span className="absolute inset-x-4 bottom-0 h-0.5 rounded-full bg-[#ff5a0a]" /> : null}</button>)}</div>',
    "staff tabs")
old_profile = '<section className="rounded-2xl border border-border bg-card p-5 shadow-sm"><h3 className="text-base font-bold">{ar ? "معلومات المستخدم" : "User profile"}</h3><p className="mt-1 text-xs text-muted-foreground">{ar ? "يمكن تعديل الاسم والبريد وحفظهما مع بقية التغييرات." : "Edit the name and email here; they are saved with the rest of the changes."}</p><div className="mt-5 grid gap-4 sm:grid-cols-2"><Field label={ar ? "الاسم" : "Name"}><Input value={editing.name} onChange={(event) => setEditing({ ...editing, name: event.target.value })} /></Field><Field label={ar ? "البريد الإلكتروني" : "Email"}><Input type="email" value={editing.email ?? ""} onChange={(event) => setEditing({ ...editing, email: event.target.value })} /></Field><Read label={ar ? "الدور" : "Role"} value={ROLE_NAMES[editing.role][lang]} /><Read label={ar ? "تاريخ الإضافة" : "Joined"} value={new Date(editing.created_at).toLocaleDateString(ar ? "ar-JO" : "en-US")} /></div><button type="button" className="qs-button-secondary mt-5 w-full sm:w-auto" onClick={() => void openAccess(editing.id)}><IdCard className="size-4" />{ar ? "عرض بطاقة الوصول" : "View Staff Access"}</button></section>'
new_profile = '<section className="rounded-2xl border border-border bg-card p-5 shadow-sm"><h3 className="text-base font-bold">{ownRestaurantManager ? (ar ? "اسم مدير المطعم" : "Restaurant Manager name") : (ar ? "معلومات المستخدم" : "User profile")}</h3><p className="mt-1 text-xs text-muted-foreground">{ownRestaurantManager ? (ar ? "يمكنك تعديل اسمك هنا فقط. البريد والدور والصلاحيات تبقى محمية." : "Edit your name here. Email, role and permissions remain protected.") : (ar ? "يمكن تعديل الاسم والبريد وحفظهما مع بقية التغييرات." : "Edit the name and email here; they are saved with the rest of the changes.")}</p><div className="mt-5 grid gap-4 sm:grid-cols-2"><Field label={ar ? "الاسم" : "Name"}><Input value={editing.name} maxLength={80} onChange={(event) => setEditing({ ...editing, name: event.target.value })} /></Field>{ownRestaurantManager ? <Read label={ar ? "البريد الإلكتروني" : "Email"} value={editing.email ?? "—"} /> : <Field label={ar ? "البريد الإلكتروني" : "Email"}><Input type="email" value={editing.email ?? ""} onChange={(event) => setEditing({ ...editing, email: event.target.value })} /></Field>}<Read label={ar ? "الدور" : "Role"} value={ROLE_NAMES[editing.role][lang]} /><Read label={ar ? "تاريخ الإضافة" : "Joined"} value={new Date(editing.created_at).toLocaleDateString(ar ? "ar-JO" : "en-US")} /></div>{!ownRestaurantManager ? <button type="button" className="qs-button-secondary mt-5 w-full sm:w-auto" onClick={() => void openAccess(editing.id)}><IdCard className="size-4" />{ar ? "عرض بطاقة الوصول" : "View Staff Access"}</button> : null}</section>'
staff = replace_once(staff, old_profile, new_profile, "staff profile")
old_footer = '<div className="safe-bottom shrink-0 border-t border-border bg-card p-3 sm:p-4"><div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center"><button type="button" className="qs-button-secondary min-h-11 sm:min-w-28" disabled={busy} onClick={() => setEditing(null)}>{t("common.cancel")}</button><button type="button" className="qs-button-secondary min-h-11 sm:min-w-28" disabled={busy} onClick={() => void openAccess(editing.id)}><IdCard className="size-4" />{ar ? "الوصول" : "Access"}</button><button type="button" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold text-destructive hover:bg-destructive/10 sm:ms-auto" disabled={busy} onClick={() => setPendingDelete(editing)}><Trash2 className="size-4" />{ar ? "حذف" : "Delete"}</button><button type="button" className="qs-button-primary min-h-11 sm:min-w-44" disabled={busy} onClick={() => void saveEdit()}>{busy ? (ar ? "جارٍ الحفظ…" : "Saving…") : (ar ? "حفظ التغييرات" : "Save Changes")}</button></div></div>\n        </> : null}'
new_footer = '<div className="safe-bottom shrink-0 border-t border-border bg-card p-3 sm:p-4"><div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center"><button type="button" className="qs-button-secondary min-h-11 sm:min-w-28" disabled={busy} onClick={() => setEditing(null)}>{t("common.cancel")}</button>{!ownRestaurantManager ? <><button type="button" className="qs-button-secondary min-h-11 sm:min-w-28" disabled={busy} onClick={() => void openAccess(editing.id)}><IdCard className="size-4" />{ar ? "الوصول" : "Access"}</button><button type="button" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold text-destructive hover:bg-destructive/10 sm:ms-auto" disabled={busy} onClick={() => setPendingDelete(editing)}><Trash2 className="size-4" />{ar ? "حذف" : "Delete"}</button></> : <span className="hidden sm:block sm:flex-1" />}<button type="button" className="qs-button-primary min-h-11 sm:min-w-44" disabled={busy} onClick={() => void saveEdit()}>{busy ? (ar ? "جارٍ الحفظ…" : "Saving…") : ownRestaurantManager ? (ar ? "حفظ الاسم" : "Save name") : (ar ? "حفظ التغييرات" : "Save Changes")}</button></div></div>\n          </>; })()}\n        </> : null}'
staff = replace_once(staff, old_footer, new_footer, "staff footer")
write(staff_path, staff)

# Kitchen: remember the last restaurant, render before memberships finish when safe, cache queries, and avoid refetching unrelated kitchen data.
kitchen_path = "src/routes/_authenticated/kitchen.tsx"
kitchen = read(kitchen_path)
kitchen = replace_once(kitchen, 'const PREFS_KEY = "quickserve.kitchen.prefs";', 'const PREFS_KEY = "quickserve.kitchen.prefs";\nconst RESTAURANT_KEY = "quickserve.kitchen.restaurant";', "kitchen key")
kitchen = replace_once(kitchen,
    '  const [restaurantId, setRestaurantId] = useState<string | null>(null);',
    '  const [restaurantId, setRestaurantId] = useState<string | null>(() => {\n    if (typeof window === "undefined") return null;\n    try { return window.localStorage.getItem(RESTAURANT_KEY); } catch { return null; }\n  });',
    "kitchen initial restaurant")
kitchen = replace_once(kitchen,
    '  const activeId = restaurantId ?? options[0]?.id ?? null;',
    '  const activeId = restaurantId ?? options[0]?.id ?? null;\n\n  useEffect(() => {\n    if (!memberships.isSuccess) return;\n    const valid = restaurantId && options.some((option) => option.id === restaurantId);\n    const next = valid ? restaurantId : (options[0]?.id ?? null);\n    if (next !== restaurantId) setRestaurantId(next);\n    try {\n      if (next) window.localStorage.setItem(RESTAURANT_KEY, next);\n      else window.localStorage.removeItem(RESTAURANT_KEY);\n    } catch {\n      /* storage unavailable */\n    }\n  }, [memberships.isSuccess, options, restaurantId]);',
    "kitchen restaurant persistence")
kitchen = replace_once(kitchen,
    '    refetchInterval: 20000,\n    queryFn: async () => {',
    '    staleTime: 8_000,\n    gcTime: 5 * 60_000,\n    refetchInterval: live ? false : 12_000,\n    refetchOnWindowFocus: true,\n    queryFn: async () => {',
    "kitchen orders options")
kitchen = replace_once(kitchen,
    '        .in("status", ["new", "accepted", "preparing", "ready"])\n        .order("created_at", { ascending: true });',
    '        .in("status", ["new", "accepted", "preparing", "ready"])\n        .order("created_at", { ascending: true })\n        .limit(120);',
    "kitchen order cap")
kitchen = replace_once(kitchen, '    staleTime: 60_000,', '    staleTime: 5 * 60_000,\n    gcTime: 15 * 60_000,', "kitchen staff cache")
kitchen = replace_once(kitchen,
    '  async function assign(orderId: string, staffId: string | null) {\n    try {\n      await assignOrderToStaff(orderId, staffId);\n      await queryClient.invalidateQueries({ queryKey: ["kitchen"] });',
    '  async function refreshKitchenOrders(includeEvents = false) {\n    const tasks = [queryClient.invalidateQueries({ queryKey: ["kitchen", "orders", activeId] })];\n    if (includeEvents) tasks.push(queryClient.invalidateQueries({ queryKey: ["kitchen", "events", activeId] }));\n    await Promise.all(tasks);\n  }\n\n  async function assign(orderId: string, staffId: string | null) {\n    try {\n      await assignOrderToStaff(orderId, staffId);\n      await refreshKitchenOrders(false);',
    "kitchen assign refresh")
kitchen = replace_once(kitchen, '          void queryClient.invalidateQueries({ queryKey: ["kitchen"] });', '          void queryClient.invalidateQueries({ queryKey: ["kitchen", "orders", activeId] });', "kitchen realtime refresh")
kitchen = replace_once(kitchen, '      await queryClient.invalidateQueries({ queryKey: ["kitchen"] });', '      await refreshKitchenOrders(true);', "kitchen advance refresh")
kitchen = replace_once(kitchen, '  if (memberships.isPending) return <Skeleton className="m-6 h-64 rounded-3xl" />;', '  if (memberships.isPending && !activeId) return <KitchenBootSkeleton ar={ar} />;', "kitchen boot")
kitchen = replace_once(kitchen, '          await queryClient.invalidateQueries({ queryKey: ["kitchen"] });', '          await refreshKitchenOrders(true);', "kitchen cancel refresh")
boot = '''\nfunction KitchenBootSkeleton({ ar }: { ar: boolean }) {\n  return <div className="min-h-screen bg-background">\n    <header className="border-b border-border bg-card px-4 py-4">\n      <div className="mx-auto flex max-w-[1800px] items-center justify-between gap-4">\n        <div><div className="flex items-center gap-2"><ChefHat className="size-5 text-[#ff5a0a]" /><strong className="text-lg">{ar ? "شاشة المطبخ" : "Kitchen display"}</strong></div><p className="mt-1 text-xs text-muted-foreground">{ar ? "جارٍ فتح الطلبات النشطة…" : "Opening active tickets…"}</p></div>\n        <span className="h-2 w-16 overflow-hidden rounded-full bg-muted"><i className="block h-full w-1/2 animate-pulse rounded-full bg-[#ff5a0a]" /></span>\n      </div>\n    </header>\n    <main className="mx-auto max-w-[1800px] px-4 py-6">\n      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <div key={index} className="rounded-3xl border border-border bg-card p-4"><Skeleton className="h-5 w-24" /><Skeleton className="mt-4 h-24 rounded-2xl" /></div>)}</div>\n    </main>\n  </div>;\n}\n'''
kitchen = kitchen.replace('\nfunction CancelDialog({', boot + '\nfunction CancelDialog({', 1)
write(kitchen_path, kitchen)

for filename, snippets in {
    profile_path: ["Restaurant Manager names are managed from the Team page", "<InfoTile icon={<UserRound"],
    staff_path: ["isOwnRestaurantManager", "Restaurant Manager name updated", "Save name"],
    kitchen_path: ["RESTAURANT_KEY", "KitchenBootSkeleton", "staleTime: 8_000", ".limit(120)"],
}.items():
    body = read(filename)
    for snippet in snippets:
        if snippet not in body:
            raise RuntimeError(f"Missing {snippet!r} in {filename}")

print("Applied Team manager name move and Kitchen performance update.")

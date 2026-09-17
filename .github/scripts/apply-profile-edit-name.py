from pathlib import Path

path = Path('src/routes/_authenticated/profile.tsx')
text = path.read_text(encoding='utf-8')

text = text.replace('  LogOut,\n  Mail,', '  LogOut,\n  Mail,\n  Loader2,\n  Pencil,')
text = text.replace('import { Button } from "@/components/ui/button";\n', 'import { Button } from "@/components/ui/button";\nimport { Input } from "@/components/ui/input";\n')
text = text.replace('import { Switch } from "@/components/ui/switch";\n', 'import { Switch } from "@/components/ui/switch";\nimport { toast } from "sonner";\n')

old = '          {section === "profile" ? <PersonalSection ar={ar} lang={lang} rid={rid} displayName={displayName} email={email} roleLabel={roleLabel} restaurantName={restaurantName} createdAt={user?.created_at} /> : null}'
new = '          {section === "profile" ? <PersonalSection ar={ar} lang={lang} rid={rid} displayName={displayName} email={email} roleLabel={roleLabel} restaurantName={restaurantName} createdAt={user?.created_at} userId={user?.id ?? null} membershipId={membership?.id ?? null} canEditName={Boolean(access.isSuperAdmin || membership?.role === "restaurant_admin")} /> : null}'
if old not in text:
    raise RuntimeError('PersonalSection invocation not found')
text = text.replace(old, new, 1)

start = text.index('function PersonalSection(')
end = text.index('\nfunction NotificationsSection(', start)
replacement = r'''function PersonalSection({ ar, lang, rid, displayName, email, roleLabel, restaurantName, createdAt, userId, membershipId, canEditName }: { ar: boolean; lang: "ar" | "en"; rid: string | null; displayName: string; email: string; roleLabel: string; restaurantName: string; createdAt: string | undefined; userId: string | null; membershipId: string | null; canEditName: boolean }) {
  const qc = useQueryClient();
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(displayName);
  const [savingName, setSavingName] = useState(false);

  useEffect(() => {
    if (!editingName) setNameDraft(displayName);
  }, [displayName, editingName]);

  async function saveName() {
    if (!canEditName || !userId || savingName) return;
    const nextName = nameDraft.trim().replace(/\s+/g, " ");
    if (nextName.length < 2) {
      toast.error(ar ? "أدخل اسماً من حرفين على الأقل." : "Enter a name with at least 2 characters.");
      return;
    }
    if (nextName.length > 80) {
      toast.error(ar ? "الاسم طويل جداً. الحد الأقصى 80 حرفاً." : "The name is too long. Maximum 80 characters.");
      return;
    }
    if (nextName === displayName) {
      setEditingName(false);
      return;
    }

    setSavingName(true);
    try {
      const { error: authError } = await supabase.auth.updateUser({ data: { full_name: nextName, name: nextName } });
      if (authError) throw authError;

      if (membershipId) {
        const { error: staffError } = await (supabase.from("staff") as any).update({ name: nextName }).eq("id", membershipId).eq("auth_user_id", userId);
        if (staffError) throw staffError;
      }

      await Promise.all([
        qc.invalidateQueries({ queryKey: ["auth", "session"] }),
        qc.invalidateQueries({ queryKey: ["staff", "memberships"] }),
      ]);
      setEditingName(false);
      toast.success(ar ? "تم تحديث الاسم بنجاح." : "Name updated successfully.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : (ar ? "تعذر تحديث الاسم." : "Unable to update the name."));
    } finally {
      setSavingName(false);
    }
  }

  return <div className="space-y-5">
    <SectionHeading icon={<UserRound className="size-5" />} title={ar ? "الملف الشخصي" : "Personal profile"} description={ar ? "حدّث صورتك واسمك وراجع معلومات حسابك من مكان واحد." : "Update your profile image and name, and review your account information in one place."} />
    <section className="qs-card overflow-hidden">
      <div className="p-4 sm:p-6"><ProfileAvatarEditor restaurantId={rid} /></div>
    </section>
    <section className="qs-card overflow-hidden">
      <div className="border-b border-border px-5 py-4 sm:px-6"><h2 className="text-sm font-bold">{ar ? "تفاصيل الحساب" : "Account details"}</h2><p className="mt-1 text-xs text-muted-foreground">{canEditName ? (ar ? "يمكنك تعديل اسمك. البريد الإلكتروني والدور والمطعم للعرض فقط." : "You can edit your name. Email, role and restaurant remain read-only.") : (ar ? "هذه البيانات مرتبطة بحسابك وصلاحياتك الحالية." : "These details reflect your current account and access scope.")}</p></div>
      <div className="grid gap-px bg-border sm:grid-cols-2">
        {canEditName ? <EditableNameTile ar={ar} value={nameDraft} editing={editingName} saving={savingName} onEdit={() => { setNameDraft(displayName); setEditingName(true); }} onCancel={() => { setNameDraft(displayName); setEditingName(false); }} onChange={setNameDraft} onSave={() => void saveName()} /> : <InfoTile icon={<User className="size-4" />} label={ar ? "الاسم الكامل" : "Full name"} value={displayName} />}
        <InfoTile icon={<Mail className="size-4" />} label={ar ? "البريد الإلكتروني" : "Email address"} value={email} />
        <InfoTile icon={<ShieldCheck className="size-4" />} label={ar ? "الدور" : "Role"} value={roleLabel} />
        <InfoTile icon={<Building2 className="size-4" />} label={ar ? "المطعم" : "Restaurant"} value={restaurantName} />
        <InfoTile icon={<CheckCircle2 className="size-4" />} label={ar ? "حالة الحساب" : "Account status"} value={ar ? "نشط" : "Active"} accent />
        <InfoTile icon={<CalendarDays className="size-4" />} label={ar ? "عضو منذ" : "Member since"} value={createdAt ? formatDate(createdAt, lang) : "—"} />
      </div>
    </section>
  </div>;
}

function EditableNameTile({ ar, value, editing, saving, onEdit, onCancel, onChange, onSave }: { ar: boolean; value: string; editing: boolean; saving: boolean; onEdit: () => void; onCancel: () => void; onChange: (value: string) => void; onSave: () => void }) {
  return <div className="min-h-[92px] bg-card p-4 sm:p-5">
    <div className="flex items-center gap-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-orange-500/10 text-[#ff5a0a]"><User className="size-4" /></span>
      <div className="min-w-0 flex-1">
        <span className="block text-[10px] font-bold uppercase tracking-[.12em] text-muted-foreground">{ar ? "الاسم الكامل" : "Full name"}</span>
        {editing ? <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
          <Input autoFocus value={value} maxLength={80} disabled={saving} onChange={(event) => onChange(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); onSave(); } if (event.key === "Escape") onCancel(); }} className="h-10 min-w-0 flex-1 rounded-xl" aria-label={ar ? "الاسم الكامل" : "Full name"} />
          <div className="flex gap-2"><Button type="button" size="sm" className="rounded-xl" disabled={saving} onClick={onSave}>{saving ? <Loader2 className="size-4 animate-spin" /> : null}{ar ? "حفظ" : "Save"}</Button><Button type="button" size="sm" variant="outline" className="rounded-xl" disabled={saving} onClick={onCancel}>{ar ? "إلغاء" : "Cancel"}</Button></div>
        </div> : <div className="mt-1.5 flex items-center justify-between gap-3"><strong className="truncate text-sm">{value}</strong><button type="button" onClick={onEdit} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[10px] font-bold text-[#ff5a0a] transition hover:bg-orange-500/10"><Pencil className="size-3.5" />{ar ? "تعديل" : "Edit"}</button></div>}
      </div>
    </div>
  </div>;
}
'''
text = text[:start] + replacement + text[end:]

# Update the sidebar note so it no longer says all core account details are read-only.
text = text.replace(
    'بيانات الحساب الأساسية للعرض فقط، بينما تفضيلاتك وإعدادات المطعم محفوظة بشكل مستقل.',
    'يمكن لمدير المطعم تعديل اسمه، بينما تبقى بيانات الصلاحيات والحساب الأخرى محمية.'
)
text = text.replace(
    'Core account details are read-only while your preferences and restaurant settings are saved independently.',
    'Restaurant Managers can edit their name while access and account-scope details remain protected.'
)

path.write_text(text, encoding='utf-8')
print('Editable profile name applied.')

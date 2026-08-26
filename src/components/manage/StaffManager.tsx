import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import {
  Copy,
  Eye,
  EyeOff,
  IdCard,
  KeyRound,
  Pencil,
  Printer,
  Search,
  ShieldCheck,
  Trash2,
  UserRound,
} from "lucide-react";


import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { humanError } from "@/lib/errors";
import { logAudit } from "@/lib/audit";
import {
  ACCESS_LEVEL_LABELS,
  accessLevelFor,
  ROLE_LABELS,
  type AppRole,
} from "@/lib/permissions";
import {
  inviteStaffMember,
  listStaffLogins,
  removeStaffMember,
  resetStaffPassword,
  updateStaffMember,
} from "@/lib/staff.functions";
import { formatDate } from "@/lib/format";
import { getStaffAccess, issueStaffAccess } from "@/lib/staff-auth.functions";
import { downloadDataUrl, qrDataUrl } from "@/lib/qr";

const ROLES: AppRole[] = ["restaurant_admin", "manager", "kitchen", "waiter", "cashier"];

type Credentials = { name: string; email: string; password: string | null };

type EditForm = {
  id: string;
  name: string;
  email: string;
  password: string;
  role: AppRole;
  isActive: boolean;
};

/** Readable temporary password suggestion for the edit dialog. */
function suggestPassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  return `Qs-${Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("")}!7`;
}

type Access = {
  name: string;
  restaurantCode: string;
  pin: string | null;
  badgeCode: string | null;
  hasPin: boolean;
};

function badgeUrl(code: string): string {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return `${origin}/staff/badge/${code}`;
}

export function StaffManager({ restaurantId }: { restaurantId: string }) {
  const { t, lang } = useI18n();
  const queryClient = useQueryClient();
  const invite = useServerFn(inviteStaffMember);
  const resetPassword = useServerFn(resetStaffPassword);
  const removeStaff = useServerFn(removeStaffMember);
  const issueAccess = useServerFn(issueStaffAccess);
  const readAccess = useServerFn(getStaffAccess);
  const readLogins = useServerFn(listStaffLogins);
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [access, setAccess] = useState<Access | null>(null);
  const [accessBusy, setAccessBusy] = useState(false);
  const [badgeImage, setBadgeImage] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", role: "waiter" as AppRole });
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<EditForm | null>(null);
  const [editBusy, setEditBusy] = useState(false);
  const updateStaff = useServerFn(updateStaffMember);

  const staff = useQuery({
    queryKey: ["platform", "staff", restaurantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff")
        .select("*")
        .eq("restaurant_id", restaurantId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const logins = useQuery({
    queryKey: ["platform", "staff-logins", restaurantId],
    queryFn: () => readLogins({ data: { restaurantId } }),
  });

  const filteredLogins = (logins.data ?? []).filter((row) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return `${row.name} ${row.email ?? ""}`.toLowerCase().includes(q);
  });

  async function saveEdit() {
    if (!editing) return;
    setEditBusy(true);
    try {
      await updateStaff({
        data: {
          staffId: editing.id,
          name: editing.name.trim(),
          email: editing.email.trim(),
          ...(editing.password.trim() ? { password: editing.password.trim() } : {}),
          role: editing.role as Exclude<AppRole, "super_admin">,
          isActive: editing.isActive,
        },
      });
      await logAudit("staff.updated", {
        restaurantId,
        entity: "staff",
        entityId: editing.id,
        metadata: { role: editing.role, isActive: editing.isActive },
      });
      toast.success(t("common.saved"));
      setEditing(null);
      await refresh();
    } catch (error) {
      toast.error(humanError(error, lang));
    } finally {
      setEditBusy(false);
    }
  }

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["platform"] });
  }

  async function submit() {
    setBusy(true);
    try {
      const result = await invite({
        data: {
          restaurantId,
          email: form.email.trim(),
          name: form.name.trim(),
          role: form.role as Exclude<AppRole, "super_admin">,
        },
      });
      await logAudit("staff.created", {
        restaurantId,
        entity: "staff",
        entityId: result.staffId,
        metadata: { role: form.role },
      });
      await refresh();
      setCredentials({ name: form.name.trim(), email: result.email, password: result.password });
      setOpen(false);
      setForm({ name: "", email: "", role: "waiter" });
      toast.success(t("sa.staff.invited"));
    } catch (error) {
      toast.error(humanError(error, lang));
    } finally {
      setBusy(false);
    }
  }

  async function changeRole(id: string, role: AppRole) {
    try {
      const { error } = await supabase.from("staff").update({ role }).eq("id", id);
      if (error) throw error;
      await logAudit("staff.role_changed", {
        restaurantId,
        entity: "staff",
        entityId: id,
        metadata: { role },
      });
      await refresh();
      toast.success(t("common.saved"));
    } catch (error) {
      toast.error(humanError(error, lang));
    }
  }

  async function toggleActive(id: string, isActive: boolean) {
    try {
      const { error } = await supabase.from("staff").update({ is_active: !isActive }).eq("id", id);
      if (error) throw error;
      await logAudit(isActive ? "staff.deactivated" : "staff.reactivated", {
        restaurantId,
        entity: "staff",
        entityId: id,
      });
      await refresh();
    } catch (error) {
      toast.error(humanError(error, lang));
    }
  }

  async function issuePassword(id: string, name: string) {
    try {
      const result = await resetPassword({ data: { staffId: id } });
      await logAudit("staff.password_reset", { restaurantId, entity: "staff", entityId: id });
      setCredentials({ name, email: result.email, password: result.password });
    } catch (error) {
      toast.error(humanError(error, lang));
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    const target = pendingDelete;
    setPendingDelete(null);
    try {
      await removeStaff({ data: { staffId: target.id } });
      await logAudit("staff.deleted", {
        restaurantId,
        entity: "staff",
        entityId: target.id,
        metadata: { name: target.name },
      });
      await refresh();
      toast.success(t("sa.staff.deleted"));
    } catch (error) {
      toast.error(humanError(error, lang));
    }
  }

  async function openAccess(id: string) {
    setAccessBusy(true);
    setBadgeImage(null);
    try {
      const result = await readAccess({ data: { staffId: id } });
      setAccess({ ...result, pin: null });
      if (result.badgeCode) setBadgeImage(await qrDataUrl(badgeUrl(result.badgeCode), 420));
    } catch (error) {
      toast.error(humanError(error, lang));
    } finally {
      setAccessBusy(false);
    }
  }

  async function issueNewAccess(id: string) {
    setAccessBusy(true);
    try {
      const result = await issueAccess({ data: { staffId: id } });
      setAccess({ ...result, hasPin: true });
      setBadgeImage(await qrDataUrl(badgeUrl(result.badgeCode), 420));
      await logAudit("staff.access_issued", { restaurantId, entity: "staff", entityId: id });
      toast.success(t("sa.staff.issueAccess"));
    } catch (error) {
      toast.error(humanError(error, lang));
    } finally {
      setAccessBusy(false);
    }
  }

  const [accessStaffId, setAccessStaffId] = useState<string | null>(null);

  const credentialText = credentials
    ? `${credentials.email}${credentials.password ? ` / ${credentials.password}` : ""}`
    : "";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold">{t("sa.staff.title")}</h2>
        <Button size="sm" onClick={() => setOpen(true)}>
          {t("sa.staff.new")}
        </Button>
      </div>

      {staff.isPending ? (
        <Skeleton className="h-64 rounded-xl" />
      ) : (staff.data ?? []).length === 0 ? (
        <div className="panel p-8 text-center text-sm text-muted-foreground">
          {t("sa.staff.empty")}
        </div>
      ) : (
        <div className="panel divide-y">
          {(staff.data ?? []).map((member) => (
            <div
              key={member.id}
              className="flex flex-wrap items-center justify-between gap-3 p-4"
            >
              <div className="min-w-40">
                <p className="font-medium">{member.name}</p>
                <p className="text-xs text-muted-foreground">{member.email ?? "—"}</p>
                <p className="text-xs text-muted-foreground">
                  {t("common.created")}: {formatDate(member.created_at, lang)}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={accessLevelFor(member.role) === "admin" ? "default" : "outline"}>
                  {ACCESS_LEVEL_LABELS[accessLevelFor(member.role)][lang]}
                </Badge>
                <Badge variant={member.is_active ? "secondary" : "outline"}>
                  {member.is_active ? t("common.active") : t("common.inactive")}
                </Badge>
                <Select
                  value={member.role}
                  onValueChange={(v) => void changeRole(member.id, v as AppRole)}
                >
                  <SelectTrigger className="w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.map((role) => (
                      <SelectItem key={role} value={role}>
                        {ROLE_LABELS[role][lang]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void toggleActive(member.id, member.is_active)}
                >
                  {member.is_active ? t("sa.staff.deactivate") : t("sa.staff.reactivate")}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void issuePassword(member.id, member.name)}
                >
                  <KeyRound className="size-4" />
                  <span className="sr-only sm:not-sr-only">{t("sa.staff.newPassword")}</span>
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setAccessStaffId(member.id);
                    void openAccess(member.id);
                  }}
                >
                  <IdCard className="size-4" />
                  <span className="sr-only sm:not-sr-only">{t("sa.staff.access")}</span>
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive"
                  onClick={() => setPendingDelete({ id: member.id, name: member.name })}
                >
                  <Trash2 className="size-4" />
                  <span className="sr-only">{t("common.delete")}</span>
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-primary" aria-hidden />
            <h2 className="font-semibold">
              {lang === "ar" ? "صلاحيات المستخدمين" : "User permissions"}
            </h2>
            <Badge variant="outline">{(logins.data ?? []).length}</Badge>
          </div>
          <div className="relative w-full sm:w-64">
            <Search
              className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={lang === "ar" ? "ابحث بالاسم أو البريد" : "Search name or email"}
              className="ps-9"
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {lang === "ar"
            ? "عدّل الاسم والبريد وكلمة المرور والصلاحية لكل مستخدم — مرئية للمديرين فقط."
            : "Edit each user's name, email, password and access level. Visible to admins only."}
        </p>

        {logins.isPending ? (
          <Skeleton className="h-40 rounded-xl" />
        ) : filteredLogins.length === 0 ? (
          <div className="panel p-6 text-center text-sm text-muted-foreground">
            {t("sa.staff.empty")}
          </div>
        ) : (
          <div className="panel divide-y">
            {filteredLogins.map((row) => {
              const level = accessLevelFor(row.role as AppRole);
              const show = revealed[row.id] === true;
              return (
                <div key={row.id} className="grid gap-3 p-4 sm:grid-cols-[1fr_auto] sm:items-center">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-full bg-muted text-sm font-semibold uppercase">
                      {row.name.trim().charAt(0) || <UserRound className="size-4" />}
                    </span>
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate font-medium">{row.name}</p>
                        <Badge variant={level === "admin" ? "default" : "outline"}>
                          {ACCESS_LEVEL_LABELS[level][lang]}
                        </Badge>
                        <Badge variant="secondary">{ROLE_LABELS[row.role as AppRole][lang]}</Badge>
                        {row.isActive ? null : (
                          <Badge variant="outline">{t("common.inactive")}</Badge>
                        )}
                      </div>
                      <p className="truncate font-mono text-xs text-muted-foreground">
                        {row.email ?? "—"}
                      </p>
                      <p className="font-mono text-xs text-muted-foreground">
                        {t("auth.password")}:{" "}
                        {row.password
                          ? show
                            ? row.password
                            : "••••••••••"
                          : lang === "ar"
                            ? "غير متاح"
                            : "Not available"}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={!row.password}
                      onClick={() => setRevealed((r) => ({ ...r, [row.id]: !show }))}
                    >
                      {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                      <span className="sr-only">
                        {show ? (lang === "ar" ? "إخفاء" : "Hide") : lang === "ar" ? "إظهار" : "Show"}
                      </span>
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={!row.email}
                      onClick={() => {
                        void navigator.clipboard.writeText(
                          `${row.email ?? ""}${row.password ? ` / ${row.password}` : ""}`,
                        );
                        toast.success(t("common.saved"));
                      }}
                    >
                      <Copy className="size-4" />
                      <span className="sr-only">{lang === "ar" ? "نسخ" : "Copy"}</span>
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setEditing({
                          id: row.id,
                          name: row.name,
                          email: row.email ?? "",
                          password: "",
                          role: row.role as AppRole,
                          isActive: row.isActive,
                        })
                      }
                    >
                      <Pencil className="size-4" />
                      <span className="sr-only sm:not-sr-only">
                        {lang === "ar" ? "تعديل" : "Edit"}
                      </span>
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void issuePassword(row.id, row.name)}
                    >
                      <KeyRound className="size-4" />
                      <span className="sr-only">{t("sa.staff.newPassword")}</span>
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => setPendingDelete({ id: row.id, name: row.name })}
                    >
                      <Trash2 className="size-4" />
                      <span className="sr-only">{t("common.delete")}</span>
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{lang === "ar" ? "تعديل المستخدم" : "Edit user"}</DialogTitle>
            <DialogDescription>
              {lang === "ar"
                ? "حدّث بيانات الدخول والصلاحية. اترك كلمة المرور فارغة لعدم تغييرها."
                : "Update sign-in details and access level. Leave the password blank to keep it."}
            </DialogDescription>
          </DialogHeader>
          {editing ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>{t("common.name")}</Label>
                <Input
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("common.email")}</Label>
                <Input
                  type="email"
                  value={editing.email}
                  onChange={(e) => setEditing({ ...editing, email: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{lang === "ar" ? "كلمة مرور جديدة" : "New password"}</Label>
                <div className="flex gap-2">
                  <Input
                    value={editing.password}
                    placeholder={lang === "ar" ? "بدون تغيير" : "Unchanged"}
                    onChange={(e) => setEditing({ ...editing, password: e.target.value })}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setEditing({ ...editing, password: suggestPassword() })}
                  >
                    {lang === "ar" ? "توليد" : "Generate"}
                  </Button>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>{lang === "ar" ? "مستوى الوصول" : "Access level"}</Label>
                  <Select
                    value={accessLevelFor(editing.role)}
                    onValueChange={(v) =>
                      setEditing({
                        ...editing,
                        role:
                          v === "admin"
                            ? accessLevelFor(editing.role) === "admin"
                              ? editing.role
                              : "restaurant_admin"
                            : accessLevelFor(editing.role) === "member"
                              ? editing.role
                              : "waiter",
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">{ACCESS_LEVEL_LABELS.admin[lang]}</SelectItem>
                      <SelectItem value="member">{ACCESS_LEVEL_LABELS.member[lang]}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>{t("sa.staff.role")}</Label>
                  <Select
                    value={editing.role}
                    onValueChange={(v) => setEditing({ ...editing, role: v as AppRole })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLES.map((role) => (
                        <SelectItem key={role} value={role}>
                          {ROLE_LABELS[role][lang]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <label className="flex items-center justify-between rounded-md border border-border p-3 text-sm">
                <span>{lang === "ar" ? "الحساب مفعّل" : "Account active"}</span>
                <Switch
                  checked={editing.isActive}
                  onCheckedChange={(v) => setEditing({ ...editing, isActive: v })}
                />
              </label>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              {t("common.cancel")}
            </Button>
            <Button disabled={editBusy} onClick={() => void saveEdit()}>
              {t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("sa.staff.new")}</DialogTitle>
            <DialogDescription>{t("sa.staff.title")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>{t("common.name")}</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("common.email")}</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("sa.staff.role")}</Label>
              <Select
                value={form.role}
                onValueChange={(v) => setForm((f) => ({ ...f, role: v as AppRole }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((role) => (
                    <SelectItem key={role} value={role}>
                      {ROLE_LABELS[role][lang]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button disabled={busy || !form.name.trim() || !form.email.trim()} onClick={() => void submit()}>
              {t("common.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={credentials !== null} onOpenChange={(o) => !o && setCredentials(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("sa.staff.credentials")}</DialogTitle>
            <DialogDescription>{t("sa.staff.credentialsHelp")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 rounded-md bg-muted p-3 text-sm">
            <p>
              <span className="text-muted-foreground">{t("sa.staff.username")}: </span>
              <span className="font-mono break-all">{credentials?.email}</span>
            </p>
            <p>
              <span className="text-muted-foreground">{t("auth.password")}: </span>
              <span className="font-mono break-all">
                {credentials?.password ?? t("sa.staff.passwordUnchanged")}
              </span>
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                void navigator.clipboard.writeText(credentialText);
                toast.success(t("common.saved"));
              }}
            >
              {lang === "ar" ? "نسخ" : "Copy"}
            </Button>
            <Button onClick={() => setCredentials(null)}>{t("common.close")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={access !== null}
        onOpenChange={(o) => {
          if (!o) {
            setAccess(null);
            setAccessStaffId(null);
            setBadgeImage(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("sa.staff.access")}</DialogTitle>
            <DialogDescription>{t("sa.staff.accessHelp")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid gap-2 rounded-md bg-muted p-3 text-sm sm:grid-cols-2">
              <p>
                <span className="text-muted-foreground">{t("staffAuth.restaurantCode")}: </span>
                <span className="font-mono text-base font-semibold">
                  {access?.restaurantCode || "—"}
                </span>
              </p>
              <p>
                <span className="text-muted-foreground">{t("staffAuth.pin")}: </span>
                <span className="font-mono text-base font-semibold tracking-widest">
                  {access?.pin ?? (access?.hasPin ? "••••••" : t("sa.staff.noPin"))}
                </span>
              </p>
            </div>
            {badgeImage ? (
              <div className="flex flex-col items-center gap-2">
                <img src={badgeImage} alt="" className="size-40 rounded-lg border bg-white p-2" />
                <p className="text-xs text-muted-foreground">{t("sa.staff.badgeReady")}</p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    downloadDataUrl(badgeImage, `badge-${access?.name ?? "staff"}.png`)
                  }
                >
                  <Printer className="size-4" /> {t("sa.staff.printBadge")}
                </Button>
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={accessBusy || !accessStaffId}
              onClick={() => accessStaffId && void issueNewAccess(accessStaffId)}
            >
              <KeyRound className="size-4" /> {t("sa.staff.issueAccess")}
            </Button>
            <Button
              onClick={() => {
                setAccess(null);
                setAccessStaffId(null);
                setBadgeImage(null);
              }}
            >
              {t("common.close")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={pendingDelete !== null} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("sa.staff.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("sa.staff.deleteBody")} {pendingDelete?.name}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmDelete()}>
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

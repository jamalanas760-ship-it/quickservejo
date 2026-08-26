import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { KeyRound, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
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
import { ROLE_LABELS, type AppRole } from "@/lib/permissions";
import { inviteStaffMember, removeStaffMember, resetStaffPassword } from "@/lib/staff.functions";
import { formatDate } from "@/lib/format";

const ROLES: AppRole[] = ["restaurant_admin", "manager", "kitchen", "waiter", "cashier"];

type Credentials = { name: string; email: string; password: string | null };

export function StaffManager({ restaurantId }: { restaurantId: string }) {
  const { t, lang } = useI18n();
  const queryClient = useQueryClient();
  const invite = useServerFn(inviteStaffMember);
  const resetPassword = useServerFn(resetStaffPassword);
  const removeStaff = useServerFn(removeStaffMember);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", role: "waiter" as AppRole });
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null);

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

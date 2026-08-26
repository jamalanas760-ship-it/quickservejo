import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
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
import { inviteStaffMember } from "@/lib/staff.functions";
import { formatDate } from "@/lib/format";

export const Route = createFileRoute(
  "/_authenticated/super-admin/restaurants/$restaurantId/staff",
)({
  head: () => ({
    meta: [
      { title: "Restaurant staff — QuickServe admin" },
      {
        name: "description",
        content: "Invite staff, assign roles and control access for a QuickServe restaurant.",
      },
      { property: "og:title", content: "Restaurant staff — QuickServe admin" },
      { property: "og:description", content: "Team and role management for a tenant." },
    ],
  }),
  component: StaffTab,
});

const ROLES: AppRole[] = ["restaurant_admin", "manager", "kitchen", "waiter", "cashier"];

function StaffTab() {
  const { restaurantId } = Route.useParams();
  const { t, lang } = useI18n();
  const queryClient = useQueryClient();
  const invite = useServerFn(inviteStaffMember);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", role: "waiter" as AppRole });
  const [setupLink, setSetupLink] = useState<string | null>(null);

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
      setSetupLink(result.setupLink);
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

      <Dialog open={setupLink !== null} onOpenChange={(o) => !o && setSetupLink(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("sa.staff.invited")}</DialogTitle>
            <DialogDescription>
              {lang === "ar"
                ? "شارك هذا الرابط مع الموظف لتعيين كلمة المرور."
                : "Share this link with the staff member so they can set a password."}
            </DialogDescription>
          </DialogHeader>
          <p className="break-all rounded-md bg-muted p-3 text-xs">{setupLink}</p>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                if (setupLink) void navigator.clipboard.writeText(setupLink);
                toast.success(t("common.saved"));
              }}
            >
              {lang === "ar" ? "نسخ" : "Copy"}
            </Button>
            <Button onClick={() => setSetupLink(null)}>{t("common.close")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

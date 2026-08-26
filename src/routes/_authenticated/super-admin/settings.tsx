import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { usePlatformSettings } from "@/hooks/useSuperAdmin";
import { useI18n } from "@/lib/i18n";
import { humanError } from "@/lib/errors";
import { logAudit } from "@/lib/audit";

export const Route = createFileRoute("/_authenticated/super-admin/settings")({
  head: () => ({
    meta: [
      { title: "Platform settings — QuickServe admin" },
      {
        name: "description",
        content: "Configure platform name, default currency, language, theme and default tax rate.",
      },
      { property: "og:title", content: "Platform settings — QuickServe admin" },
      { property: "og:description", content: "Global defaults for the QuickServe platform." },
    ],
  }),
  component: PlatformSettingsPage,
});

type Form = {
  platform_name: string;
  default_currency: string;
  default_language: string;
  default_theme: string;
  default_tax_rate: string;
};

function PlatformSettingsPage() {
  const { t, lang } = useI18n();
  const queryClient = useQueryClient();
  const settings = usePlatformSettings();
  const [form, setForm] = useState<Form | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!settings.data || form) return;
    setForm({
      platform_name: settings.data.platform_name,
      default_currency: settings.data.default_currency,
      default_language: settings.data.default_language,
      default_theme: settings.data.default_theme,
      default_tax_rate: String(settings.data.default_tax_rate),
    });
  }, [settings.data, form]);

  async function save() {
    if (!form) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("platform_settings")
        .update({
          platform_name: form.platform_name.trim(),
          default_currency: form.default_currency.trim(),
          default_language: form.default_language,
          default_theme: form.default_theme,
          default_tax_rate: Number(form.default_tax_rate) || 0,
        })
        .eq("id", true);
      if (error) throw error;
      await logAudit("platform.settings_updated", { entity: "platform_settings" });
      await queryClient.invalidateQueries({ queryKey: ["platform"] });
      toast.success(t("common.saved"));
    } catch (error) {
      toast.error(humanError(error, lang));
    } finally {
      setSaving(false);
    }
  }

  if (settings.isPending || !form) return <Skeleton className="h-72 rounded-xl" />;

  return (
    <form
      className="max-w-2xl space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <h1 className="text-xl font-semibold">{t("sa.settings.title")}</h1>

      <section className="panel space-y-4 p-6">
        <h2 className="font-semibold">{t("sa.settings.general")}</h2>
        <div className="space-y-1.5">
          <Label>{t("sa.settings.platformName")}</Label>
          <Input
            value={form.platform_name}
            onChange={(e) => setForm({ ...form, platform_name: e.target.value })}
          />
        </div>
      </section>

      <section className="panel space-y-4 p-6">
        <h2 className="font-semibold">{t("sa.settings.defaults")}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>{t("sa.field.currency")}</Label>
            <Input
              value={form.default_currency}
              onChange={(e) => setForm({ ...form, default_currency: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t("sa.field.language")}</Label>
            <Select
              value={form.default_language}
              onValueChange={(v) => setForm({ ...form, default_language: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="ar">العربية</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t("sa.settings.defaultTheme")}</Label>
            <Select
              value={form.default_theme}
              onValueChange={(v) => setForm({ ...form, default_theme: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="light">Light</SelectItem>
                <SelectItem value="dark">Dark</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t("sa.field.tax")}</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={form.default_tax_rate}
              onChange={(e) => setForm({ ...form, default_tax_rate: e.target.value })}
            />
          </div>
        </div>
      </section>

      <section className="panel space-y-2 p-6">
        <h2 className="font-semibold">{t("sa.settings.security")}</h2>
        <p className="text-sm text-muted-foreground">{t("sa.settings.securityNote")}</p>
      </section>

      <div className="flex justify-end">
        <Button type="submit" disabled={saving}>
          {t("common.save")}
        </Button>
      </div>
    </form>
  );
}

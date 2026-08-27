import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Check, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";

type SetupState = {
  branding: boolean;
  menu: boolean;
  tables: boolean;
  live: boolean;
};

/** Counts the artefacts that decide whether a restaurant is ready for diners. */
export function useSetupState(restaurantId: string) {
  return useQuery<SetupState>({
    queryKey: ["setup", "state", restaurantId],
    staleTime: 30_000,
    queryFn: async () => {
      const [rest, items, tables] = await Promise.all([
        supabase
          .from("restaurants")
          .select("logo_url, is_active, menu_theme")
          .eq("id", restaurantId)
          .maybeSingle(),
        supabase
          .from("menu_items")
          .select("id", { count: "exact", head: true })
          .eq("restaurant_id", restaurantId),
        supabase
          .from("restaurant_tables")
          .select("id", { count: "exact", head: true })
          .eq("restaurant_id", restaurantId),
      ]);
      if (rest.error) throw rest.error;
      if (items.error) throw items.error;
      if (tables.error) throw tables.error;
      return {
        branding: Boolean(rest.data?.logo_url),
        menu: (items.count ?? 0) > 0,
        tables: (tables.count ?? 0) > 0,
        live: Boolean(rest.data?.is_active),
      };
    },
  });
}

/**
 * Guided onboarding for a freshly created restaurant. It hides itself once
 * every step is done so established tenants never see it.
 */
export function SetupStepper({ restaurantId }: { restaurantId: string }) {
  const { t } = useI18n();
  const { data, isPending } = useSetupState(restaurantId);

  if (isPending) return <Skeleton className="h-40 rounded-xl" />;
  if (!data) return null;

  const steps = [
    {
      key: "branding",
      done: data.branding,
      label: t("onboard.step.branding"),
      help: t("onboard.branding.help"),
      to: "/manage/$restaurantId/design" as const,
    },
    {
      key: "menu",
      done: data.menu,
      label: t("onboard.step.menu"),
      help: t("onboard.menu.help"),
      to: "/manage/$restaurantId" as const,
    },
    {
      key: "tables",
      done: data.tables,
      label: t("onboard.step.tables"),
      help: t("onboard.tables.help"),
      to: "/manage/$restaurantId/tables" as const,
    },
    {
      key: "qr",
      done: data.tables,
      label: t("onboard.step.qr"),
      help: t("onboard.qr.help"),
      to: "/manage/$restaurantId/tables" as const,
    },
    {
      key: "live",
      done: data.live,
      label: t("onboard.step.live"),
      help: t("onboard.live.help"),
      to: "/manage/$restaurantId/orders" as const,
    },
  ];

  const done = steps.filter((s) => s.done).length;
  if (done === steps.length) return null;

  const percent = Math.round((done / steps.length) * 100);
  const next = steps.find((s) => !s.done)!;

  return (
    <section className="panel p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">{t("onboard.title")}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{t("onboard.subtitle")}</p>
        </div>
        <Button asChild size="sm" className="h-9">
          <Link to={next.to} params={{ restaurantId }}>
            {t("onboard.continue")}
            <ChevronRight className="size-4" />
          </Link>
        </Button>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <Progress value={percent} className="h-2 flex-1" />
        <span className="shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">
          {percent}% {t("onboard.progress")}
        </span>
      </div>

      <ol className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {steps.map((s, i) => (
          <li key={s.key}>
            <Link
              to={s.to}
              params={{ restaurantId }}
              className="flex items-start gap-3 rounded-xl border border-border p-3 transition-colors hover:bg-muted/60"
            >
              <span
                className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-semibold ${
                  s.done ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                }`}
              >
                {s.done ? <Check className="size-3.5" /> : i + 1}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{s.label}</span>
                <span className="block text-xs text-muted-foreground">{s.help}</span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}

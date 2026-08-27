import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DateRangePicker } from "@/components/common/DateRangePicker";
import { useAuditActions, useAuditLogs, useRestaurantsWithStats } from "@/hooks/useSuperAdmin";
import { useI18n } from "@/lib/i18n";
import { formatDateTime } from "@/lib/format";
import { rangeFromPreset, type DateRange } from "@/lib/range";


export const Route = createFileRoute("/_authenticated/super-admin/audit-logs")({
  head: () => ({
    meta: [
      { title: "Audit logs — QuickServe admin" },
      {
        name: "description",
        content: "Searchable, append-only trail of every administrative action on the platform.",
      },
      { property: "og:title", content: "Audit logs — QuickServe admin" },
      { property: "og:description", content: "Platform-wide administrative activity trail." },
    ],
  }),
  component: AuditLogsPage,
});

function AuditLogsPage() {
  const { t, lang } = useI18n();
  const [search, setSearch] = useState("");
  const [restaurantId, setRestaurantId] = useState("all");
  const restaurants = useRestaurantsWithStats();
  const logs = useAuditLogs({
    ...(restaurantId !== "all" ? { restaurantId } : {}),
    search,
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">{t("sa.audit.title")}</h1>
      </div>

      <div className="grid gap-2 sm:flex sm:flex-wrap">
        <Input
          className="w-full sm:max-w-xs"
          placeholder={t("common.search")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select value={restaurantId} onValueChange={setRestaurantId}>
          <SelectTrigger className="w-full sm:w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("sa.filter.all")}</SelectItem>
            {(restaurants.data ?? []).map((r) => (
              <SelectItem key={r.id} value={r.id}>
                {r.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {logs.isPending ? (
        <Skeleton className="h-96 rounded-xl" />
      ) : (logs.data ?? []).length === 0 ? (
        <p className="panel p-8 text-center text-sm text-muted-foreground">
          {t("sa.audit.empty")}
        </p>
      ) : (
        <>
          <div className="grid gap-2 md:hidden">
            {(logs.data ?? []).map((row) => (
              <div key={row.id} className="panel space-y-1 p-4">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
                  <p className="min-w-0 break-words font-medium">{row.action}</p>
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {formatDateTime(row.created_at, lang)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("sa.audit.user")}: {row.actor_name ?? "—"}
                </p>
                <p className="break-all text-xs text-muted-foreground">
                  {t("sa.audit.entity")}: {row.entity ?? "—"}
                  {row.entity_id ? ` · ${row.entity_id}` : ""}
                </p>
              </div>
            ))}
          </div>

          <div className="panel hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead className="border-b text-start text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="p-3 text-start">{t("sa.audit.when")}</th>
                  <th className="p-3 text-start">{t("sa.audit.user")}</th>
                  <th className="p-3 text-start">{t("sa.audit.action")}</th>
                  <th className="p-3 text-start">{t("sa.audit.entity")}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {(logs.data ?? []).map((row) => (
                  <tr key={row.id}>
                    <td className="whitespace-nowrap p-3 text-muted-foreground">
                      {formatDateTime(row.created_at, lang)}
                    </td>
                    <td className="p-3">{row.actor_name ?? "—"}</td>
                    <td className="p-3 font-medium">{row.action}</td>
                    <td className="p-3 text-muted-foreground">
                      {row.entity ?? "—"}
                      {row.entity_id ? (
                        <span className="block text-xs opacity-70">{row.entity_id}</span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

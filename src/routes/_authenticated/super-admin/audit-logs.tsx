import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuditLogs, useRestaurantsWithStats } from "@/hooks/useSuperAdmin";
import { useI18n } from "@/lib/i18n";
import { formatDateTime } from "@/lib/format";

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

      <div className="flex flex-wrap gap-2">
        <Input
          className="max-w-xs"
          placeholder={t("common.search")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select value={restaurantId} onValueChange={setRestaurantId}>
          <SelectTrigger className="w-56">
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
        <div className="panel overflow-x-auto">
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
      )}
    </div>
  );
}

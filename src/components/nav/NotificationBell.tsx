import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Bell, CheckCheck, ClipboardList, ExternalLink, Info, ShieldCheck, TimerReset, UsersRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { operationalCountersKey, type OperationalCounters } from "@/hooks/useOperationalCounters";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

type NotificationKind = "task" | "approval" | "handover" | "shift" | "alert" | "system";
type NotificationRow = {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string | null;
  read_at: string | null;
  created_at: string;
};

function source() {
  return (supabase as any).from("in_app_notifications");
}

export function NotificationBell({
  restaurantId,
  count,
  ar,
}: {
  restaurantId: string | null;
  count: number;
  ar: boolean;
}) {
  const qc = useQueryClient();
  const feed = useQuery<NotificationRow[]>({
    queryKey: ["notifications", "popover", restaurantId],
    enabled: Boolean(restaurantId),
    staleTime: 8_000,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await source()
        .select("id,kind,title,body,read_at,created_at")
        .eq("restaurant_id", restaurantId!)
        .order("created_at", { ascending: false })
        .limit(8);
      if (error) throw error;
      return (data ?? []) as NotificationRow[];
    },
  });

  const markRead = useMutation({
    mutationFn: async (ids: string[]) => {
      if (!ids.length) return;
      const { error } = await source().update({ read_at: new Date().toISOString() }).in("id", ids);
      if (error) throw error;
    },
    onSuccess: async (_data, ids) => {
      qc.setQueryData<OperationalCounters>(operationalCountersKey(restaurantId), (current) => {
        if (!current) return current;
        const removed = Math.min(ids.length, current.unread);
        return { ...current, unread: Math.max(0, current.unread - removed), total: Math.max(0, current.total - removed) };
      });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["notifications", "popover", restaurantId] }),
        qc.invalidateQueries({ queryKey: ["notifications", restaurantId] }),
        qc.invalidateQueries({ queryKey: operationalCountersKey(restaurantId) }),
      ]);
    },
  });

  const rows = feed.data ?? [];
  const unread = rows.filter((row) => !row.read_at);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="relative grid size-10 place-items-center rounded-[11px] border border-transparent text-muted-foreground transition hover:border-border hover:bg-muted/55 hover:text-foreground"
          aria-label={ar ? "الإشعارات" : "Notifications"}
        >
          <Bell className="size-[19px]" />
          {count > 0 ? (
            <span className="absolute -end-0.5 -top-0.5 min-w-[19px] rounded-full bg-red-500 px-1 py-0.5 text-center text-[9px] font-black leading-4 text-white shadow-sm ring-2 ring-background">
              {count > 99 ? "99+" : count}
            </span>
          ) : null}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={10} className="w-[min(390px,calc(100vw-20px))] overflow-hidden p-0">
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3.5">
          <div>
            <h2 className="text-sm font-bold">{ar ? "الإشعارات" : "Notifications"}</h2>
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              {count ? (ar ? `${count} غير مقروء` : `${count} unread`) : (ar ? "لا توجد تنبيهات جديدة" : "You're all caught up")}
            </p>
          </div>
          {unread.length ? (
            <Button
              size="sm"
              variant="ghost"
              className="h-8 px-2 text-[10px]"
              disabled={markRead.isPending}
              onClick={() => markRead.mutate(unread.map((row) => row.id))}
            >
              <CheckCheck className="size-3.5" />
              {ar ? "قراءة الكل" : "Read all"}
            </Button>
          ) : null}
        </div>

        <div className="max-h-[420px] overflow-y-auto">
          {feed.isPending ? (
            <div className="space-y-3 p-4">{[0,1,2].map((i) => <div key={i} aria-hidden="true" className="qs-skeleton h-16 rounded-xl bg-muted" />)}</div>
          ) : rows.length === 0 ? (
            <div className="grid min-h-44 place-items-center p-6 text-center">
              <div>
                <span className="mx-auto grid size-10 place-items-center rounded-xl bg-muted text-muted-foreground"><Bell className="size-4" /></span>
                <p className="mt-3 text-xs font-bold">{ar ? "كل شيء هادئ" : "Nothing needs attention"}</p>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {rows.map((row) => {
                const config = kindConfig(row.kind);
                const Icon = config.icon;
                const href = row.kind === "shift" || row.kind === "handover" ? "/shifts" : row.kind === "task" || row.kind === "approval" || row.kind === "alert" ? "/work" : "/dashboard";
                return (
                  <Link
                    key={row.id}
                    to={href as never}
                    onClick={() => { if (!row.read_at) markRead.mutate([row.id]); }}
                    className={cn("flex gap-3 px-4 py-3 transition hover:bg-muted/45", !row.read_at && "bg-orange-500/[.035]")}
                  >
                    <span className={cn("mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl", config.tone)}><Icon className="size-4" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-start gap-2">
                        <strong className="min-w-0 flex-1 text-xs leading-5">{row.title}</strong>
                        {!row.read_at ? <i className="mt-1.5 size-2 shrink-0 rounded-full bg-[#e85d2a]" /> : null}
                      </span>
                      {row.body ? <span className="mt-0.5 block line-clamp-2 text-[10px] leading-4 text-muted-foreground">{row.body}</span> : null}
                      <span className="mt-1 block text-[9px] font-medium text-muted-foreground">{formatTime(row.created_at, ar)}</span>
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        <div className="border-t border-border bg-muted/20 p-2">
          <Button asChild variant="ghost" className="h-10 w-full justify-between px-3 text-xs font-bold">
            <Link to="/notifications">
              <span>{ar ? "فتح مركز الإشعارات الكامل" : "Open full notification center"}</span>
              <ExternalLink className="size-3.5" />
            </Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function kindConfig(kind: NotificationKind) {
  if (kind === "approval") return { icon: ShieldCheck, tone: "bg-violet-500/10 text-violet-600" };
  if (kind === "handover") return { icon: UsersRound, tone: "bg-cyan-500/10 text-cyan-700" };
  if (kind === "shift") return { icon: TimerReset, tone: "bg-blue-500/10 text-blue-600" };
  if (kind === "alert") return { icon: Info, tone: "bg-red-500/10 text-red-600" };
  if (kind === "task") return { icon: ClipboardList, tone: "bg-orange-500/10 text-[#e85d2a]" };
  return { icon: Info, tone: "bg-muted text-muted-foreground" };
}

function formatTime(value: string, ar: boolean) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(ar ? "ar-JO" : "en-JO", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}

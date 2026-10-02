import { toast } from "sonner";
import { humanError } from "@/lib/errors";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  Bell,
  CheckCheck,
  ClipboardList,
  ExternalLink,
  Info,
  ShieldCheck,
  TimerReset,
  UsersRound,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { operationalCountersKey, type OperationalCounters } from "@/hooks/useOperationalCounters";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

type NotificationKind = "task" | "approval" | "handover" | "shift" | "alert" | "system";
type NotificationRow = {
  id: string;
  kind: NotificationKind;
  source_type: string | null;
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
  const [open, setOpen] = useState(false);
  const feed = useQuery<NotificationRow[]>({
    queryKey: ["notifications", "popover", restaurantId],
    enabled: Boolean(restaurantId),
    staleTime: 8_000,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await source()
        .select("id,kind,source_type,title,body,read_at,created_at")
        .eq("restaurant_id", restaurantId!)
        .order("created_at", { ascending: false })
        .limit(8);
      if (error) throw error;
      return (data ?? []) as NotificationRow[];
    },
  });

  useEffect(() => {
    if (!restaurantId) return;
    const channel = supabase
      .channel(`notification-feed:${restaurantId}:${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "in_app_notifications",
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        () => {
          void qc.invalidateQueries({ queryKey: ["notifications"] });
          void qc.invalidateQueries({ queryKey: operationalCountersKey(restaurantId) });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [restaurantId, qc]);

  const markRead = useMutation({
    mutationFn: async (ids: string[]) => {
      if (!ids.length) return;
      const { error } = await source()
        .update({ read_at: new Date().toISOString() })
        .eq("restaurant_id", restaurantId!)
        .is("read_at", null)
        .in("id", ids);
      if (error) throw error;
    },
    onError: (error) => toast.error(humanError(error, ar ? "ar" : "en")),
    onSuccess: async (_data, ids) => {
      qc.setQueryData<OperationalCounters>(operationalCountersKey(restaurantId), (current) => {
        if (!current) return current;
        const removed = Math.min(ids.length, current.unread);
        return {
          ...current,
          unread: Math.max(0, current.unread - removed),
          total: Math.max(0, current.total - removed),
        };
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
    <Popover open={open} onOpenChange={setOpen}>
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
      <PopoverContent
        align="end"
        sideOffset={6}
        className="w-[min(320px,calc(100vw-24px))] overflow-hidden p-0"
      >
        <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2">
          <div>
            <h2 className="text-sm font-bold">{ar ? "الإشعارات" : "Notifications"}</h2>
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              {count
                ? ar
                  ? `${count} غير مقروء`
                  : `${count} unread`
                : ar
                  ? "لا توجد تنبيهات جديدة"
                  : "You're all caught up"}
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

        <div className="max-h-[min(280px,38dvh)] overflow-y-auto">
          {restaurantId && feed.isPending ? (
            <div className="space-y-3 p-4">
              {[0, 1, 2].map((i) => (
                <div key={i} aria-hidden="true" className="qs-skeleton h-16 rounded-xl bg-muted" />
              ))}
            </div>
          ) : feed.isError ? (
            <div className="p-6 text-center">
              <p className="text-xs text-muted-foreground">
                {ar ? "تعذر تحميل الإشعارات." : "Could not load notifications."}
              </p>
              <Button
                type="button"
                variant="outline"
                className="mt-3 min-h-11"
                onClick={() => void feed.refetch()}
              >
                {ar ? "إعادة المحاولة" : "Try again"}
              </Button>
            </div>
          ) : rows.length === 0 ? (
            <div className="grid min-h-28 place-items-center p-6 text-center">
              <div>
                <span className="mx-auto grid size-10 place-items-center rounded-xl bg-muted text-muted-foreground">
                  <Bell className="size-4" />
                </span>
                <p className="mt-3 text-xs font-bold">
                  {ar ? "كل شيء هادئ" : "Nothing needs attention"}
                </p>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {rows.map((row) => {
                const config = kindConfig(row.kind);
                const Icon = config.icon;
                const href =
                  row.source_type === "order"
                    ? "/orders"
                    : row.kind === "shift" || row.kind === "handover"
                      ? "/shifts"
                      : row.kind === "task" || row.kind === "approval" || row.kind === "alert"
                        ? "/work"
                        : "/dashboard";
                return (
                  <Link
                    key={row.id}
                    to={href as never}
                    onClick={() => {
                      setOpen(false);
                      if (!row.read_at) markRead.mutate([row.id]);
                    }}
                    className={cn(
                      "flex gap-2.5 px-3 py-2.5 transition hover:bg-muted/45",
                      !row.read_at && "bg-orange-500/[.035]",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 grid size-8 shrink-0 place-items-center rounded-xl",
                        config.tone,
                      )}
                    >
                      <Icon className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-start gap-2">
                        <strong className="min-w-0 flex-1 text-xs leading-5">{row.title}</strong>
                        {!row.read_at ? (
                          <i className="mt-1.5 size-2 shrink-0 rounded-full bg-[#e85d2a]" />
                        ) : null}
                      </span>
                      {row.body ? (
                        <span className="mt-0.5 block line-clamp-1 text-[10px] leading-4 text-muted-foreground">
                          {row.body}
                        </span>
                      ) : null}
                      <span className="mt-1 block text-[9px] font-medium text-muted-foreground">
                        {formatTime(row.created_at, ar)}
                      </span>
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        <div className="border-t border-border bg-muted/20 p-2">
          <Button
            variant="ghost"
            className="min-h-11 w-full justify-start px-3 text-xs"
            onClick={() => {
              setOpen(false);
              window.dispatchEvent(new Event("quickserve:enable-notifications"));
            }}
          >
            <Bell className="size-3.5" />
            {ar ? "تفعيل تنبيهات الجهاز" : "Enable device alerts"}
          </Button>
          <Button
            asChild
            variant="ghost"
            className="h-10 w-full justify-between px-3 text-xs font-bold"
          >
            <Link to="/notifications" onClick={() => setOpen(false)}>
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
  return new Intl.DateTimeFormat(ar ? "ar-JO" : "en-JO", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

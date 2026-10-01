import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { AppHeader } from "@/components/nav/AppHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { NotificationCenter } from "@/components/notifications/NotificationCenter";
import { useWorkspaceScope } from "@/hooks/useWorkspace";
import { useRestaurant } from "@/hooks/useSuperAdmin";
import { operationalCountersKey, type OperationalCounters } from "@/hooks/useOperationalCounters";
import { supabase } from "@/integrations/supabase/client";
import { humanError } from "@/lib/errors";
import { useI18n } from "@/lib/i18n";
import type { NotificationRow } from "@/lib/notification-feed";
export const Route = createFileRoute("/_authenticated/notifications")({
  head: () => ({
    meta: [
      { title: "Notifications — QuickServe" },
      { name: "description", content: "Your restaurant notification center." },
    ],
  }),
  component: NotificationsPage,
});
function fromNotifications() {
  return (supabase as any).from("in_app_notifications");
}
function NotificationsPage() {
  const { lang } = useI18n();
  const ar = lang === "ar";
  const scope = useWorkspaceScope();
  const qc = useQueryClient();
  const rid = scope.restaurantId;
  const restaurant = useRestaurant(rid ?? "");
  const feed = useQuery<NotificationRow[]>({
    queryKey: ["notifications", rid],
    enabled: Boolean(rid),
    staleTime: 8_000,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await fromNotifications()
        .select(
          "id,restaurant_id,staff_id,target_role,kind,title,body,source_type,source_id,read_at,created_at",
        )
        .eq("restaurant_id", rid!)
        .order("created_at", { ascending: false })
        .limit(150);
      if (error) throw error;
      return (data ?? []) as NotificationRow[];
    },
  });

  const markRead = useMutation({
    mutationFn: async (ids: string[]) => {
      if (!ids.length) return;
      const { error } = await fromNotifications()
        .update({ read_at: new Date().toISOString() })
        .eq("restaurant_id", rid!)
        .is("read_at", null)
        .in("id", ids);
      if (error) throw error;
    },
    onSuccess: async (_result, ids) => {
      qc.setQueryData<OperationalCounters>(operationalCountersKey(rid), (current) => {
        if (!current) return current;
        const removed = Math.min(ids.length, current.unread);
        const unread = Math.max(0, current.unread - removed);
        return { ...current, unread, total: Math.max(0, current.total - removed) };
      });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["notifications", rid] }),
        qc.invalidateQueries({ queryKey: operationalCountersKey(rid) }),
      ]);
    },
    onError: (error) => toast.error(humanError(error, lang)),
  });

  return (
    <div className="min-h-dvh bg-background">
      <AppHeader title={ar ? "الإشعارات" : "Notifications"} />
      <main className="qs-page qs-compact-page">
        {scope.isPending ? (
          <Skeleton className="h-[480px] rounded-2xl" />
        ) : (
          <NotificationCenter
            rows={feed.data ?? []}
            ar={ar}
            timezone={restaurant.data?.timezone ?? "Asia/Amman"}
            pending={Boolean(rid) && feed.isPending}
            error={feed.isError ? humanError(feed.error, lang) : undefined}
            busy={markRead.isPending}
            onRead={(ids) => markRead.mutate(ids)}
            onRetry={() => void feed.refetch()}
          />
        )}
      </main>
    </div>
  );
}

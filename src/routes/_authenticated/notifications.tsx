import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Bell, CheckCheck, ClipboardList, Info, Settings } from "lucide-react";

import { AppHeader } from "@/components/nav/AppHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useSupabaseSession } from "@/hooks/useSession";
import { useWorkspaceReport, useWorkspaceScope } from "@/hooks/useWorkspace";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/notifications")({
  head: () => ({
    meta: [
      { title: "Notifications — QuickServe" },
      { name: "description", content: "QuickServe notifications and activity updates." },
    ],
  }),
  component: NotificationsPage,
});

type NotificationItem = {
  id: string;
  title: string;
  body: string;
  time: string;
  type: "orders" | "system" | "info";
};

function NotificationsPage() {
  const { lang } = useI18n();
  const scope = useWorkspaceScope();
  const session = useSupabaseSession();
  const report = useWorkspaceReport(scope.restaurantId);
  const [readIds, setReadIds] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const isAr = lang === "ar";
  const openOrders = report.data?.openOrders ?? 0;
  const userId = session.data?.user.id ?? "guest";
  const readStorageKey = `quickserve.notifications.read:${userId}:${scope.restaurantId ?? "global"}`;

  useEffect(() => {
    setHydrated(false);
    try {
      const raw = window.localStorage.getItem(readStorageKey);
      const parsed = raw ? JSON.parse(raw) : [];
      setReadIds(Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : []);
    } catch {
      setReadIds([]);
    } finally {
      setHydrated(true);
    }
  }, [readStorageKey]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(readStorageKey, JSON.stringify(readIds));
    } catch {
      // Storage can be unavailable in private/restricted browser contexts.
    }
  }, [hydrated, readIds, readStorageKey]);

  const notifications = useMemo<NotificationItem[]>(() => {
    const items: NotificationItem[] = [];
    if (openOrders > 0) {
      items.push({
        id: `open-orders-${openOrders}`,
        title: isAr ? "طلبات تحتاج إلى متابعة" : "Orders need attention",
        body: isAr
          ? `لديك ${openOrders} طلب مفتوح يحتاج إلى المتابعة.`
          : `You have ${openOrders} open order${openOrders === 1 ? "" : "s"} that need attention.`,
        time: isAr ? "الآن" : "Now",
        type: "orders",
      });
    }
    items.push({
      id: "workspace-ready",
      title: isAr ? "مساحة العمل جاهزة" : "Workspace is ready",
      body: isAr ? "بيانات المطعم جاهزة ويمكنك متابعة التشغيل." : "Your restaurant workspace is ready for operations.",
      time: isAr ? "اليوم" : "Today",
      type: "system",
    });
    items.push({
      id: "notification-center",
      title: isAr ? "مركز الإشعارات" : "Notification center",
      body: isAr ? "ستظهر هنا تحديثات الطلبات والتنبيهات المهمة." : "Order updates and important alerts will appear here.",
      time: isAr ? "اليوم" : "Today",
      type: "info",
    });
    return items;
  }, [isAr, openOrders]);

  const unread = notifications.filter((item) => !readIds.includes(item.id)).length;

  function markRead(id: string) {
    setReadIds((current) => current.includes(id) ? current : [...current, id]);
  }

  function markAllRead() {
    setReadIds((current) => Array.from(new Set([...current, ...notifications.map((item) => item.id)])));
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto w-full max-w-[880px] px-4 py-6 pb-28 sm:px-6 sm:py-9">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl border border-border bg-card text-[#ff5a0a] shadow-sm"><Bell className="size-[18px]" /></span>
              <div><h1 className="qs-page-title">{isAr ? "الإشعارات" : "Notifications"}</h1><p className="qs-page-subtitle">{isAr ? "آخر التحديثات والتنبيهات المهمة." : "Important updates without the noise."}</p></div>
            </div>
          </div>
          {unread > 0 ? (
            <Button variant="outline" size="sm" onClick={markAllRead} className="gap-2 self-start sm:self-auto"><CheckCheck className="size-4" />{isAr ? "قراءة الكل" : "Mark all read"}</Button>
          ) : null}
        </header>

        <div className="mt-6 flex items-center justify-between border-b border-border pb-3">
          <p className="text-sm font-semibold">{isAr ? "كل التنبيهات" : "All notifications"}</p>
          <Badge variant={unread > 0 ? "default" : "secondary"} className="rounded-full">{unread} {isAr ? "غير مقروء" : "unread"}</Badge>
        </div>

        <section className="divide-y divide-border" aria-label={isAr ? "قائمة الإشعارات" : "Notification list"}>
          {notifications.map((item) => {
            const read = readIds.includes(item.id);
            const Icon = item.type === "orders" ? ClipboardList : item.type === "system" ? Settings : Info;
            return (
              <article key={item.id} className={cn("group py-4 sm:py-5", !read && "bg-orange-500/[.025]")}>
                <div className="flex gap-3 sm:gap-4">
                  <span className={cn("mt-0.5 grid size-10 shrink-0 place-items-center rounded-xl border", !read ? "border-orange-500/20 bg-orange-500/10 text-[#ff5a0a]" : "border-border bg-muted/50 text-muted-foreground")}><Icon className="size-[18px]" /></span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0"><div className="flex items-center gap-2"><h2 className="truncate text-sm font-bold sm:text-[15px]">{item.title}</h2>{!read ? <span className="size-2 shrink-0 rounded-full bg-[#ff5a0a]" /> : null}</div><p className="mt-1 text-sm leading-6 text-muted-foreground">{item.body}</p></div>
                      <span className="shrink-0 text-[11px] text-muted-foreground">{item.time}</span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {item.type === "orders" ? <Button asChild size="sm" variant="outline"><Link to="/dashboard">{isAr ? "فتح الطلبات" : "Open orders"}</Link></Button> : null}
                      {!read ? <Button size="sm" variant="ghost" onClick={() => markRead(item.id)}><CheckCheck className="size-4" />{isAr ? "تمت القراءة" : "Mark read"}</Button> : null}
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      </main>
    </div>
  );
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Bell, CheckCheck, ClipboardList, Info, Settings } from "lucide-react";

import { AppHeader } from "@/components/nav/AppHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  const report = useWorkspaceReport(scope.restaurantId);
  const [readIds, setReadIds] = useState<string[]>([]);
  const isAr = lang === "ar";
  const openOrders = report.data?.openOrders ?? 0;

  const notifications = useMemo<NotificationItem[]>(() => {
    const items: NotificationItem[] = [];
    if (openOrders > 0) {
      items.push({
        id: "open-orders",
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

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto w-full max-w-3xl px-4 py-5 pb-28 sm:px-6 sm:py-8">
        <header className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-accent/20">
              <Bell className="size-5" />
            </span>
            <div className="min-w-0">
              <h1 className="text-xl font-semibold sm:text-2xl">{isAr ? "الإشعارات" : "Notifications"}</h1>
              <p className="text-sm text-muted-foreground">{isAr ? "آخر التحديثات والتنبيهات" : "Latest updates and alerts"}</p>
            </div>
          </div>
          {unread > 0 && (
            <Button variant="outline" size="sm" onClick={() => setReadIds(notifications.map((item) => item.id))} className="gap-2">
              <CheckCheck className="size-4" />
              <span className="hidden sm:inline">{isAr ? "تحديد الكل كمقروء" : "Mark all read"}</span>
            </Button>
          )}
        </header>

        <div className="mt-5 flex items-center justify-between rounded-2xl border bg-card px-4 py-3 shadow-sm">
          <div>
            <p className="text-sm font-medium">{isAr ? "غير مقروء" : "Unread"}</p>
            <p className="text-xs text-muted-foreground">{isAr ? "التنبيهات التي تحتاج انتباهك" : "Notifications that need your attention"}</p>
          </div>
          <Badge variant={unread > 0 ? "default" : "secondary"}>{unread}</Badge>
        </div>

        <section className="mt-4 space-y-3" aria-label={isAr ? "قائمة الإشعارات" : "Notification list"}>
          {notifications.map((item) => {
            const read = readIds.includes(item.id);
            const Icon = item.type === "orders" ? ClipboardList : item.type === "system" ? Settings : Info;
            return (
              <article key={item.id} className={cn("rounded-2xl border bg-card p-4 shadow-sm sm:p-5", !read && "border-accent/60 bg-accent/[0.04]")}>
                <div className="flex gap-3">
                  <div className={cn("grid size-10 shrink-0 place-items-center rounded-xl", !read ? "bg-accent/20" : "bg-muted")}>
                    <Icon className="size-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <h2 className="font-semibold">{item.title}</h2>
                        <p className="mt-1 text-sm leading-6 text-muted-foreground">{item.body}</p>
                      </div>
                      <span className="shrink-0 text-xs text-muted-foreground">{item.time}</span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {item.type === "orders" && (
                        <Button asChild size="sm" variant="outline"><Link to="/dashboard">{isAr ? "فتح الطلبات" : "Open orders"}</Link></Button>
                      )}
                      {!read && (
                        <Button size="sm" variant="ghost" onClick={() => setReadIds((current) => [...current, item.id])}>
                          <CheckCheck className="size-4" />
                          {isAr ? "تحديد كمقروء" : "Mark as read"}
                        </Button>
                      )}
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

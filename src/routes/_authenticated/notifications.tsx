import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Bell, CheckCheck, ClipboardList, Info, Settings, X } from "lucide-react";

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
          ? `لديك ${openOrders} طلب${openOrders === 1 ? "" : "ات"} مفتوح في مساحة العمل.`
          : `You have ${openOrders} open order${openOrders === 1 ? "" : "s"} in your workspace.`,
        time: isAr ? "الآن" : "Now",
        type: "orders",
      });
    }
    items.push({
      id: "workspace-ready",
      title: isAr ? "مساحة العمل جاهزة" : "Workspace is ready",
      body: isAr
        ? "تم تحميل بيانات المطعم الحالية ويمكنك متابعة إدارة التشغيل."
        : "Your restaurant workspace is loaded and ready for operations.",
      time: isAr ? "اليوم" : "Today",
      type: "system",
    });
    items.push({
      id: "notification-center",
      title: isAr ? "مركز الإشعارات" : "Notification center",
      body: isAr
        ? "ستظهر هنا تحديثات الطلبات والتنبيهات المهمة الخاصة بمساحة العمل."
        : "Order updates and important workspace alerts will appear here.",
      time: isAr ? "اليوم" : "Today",
      type: "info",
    });
    return items;
  }, [isAr, openOrders]);

  const unread = notifications.filter((item) => !readIds.includes(item.id)).length;

  function markRead(id: string) {
    setReadIds((current) => (current.includes(id) ? current : [...current, id]));
  }

  function markAllRead() {
    setReadIds(notifications.map((item) => item.id));
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto w-full max-w-3xl px-4 py-5 pb-28 sm:px-6 sm:py-8">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-accent/20 text-foreground">
                <Bell className="size-5" />
              </span>
              <div className="min-w-0">
                <h1 className="text-xl font-semibold sm:text-2xl">
                  {isAr ? "الإشعارات" : "Notifications"}
                </h1>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {isAr ? "آخر التحديثات والتنبيهات" : "Latest updates and alerts"}
                </p>
              </div>
            </div>
          </div>
          {unread > 0 ? (
            <Button variant="outline" size="sm" onClick={markAllRead} className="shrink-0 gap-2">
              <CheckCheck className="size-4" />
              <span className="hidden sm:inline">{isAr ? "تحديد الكل كمقروء" : "Mark all read"}</span>
            </Button>
          ) : null}
        </div>

        <div className="mt-5 flex items-center justify-between rounded-2xl border bg-card px-4 py-3 shadow-sm">
          <div>
            <p className="text-sm font-medium">{isAr ? "غير مقروء" : "Unread"}</p>
            <p className="text-xs text-muted-foreground">
              {isAr ? "التنبيهات التي تحتاج انتباهك" : "Notifications that need your attention"}
            </p>
          </div>
          <Badge variant={unread > 0 ? "default" : "secondary"}>{unread}</Badge>
        </div>

        <section className="mt-4 space-y-3" aria-label={isAr ? "قائمة الإشعارات" : "Notification list"}>
          {notifications.map((item) => {
            const read = readIds.includes(item.id);
            const Icon = item.type === "orders" ? ClipboardList : item.type === "system" ? Settings : Info;
            return (
              <article
                key={item.id}
                className={cn(
                  "rounded-2xl border bg-card p-4 shadow-sm transition-colors sm:p-5",
                  !read && "border-accent/60 bg-accent/[0.04]",
                )}
              >
                <div className="flex gap-3">
                  <div className={cn("grid size-10 shrink-0 place-items-center rounded-xl", !read ? "bg-accent/20" : "bg-muted")}>
                    <Icon className="size-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h2 className="break-words font-semibold">{item.title}</h2>
                        <p className="mt-1 break-words text-sm leading-6 text-muted-foreground">{item.body}</p>
                      </div>
                      <span className="shrink-0 text-xs text-muted-foreground">{item.time}</span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {item.type === "orders" ? (
                        <Button asChild size="sm" variant="outline">
                          <Link to="/dashboard">{isAr ? "فتح الطلبات" : "Open orders"}</Link>
                        </Button>
                      ) : null}
                      {!read ? (
                        <Button size="sm" variant="ghost" onClick={() => markRead(item.id)}>
                          <CheckCheck className="size-4" />
                          {isAr ? "تحديد كمقروء" : "Mark as read"}
                        </Button>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2 py-1.5 text-xs text-muted-foreground">
                          <CheckCheck className="size-3.5" />
                          {isAr ? "مقروء" : "Read"}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </section>

        <div className="mt-5 flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <X className="size-3.5" />
          <span>{isAr ? "يمكن إضافة إعدادات إشعارات متقدمة لاحقاً" : "Advanced notification preferences can be added here later."}</span>
        </div>
      </main>
    </div>
  );
}

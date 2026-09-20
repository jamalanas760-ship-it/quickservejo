import { CloudOff, RefreshCw, Wifi } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { flushOfflineOperations, offlineQueueCount, subscribeOfflineQueue } from "@/lib/offline-ops";
import { useI18n } from "@/lib/i18n";

export function OfflineOperationsBanner() {
  const { lang } = useI18n();
  const ar = lang === "ar";
  const qc = useQueryClient();
  const [online, setOnline] = useState(() => typeof navigator === "undefined" ? true : navigator.onLine);
  const [count, setCount] = useState(() => offlineQueueCount());
  const [syncing, setSyncing] = useState(false);

  async function sync(showToast = true) {
    if (syncing) return;
    setSyncing(true);
    try {
      const result = await flushOfflineOperations();
      setCount(result.remaining);
      if (result.flushed > 0) {
        await Promise.all([
          qc.invalidateQueries({ queryKey: ["kitchen"] }),
          qc.invalidateQueries({ queryKey: ["platform"] }),
        ]);
        if (showToast) toast.success(ar ? `تمت مزامنة ${result.flushed} إجراءات تشغيلية` : `Synced ${result.flushed} operational actions`);
      }
    } catch {
      if (showToast) toast.error(ar ? "تعذر إكمال المزامنة الآن" : "Could not finish syncing yet");
    } finally {
      setSyncing(false);
    }
  }

  useEffect(() => subscribeOfflineQueue(() => {
    const nextOnline = navigator.onLine;
    setOnline(nextOnline);
    setCount(offlineQueueCount());
    if (nextOnline && offlineQueueCount() > 0) void sync(false);
  }), [ar]);

  useEffect(() => {
    if (online && count > 0) void sync(false);
  }, []);

  if (online && count === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-3 bottom-[82px] z-[70] flex justify-end lg:bottom-5 lg:end-5 lg:start-auto">
      <div className="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-2xl border border-border/90 bg-card/96 p-3 shadow-[var(--qs-shadow-float)] backdrop-blur-xl lg:w-auto lg:min-w-[360px]">
        <span className={online ? "grid size-10 shrink-0 place-items-center rounded-xl bg-blue-500/10 text-blue-600" : "grid size-10 shrink-0 place-items-center rounded-xl bg-amber-500/10 text-amber-700"}>
          {online ? <Wifi className="size-4" /> : <CloudOff className="size-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <strong className="block text-sm">
            {online
              ? (ar ? "جارٍ استعادة الاتصال" : "Connection restored")
              : (ar ? "وضع التشغيل بدون اتصال" : "Offline operations mode")}
          </strong>
          <p className="mt-0.5 text-[11px] leading-5 text-muted-foreground">
            {count > 0
              ? (ar ? `${count} إجراءات محفوظة على هذا الجهاز وستتم مزامنتها بالترتيب.` : `${count} actions are safely queued on this device and will replay in order.`)
              : (ar ? "يمكن متابعة بعض إجراءات الخدمة، بينما المدفوعات تحتاج اتصالاً." : "Some service actions can continue; payments still require a connection.")}
          </p>
        </div>
        {online && count > 0 ? (
          <Button size="sm" variant="outline" disabled={syncing} onClick={() => void sync(true)}>
            <RefreshCw className={syncing ? "size-3 animate-spin" : "size-3"} />
            {ar ? "مزامنة" : "Sync"}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

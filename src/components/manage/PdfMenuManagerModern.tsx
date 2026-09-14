import { useState } from "react";
import { MousePointer2 } from "lucide-react";

import { Switch } from "@/components/ui/switch";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { PdfMenuManagerV3 } from "./PdfMenuManagerV3";

export function PdfMenuManagerModern({ restaurantId }: { restaurantId: string }) {
  const { lang } = useI18n();
  const [editAreas, setEditAreas] = useState(false);
  const ar = lang === "ar";

  return (
    <div className={cn("qs-pdf-modern space-y-3", !editAreas && "qs-pdf-browse") }>
      <div className="qs-selection-mode flex flex-col gap-3 rounded-2xl border border-border/70 bg-card px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", editAreas ? "bg-orange-500/12 text-[#ff5a0a]" : "bg-muted text-muted-foreground")}>
            <MousePointer2 className="size-[18px]" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-bold">{ar ? "وضع تحديد المناطق" : "Area selection mode"}</p>
            <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
              {editAreas
                ? (ar ? "التحديد مفعّل — يمكنك رسم المناطق وتحريكها وتغيير حجمها." : "Selection is ON — draw, move, and resize clickable areas.")
                : (ar ? "التحديد متوقف — تصفح القائمة واسحبها بدون تحديد أي منطقة بالخطأ." : "Selection is OFF — browse and scroll the menu without accidental selections.")}
            </p>
          </div>
        </div>
        <label className="flex min-h-11 shrink-0 cursor-pointer items-center justify-between gap-3 rounded-xl border border-border bg-background px-3 sm:min-w-[150px]">
          <span className="text-xs font-bold">{editAreas ? (ar ? "تشغيل" : "ON") : (ar ? "إيقاف" : "OFF")}</span>
          <Switch checked={editAreas} onCheckedChange={setEditAreas} aria-label={ar ? "تشغيل أو إيقاف تحديد المناطق" : "Toggle area selection mode"} />
        </label>
      </div>
      <PdfMenuManagerV3 restaurantId={restaurantId} />
    </div>
  );
}

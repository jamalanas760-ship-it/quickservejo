import { useState } from "react";
import { Hand, MousePointer2 } from "lucide-react";

import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { PdfMenuManagerV3 } from "./PdfMenuManagerV3";

export function PdfMenuManagerModern({ restaurantId }: { restaurantId: string }) {
  const { lang } = useI18n();
  const [editAreas, setEditAreas] = useState(false);
  const ar = lang === "ar";

  return (
    <div className={cn("qs-pdf-modern space-y-3", !editAreas && "qs-pdf-browse") }>
      <div className="qs-selection-mode flex flex-col gap-3 rounded-2xl border border-border/70 bg-card px-4 py-3 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", editAreas ? "bg-orange-500/12 text-[#e85d2a]" : "bg-muted text-muted-foreground")}>
            {editAreas ? <MousePointer2 className="size-[18px]" /> : <Hand className="size-[18px]" />}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-bold">{editAreas ? (ar ? "تحرير المناطق القابلة للنقر" : "Edit clickable areas") : (ar ? "تصفح القائمة بأمان" : "Browse menu safely")}</p>
            <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
              {editAreas
                ? (ar ? "ارسم منطقة جديدة أو اختر منطقة موجودة لتحريكها وتغيير حجمها." : "Draw a new area or select an existing one to move and resize it.")
                : (ar ? "اسحب وتصفح ملف PDF بدون إنشاء تحديدات بالخطأ." : "Scroll and inspect the PDF without creating accidental selections.")}
            </p>
          </div>
        </div>

        <div className="grid w-full shrink-0 grid-cols-2 rounded-xl border border-border bg-muted/60 p-1 sm:w-auto" role="group" aria-label={ar ? "طريقة التعامل مع ملف PDF" : "PDF interaction mode"}>
          <button
            type="button"
            aria-pressed={!editAreas}
            onClick={() => setEditAreas(false)}
            className={cn("inline-flex min-h-10 min-w-0 items-center justify-center gap-2 rounded-lg px-3 text-xs font-bold transition", !editAreas ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
          >
            <Hand className="size-4 shrink-0" />
            <span className="whitespace-nowrap">{ar ? "تصفح" : "Browse"}</span>
          </button>
          <button
            type="button"
            aria-pressed={editAreas}
            onClick={() => setEditAreas(true)}
            className={cn("inline-flex min-h-10 min-w-0 items-center justify-center gap-2 rounded-lg px-3 text-xs font-bold transition", editAreas ? "bg-[#e85d2a] text-white shadow-sm" : "text-muted-foreground hover:text-foreground")}
          >
            <MousePointer2 className="size-4 shrink-0" />
            <span className="whitespace-nowrap">{ar ? "تعديل المناطق" : "Edit areas"}</span>
          </button>
        </div>
      </div>
      <PdfMenuManagerV3 restaurantId={restaurantId} />
    </div>
  );
}
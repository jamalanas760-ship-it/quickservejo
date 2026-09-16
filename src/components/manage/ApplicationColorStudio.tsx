import { type Dispatch, type ReactNode, type SetStateAction } from "react";
import {
  CheckCircle2,
  CircleDot,
  Layers3,
  Moon,
  MousePointer2,
  Palette,
  PanelLeft,
  PanelTop,
  RotateCcw,
  Sparkles,
  Sun,
} from "lucide-react";

import { Input } from "@/components/ui/input";
import { contrastRatio } from "@/lib/contrast";
import { readAppearance } from "@/lib/restaurant-appearance";

type Appearance = ReturnType<typeof readAppearance>;

type Props = {
  ar: boolean;
  restaurantName: string;
  brand: Appearance;
  setBrand: Dispatch<SetStateAction<Appearance>>;
  primaryColor: string;
  accentColor: string;
  setPrimaryColor: (value: string) => void;
  setAccentColor: (value: string) => void;
};

const defaults = readAppearance({});
const BRAND_DEFAULT = "#ff5a0a";
const ACCENT_DEFAULT = "#ff8a4c";

export function ApplicationColorStudio({ ar, restaurantName, brand, setBrand, primaryColor, accentColor, setPrimaryColor, setAccentColor }: Props) {
  const update = <K extends keyof Appearance>(key: K, value: Appearance[K]) => setBrand((current) => ({ ...current, [key]: value }));
  return <div className="border-t border-border pt-6">
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <span className="inline-flex items-center gap-2 rounded-full bg-orange-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[.16em] text-[#ff5a0a]"><Palette className="size-3.5" />{ar ? "نظام الألوان" : "Color system"}</span>
        <h4 className="mt-3 font-display text-xl font-bold tracking-[-.03em]">{ar ? "ألوان التطبيق" : "Application colors"}</h4>
        <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">{ar ? "ابنِ هوية واضحة لمساحة العمل. كل لون له وظيفة محددة ومعاينة مباشرة قبل الحفظ." : "Build a clear workspace identity. Every color has a defined job and a live preview before you save."}</p>
      </div>
      <span className="inline-flex items-center gap-2 self-start rounded-xl border border-border bg-card px-3 py-2 text-[10px] font-semibold text-muted-foreground"><CheckCircle2 className="size-3.5 text-emerald-500" />{ar ? "خاص بهذا المطعم فقط" : "Restaurant-scoped only"}</span>
    </div>

    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(360px,.78fr)]">
      <div className="space-y-4">
        <TokenGroup icon={<Sparkles className="size-4" />} title={ar ? "العلامة والتفاعل" : "Brand & interaction"} description={ar ? "الألوان التي تقود الإجراءات والحالة المحددة." : "Colors that lead actions and selected states."}>
          <ColorToken ar={ar} icon={<Palette className="size-4" />} label={ar ? "اللون الأساسي" : "Primary brand"} hint={ar ? "الأزرار والإجراءات الرئيسية" : "Primary actions and emphasis"} value={primaryColor} onChange={setPrimaryColor} onReset={() => setPrimaryColor(BRAND_DEFAULT)} />
          <ColorToken ar={ar} icon={<CircleDot className="size-4" />} label={ar ? "لون التمييز" : "Accent"} hint={ar ? "التفاصيل الثانوية" : "Secondary highlights"} value={accentColor} onChange={setAccentColor} onReset={() => setAccentColor(ACCENT_DEFAULT)} />
          <ColorToken ar={ar} icon={<MousePointer2 className="size-4" />} label={ar ? "العنصر المحدد" : "Selected navigation"} hint={ar ? "الحالة النشطة في التنقل" : "Active navigation state"} value={brand.selectedNavColor} onChange={(value) => update("selectedNavColor", value)} onReset={() => update("selectedNavColor", defaults.selectedNavColor)} />
        </TokenGroup>

        <TokenGroup icon={<PanelTop className="size-4" />} title={ar ? "التنقل" : "Navigation"} description={ar ? "تحكم مستقل بالشريط العلوي والقائمة الجانبية." : "Independent control for the top bar and sidebar."}>
          <ColorToken ar={ar} icon={<PanelTop className="size-4" />} label={ar ? "خلفية الشريط العلوي" : "Top navigation"} hint={ar ? "سطح الشريط العلوي" : "Top bar surface"} value={brand.topNavBackground} onChange={(value) => update("topNavBackground", value)} onReset={() => update("topNavBackground", defaults.topNavBackground)} />
          <ColorToken ar={ar} icon={<Sparkles className="size-4" />} label={ar ? "نص الشريط العلوي" : "Top navigation text"} hint={ar ? "النص والأيقونات" : "Text and icons"} value={brand.topNavText} onChange={(value) => update("topNavText", value)} onReset={() => update("topNavText", defaults.topNavText)} />
          <ColorToken ar={ar} icon={<PanelLeft className="size-4" />} label={ar ? "خلفية القائمة" : "Sidebar background"} hint={ar ? "سطح القائمة الجانبية" : "Sidebar surface"} value={brand.sidebarBackground} onChange={(value) => update("sidebarBackground", value)} onReset={() => update("sidebarBackground", defaults.sidebarBackground)} />
          <ColorToken ar={ar} icon={<Layers3 className="size-4" />} label={ar ? "نص القائمة" : "Sidebar text"} hint={ar ? "النص والأيقونات" : "Sidebar text and icons"} value={brand.sidebarText} onChange={(value) => update("sidebarText", value)} onReset={() => update("sidebarText", defaults.sidebarText)} />
        </TokenGroup>

        <TokenGroup icon={<Layers3 className="size-4" />} title={ar ? "الأسطح" : "Surfaces"} description={ar ? "خلفيات مريحة ومتوازنة للوضعين الفاتح والداكن." : "Balanced workspace surfaces for light and dark modes."}>
          <ColorToken ar={ar} icon={<Sun className="size-4" />} label={ar ? "خلفية الوضع الفاتح" : "Light background"} hint={ar ? "خلفية مساحة العمل الفاتحة" : "Light workspace canvas"} value={brand.lightBackground} onChange={(value) => update("lightBackground", value)} onReset={() => update("lightBackground", defaults.lightBackground)} />
          <ColorToken ar={ar} icon={<Moon className="size-4" />} label={ar ? "خلفية الوضع الداكن" : "Dark background"} hint={ar ? "خلفية مساحة العمل الداكنة" : "Dark workspace canvas"} value={brand.darkBackground} onChange={(value) => update("darkBackground", value)} onReset={() => update("darkBackground", defaults.darkBackground)} />
        </TokenGroup>
      </div>

      <div className="space-y-4 xl:sticky xl:top-24 xl:self-start">
        <Preview ar={ar} mode="light" restaurantName={restaurantName} brand={brand} primaryColor={primaryColor} />
        <Preview ar={ar} mode="dark" restaurantName={restaurantName} brand={brand} primaryColor={primaryColor} />
      </div>
    </div>
  </div>;
}

function TokenGroup({ icon, title, description, children }: { icon: ReactNode; title: string; description: string; children: ReactNode }) {
  return <section className="overflow-hidden rounded-2xl border border-border bg-card">
    <div className="flex items-start gap-3 border-b border-border bg-muted/20 px-4 py-3.5"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-orange-500/10 text-[#ff5a0a]">{icon}</span><div><h5 className="text-sm font-bold">{title}</h5><p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">{description}</p></div></div>
    <div className="divide-y divide-border">{children}</div>
  </section>;
}

function ColorToken({ ar, icon, label, hint, value, onChange, onReset }: { ar: boolean; icon: ReactNode; label: string; hint: string; value: string; onChange: (value: string) => void; onReset: () => void }) {
  const valid = /^#[0-9a-f]{6}$/i.test(value);
  const ratio = valid ? Math.max(contrastRatio(value, "#ffffff"), contrastRatio(value, "#111827")) : 0;
  const accessible = valid && ratio >= 4.5;
  return <div className="grid gap-3 p-4 lg:grid-cols-[minmax(170px,1fr)_minmax(220px,.9fr)] lg:items-center">
    <div className="flex min-w-0 items-start gap-3"><span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">{icon}</span><span className="min-w-0"><strong className="block text-xs">{label}</strong><span className="mt-1 block text-[10px] leading-4 text-muted-foreground">{hint}</span><span className={`mt-1.5 inline-flex items-center gap-1 text-[9px] font-bold ${accessible ? "text-emerald-600" : "text-amber-600"}`}><span className={`size-1.5 rounded-full ${accessible ? "bg-emerald-500" : "bg-amber-500"}`} />{!valid ? (ar ? "أدخل HEX من 6 خانات" : "Enter a 6-digit HEX") : accessible ? `${ar ? "تباين جيد" : "Good contrast"} · ${ratio.toFixed(1)}:1` : `${ar ? "راجع التباين" : "Review contrast"} · ${ratio.toFixed(1)}:1`}</span></span></div>
    <div className="grid grid-cols-[44px_minmax(0,1fr)_38px] gap-2"><Input type="color" value={valid ? value : "#000000"} onChange={(event) => onChange(event.target.value)} className="h-10 w-full cursor-pointer p-1" aria-label={`${label} color`} /><Input value={value} aria-invalid={!valid} onChange={(event) => onChange(event.target.value)} className="h-10 min-w-0 font-mono text-xs uppercase" /><button type="button" onClick={onReset} className="grid size-10 place-items-center rounded-xl border border-border text-muted-foreground transition hover:bg-muted hover:text-foreground" aria-label={ar ? `إعادة ${label}` : `Reset ${label}`} title={ar ? "إعادة الافتراضي" : "Reset default"}><RotateCcw className="size-3.5" /></button></div>
  </div>;
}

function Preview({ ar, mode, restaurantName, brand, primaryColor }: { ar: boolean; mode: "light" | "dark"; restaurantName: string; brand: Appearance; primaryColor: string }) {
  const dark = mode === "dark";
  const canvas = dark ? brand.darkBackground : brand.lightBackground;
  const card = dark ? "#15191f" : "#ffffff";
  const text = dark ? "#f8fafc" : "#111827";
  const subtle = dark ? "#94a3b8" : "#64748b";
  return <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
    <div className="flex items-center justify-between border-b border-border px-4 py-3"><div className="flex items-center gap-2">{dark ? <Moon className="size-4 text-violet-500" /> : <Sun className="size-4 text-amber-500" />}<strong className="text-xs">{dark ? (ar ? "معاينة داكنة" : "Dark preview") : (ar ? "معاينة فاتحة" : "Light preview")}</strong></div><span className="rounded-full bg-muted px-2 py-1 text-[9px] font-bold text-muted-foreground">LIVE</span></div>
    <div className="overflow-hidden">
      <div className="flex min-h-11 items-center gap-2 px-3" style={{ background: brand.topNavBackground, color: brand.topNavText }}><span className="grid size-7 place-items-center rounded-lg text-[10px] font-black text-white" style={{ background: primaryColor }}>Q</span><strong className="truncate text-[10px]">{restaurantName}</strong><span className="ms-auto size-6 rounded-full border border-current opacity-35" /></div>
      <div className="grid min-h-[230px] grid-cols-[112px_1fr]" style={{ background: canvas, color: text }}><aside className="space-y-1.5 p-2.5" style={{ background: brand.sidebarBackground, color: brand.sidebarText }}><div className="rounded-lg px-2.5 py-2 text-[9px] font-bold" style={{ background: `${brand.selectedNavColor}20`, color: brand.selectedNavColor }}>{ar ? "الرئيسية" : "Home"}</div>{[ar ? "الطلبات" : "Orders", ar ? "القائمة" : "Menu", ar ? "التحليلات" : "Analytics", ar ? "الطاولات" : "Tables"].map((label) => <div key={label} className="px-2.5 py-1.5 text-[9px] opacity-65">{label}</div>)}</aside><main className="p-3"><div className="grid grid-cols-2 gap-2"><PreviewCard label={ar ? "المبيعات" : "Sales"} value="JOD 1,240" card={card} text={text} subtle={subtle} /><PreviewCard label={ar ? "الطلبات" : "Orders"} value="42" card={card} text={text} subtle={subtle} /></div><div className="mt-2.5 rounded-xl border p-3" style={{ background: card, borderColor: dark ? "#2c3440" : "#e5e7eb" }}><div className="flex items-center justify-between"><span className="text-[9px] font-bold">{ar ? "أداء اليوم" : "Today performance"}</span><span className="rounded-full bg-emerald-500/10 px-2 py-1 text-[8px] font-bold text-emerald-500">+8.4%</span></div><div className="mt-3 flex h-10 items-end gap-1">{[34,55,42,70,48,80,62,88].map((height, index) => <i key={index} className="flex-1 rounded-t-sm" style={{ height: `${height}%`, background: index === 7 ? primaryColor : `${primaryColor}44` }} />)}</div></div><button type="button" className="mt-2.5 rounded-lg px-3 py-2 text-[9px] font-bold text-white" style={{ background: primaryColor }}>{ar ? "إجراء أساسي" : "Primary action"}</button></main></div>
    </div>
  </section>;
}

function PreviewCard({ label, value, card, text, subtle }: { label: string; value: string; card: string; text: string; subtle: string }) {
  return <div className="rounded-xl border p-2.5" style={{ background: card, borderColor: `${subtle}32` }}><span className="block text-[8px]" style={{ color: subtle }}>{label}</span><strong className="mt-1 block text-sm" style={{ color: text }}>{value}</strong></div>;
}

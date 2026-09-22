import { useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { CheckCircle2, CircleDot, Layers3, Moon, MousePointer2, Palette, PanelLeft, PanelTop, RotateCcw, Sparkles, Sun } from "lucide-react";

import { Input } from "@/components/ui/input";
import { contrastRatio } from "@/lib/contrast";
import { readAppearance } from "@/lib/restaurant-appearance";
import { cn } from "@/lib/utils";

type Appearance = ReturnType<typeof readAppearance>;
type Props = {
  ar: boolean; restaurantName: string; brand: Appearance; setBrand: Dispatch<SetStateAction<Appearance>>;
  primaryColor: string; accentColor: string; setPrimaryColor: (value: string) => void; setAccentColor: (value: string) => void;
};
const defaults = readAppearance({});
const BRAND_DEFAULT = "#e85d2a";
const ACCENT_DEFAULT = "#ff8a4c";
type Mode = "light" | "dark";

export function ApplicationColorStudio({ ar, restaurantName, brand, setBrand, primaryColor, accentColor, setPrimaryColor, setAccentColor }: Props) {
  const [mode, setMode] = useState<Mode>("light");
  const update = <K extends keyof Appearance>(key: K, value: Appearance[K]) => setBrand((current) => ({ ...current, [key]: value }));
  const dark = mode === "dark";
  const token = {
    primary: dark ? brand.darkPrimaryColor : primaryColor,
    accent: dark ? brand.darkAccentColor : accentColor,
    selected: dark ? brand.darkSelectedNavColor : brand.selectedNavColor,
    topBg: dark ? brand.darkTopNavBackground : brand.topNavBackground,
    topText: dark ? brand.darkTopNavText : brand.topNavText,
    sideBg: dark ? brand.darkSidebarBackground : brand.sidebarBackground,
    sideText: dark ? brand.darkSidebarText : brand.sidebarText,
    background: dark ? brand.darkBackground : brand.lightBackground,
  };
  const set = {
    primary: (value: string) => dark ? update("darkPrimaryColor", value) : setPrimaryColor(value),
    accent: (value: string) => dark ? update("darkAccentColor", value) : setAccentColor(value),
    selected: (value: string) => dark ? update("darkSelectedNavColor", value) : update("selectedNavColor", value),
    topBg: (value: string) => dark ? update("darkTopNavBackground", value) : update("topNavBackground", value),
    topText: (value: string) => dark ? update("darkTopNavText", value) : update("topNavText", value),
    sideBg: (value: string) => dark ? update("darkSidebarBackground", value) : update("sidebarBackground", value),
    sideText: (value: string) => dark ? update("darkSidebarText", value) : update("sidebarText", value),
    background: (value: string) => dark ? update("darkBackground", value) : update("lightBackground", value),
  };
  const reset = {
    primary: () => dark ? update("darkPrimaryColor", defaults.darkPrimaryColor) : setPrimaryColor(BRAND_DEFAULT),
    accent: () => dark ? update("darkAccentColor", defaults.darkAccentColor) : setAccentColor(ACCENT_DEFAULT),
    selected: () => dark ? update("darkSelectedNavColor", defaults.darkSelectedNavColor) : update("selectedNavColor", defaults.selectedNavColor),
    topBg: () => dark ? update("darkTopNavBackground", defaults.darkTopNavBackground) : update("topNavBackground", defaults.topNavBackground),
    topText: () => dark ? update("darkTopNavText", defaults.darkTopNavText) : update("topNavText", defaults.topNavText),
    sideBg: () => dark ? update("darkSidebarBackground", defaults.darkSidebarBackground) : update("sidebarBackground", defaults.sidebarBackground),
    sideText: () => dark ? update("darkSidebarText", defaults.darkSidebarText) : update("sidebarText", defaults.sidebarText),
    background: () => dark ? update("darkBackground", defaults.darkBackground) : update("lightBackground", defaults.lightBackground),
  };

  return <div className="border-t border-border pt-6">
    <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div><span className="inline-flex items-center gap-2 rounded-full bg-orange-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[.16em] text-[#e85d2a]"><Palette className="size-3.5" />{ar ? "نظام الألوان" : "Color system"}</span><h4 className="mt-3 font-display text-xl font-bold tracking-[-.03em]">{ar ? "ألوان التطبيق" : "Application colors"}</h4><p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">{ar ? "الوضع الفاتح والداكن مستقلان تماماً. عدّل كل وضع بدون التأثير على الآخر." : "Light and dark mode are fully independent. Customize one without changing the other."}</p></div>
      <span className="inline-flex items-center gap-2 self-start rounded-xl border border-border bg-card px-3 py-2 text-[10px] font-semibold text-muted-foreground"><CheckCircle2 className="size-3.5 text-emerald-500" />{ar ? "خاص بهذا المطعم" : "Restaurant scoped"}</span>
    </div>
    <div className="mb-5 grid max-w-md grid-cols-2 rounded-2xl border border-border bg-muted/30 p-1.5">
      <button type="button" onClick={() => setMode("light")} className={cn("flex min-h-11 items-center justify-center gap-2 rounded-xl text-xs font-bold transition", mode === "light" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground")}><Sun className="size-4" />{ar ? "الوضع الفاتح" : "Light theme"}</button>
      <button type="button" onClick={() => setMode("dark")} className={cn("flex min-h-11 items-center justify-center gap-2 rounded-xl text-xs font-bold transition", mode === "dark" ? "bg-[#171b21] text-white shadow-sm" : "text-muted-foreground")}><Moon className="size-4" />{ar ? "الوضع الداكن" : "Dark theme"}</button>
    </div>
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(360px,.78fr)]">
      <div className="space-y-4">
        <TokenGroup icon={<Sparkles className="size-4" />} title={ar ? "العلامة والتفاعل" : "Brand & interaction"} description={ar ? `ألوان ${dark ? "الوضع الداكن" : "الوضع الفاتح"} فقط.` : `Colors used only in ${dark ? "dark" : "light"} mode.`}>
          <ColorToken ar={ar} icon={<Palette className="size-4" />} label={ar ? "اللون الأساسي" : "Primary brand"} hint={ar ? "الأزرار والإجراءات الرئيسية" : "Primary actions and emphasis"} value={token.primary} onChange={set.primary} onReset={reset.primary} />
          <ColorToken ar={ar} icon={<CircleDot className="size-4" />} label={ar ? "لون التمييز" : "Accent"} hint={ar ? "التفاصيل الثانوية" : "Secondary highlights"} value={token.accent} onChange={set.accent} onReset={reset.accent} />
          <ColorToken ar={ar} icon={<MousePointer2 className="size-4" />} label={ar ? "العنصر المحدد" : "Selected navigation"} hint={ar ? "الحالة النشطة في التنقل" : "Active navigation state"} value={token.selected} onChange={set.selected} onReset={reset.selected} />
        </TokenGroup>
        <TokenGroup icon={<PanelTop className="size-4" />} title={ar ? "التنقل" : "Navigation"} description={ar ? "تحكم مستقل بالشريط العلوي والقائمة الجانبية لهذا الوضع." : "Top bar and sidebar values for this mode only."}>
          <ColorToken ar={ar} icon={<PanelTop className="size-4" />} label={ar ? "خلفية الشريط العلوي" : "Top navigation"} hint={ar ? "سطح الشريط العلوي" : "Top bar surface"} value={token.topBg} onChange={set.topBg} onReset={reset.topBg} />
          <ColorToken ar={ar} icon={<Sparkles className="size-4" />} label={ar ? "نص الشريط العلوي" : "Top navigation text"} hint={ar ? "النص والأيقونات" : "Text and icons"} value={token.topText} onChange={set.topText} onReset={reset.topText} />
          <ColorToken ar={ar} icon={<PanelLeft className="size-4" />} label={ar ? "خلفية القائمة" : "Sidebar background"} hint={ar ? "سطح القائمة الجانبية" : "Sidebar surface"} value={token.sideBg} onChange={set.sideBg} onReset={reset.sideBg} />
          <ColorToken ar={ar} icon={<Layers3 className="size-4" />} label={ar ? "نص القائمة" : "Sidebar text"} hint={ar ? "النص والأيقونات" : "Sidebar text and icons"} value={token.sideText} onChange={set.sideText} onReset={reset.sideText} />
        </TokenGroup>
        <TokenGroup icon={<Layers3 className="size-4" />} title={ar ? "مساحة العمل" : "Workspace surface"} description={ar ? "خلفية التطبيق لهذا الوضع فقط." : "Application canvas for this mode only."}>
          <ColorToken ar={ar} icon={dark ? <Moon className="size-4" /> : <Sun className="size-4" />} label={dark ? (ar ? "خلفية الوضع الداكن" : "Dark background") : (ar ? "خلفية الوضع الفاتح" : "Light background")} hint={ar ? "خلفية مساحة العمل" : "Workspace canvas"} value={token.background} onChange={set.background} onReset={reset.background} />
        </TokenGroup>
      </div>
      <div className="xl:sticky xl:top-24 xl:self-start"><Preview ar={ar} mode={mode} restaurantName={restaurantName} token={token} /></div>
    </div>
  </div>;
}

function TokenGroup({ icon, title, description, children }: { icon: ReactNode; title: string; description: string; children: ReactNode }) { return <section className="overflow-hidden rounded-2xl border border-border bg-card"><div className="flex items-start gap-3 border-b border-border bg-muted/20 px-4 py-3.5"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-orange-500/10 text-[#e85d2a]">{icon}</span><div><h5 className="text-sm font-bold">{title}</h5><p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">{description}</p></div></div><div className="divide-y divide-border">{children}</div></section>; }
function ColorToken({ ar, icon, label, hint, value, onChange, onReset }: { ar: boolean; icon: ReactNode; label: string; hint: string; value: string; onChange: (value: string) => void; onReset: () => void }) {
  const valid = /^#[0-9a-f]{6}$/i.test(value); const ratio = valid ? Math.max(contrastRatio(value, "#ffffff"), contrastRatio(value, "#111827")) : 0; const accessible = valid && ratio >= 4.5;
  return <div className="grid gap-3 p-4 lg:grid-cols-[minmax(170px,1fr)_minmax(220px,.9fr)] lg:items-center"><div className="flex min-w-0 items-start gap-3"><span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">{icon}</span><span className="min-w-0"><strong className="block text-xs">{label}</strong><span className="mt-1 block text-[10px] leading-4 text-muted-foreground">{hint}</span><span className={`mt-1.5 inline-flex items-center gap-1 text-[9px] font-bold ${accessible ? "text-emerald-600" : "text-amber-600"}`}><span className={`size-1.5 rounded-full ${accessible ? "bg-emerald-500" : "bg-amber-500"}`} />{!valid ? (ar ? "أدخل HEX من 6 خانات" : "Enter a 6-digit HEX") : accessible ? `${ar ? "تباين جيد" : "Good contrast"} · ${ratio.toFixed(1)}:1` : `${ar ? "راجع التباين" : "Review contrast"} · ${ratio.toFixed(1)}:1`}</span></span></div><div className="grid grid-cols-[44px_minmax(0,1fr)_38px] gap-2"><Input type="color" value={valid ? value : "#000000"} onChange={(event) => onChange(event.target.value)} className="h-10 w-full cursor-pointer p-1" aria-label={`${label} color`} /><Input value={value} aria-invalid={!valid} onChange={(event) => onChange(event.target.value)} className="h-10 min-w-0 font-mono text-xs uppercase" /><button type="button" onClick={onReset} className="grid size-10 place-items-center rounded-xl border border-border text-muted-foreground transition hover:bg-muted hover:text-foreground" aria-label={ar ? `إعادة ${label}` : `Reset ${label}`}><RotateCcw className="size-3.5" /></button></div></div>;
}
function Preview({ ar, mode, restaurantName, token }: { ar: boolean; mode: Mode; restaurantName: string; token: { primary: string; accent: string; selected: string; topBg: string; topText: string; sideBg: string; sideText: string; background: string } }) {
  const dark = mode === "dark"; const card = dark ? "#181e23" : "#ffffff"; const text = dark ? "#f8fafc" : "#111827"; const subtle = dark ? "#94a3b8" : "#64748b";
  return <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm"><div className="flex items-center justify-between border-b border-border px-4 py-3"><div className="flex items-center gap-2">{dark ? <Moon className="size-4 text-violet-500" /> : <Sun className="size-4 text-amber-500" />}<strong className="text-xs">{dark ? (ar ? "معاينة الوضع الداكن" : "Dark mode preview") : (ar ? "معاينة الوضع الفاتح" : "Light mode preview")}</strong></div><span className="rounded-full bg-muted px-2 py-1 text-[9px] font-bold text-muted-foreground">LIVE</span></div><div className="overflow-hidden"><div className="flex min-h-11 items-center gap-2 px-3" style={{ background: token.topBg, color: token.topText }}><span className="grid size-7 place-items-center rounded-lg text-[10px] font-black text-white" style={{ background: token.primary }}>Q</span><strong className="truncate text-[10px]">{restaurantName}</strong><span className="ms-auto size-6 rounded-full border border-current opacity-35" /></div><div className="grid min-h-[250px] grid-cols-[112px_1fr]" style={{ background: token.background, color: text }}><aside className="space-y-1.5 p-2.5" style={{ background: token.sideBg, color: token.sideText }}><div className="rounded-lg px-2.5 py-2 text-[9px] font-bold" style={{ background: `${token.selected}20`, color: token.selected }}>{ar ? "الرئيسية" : "Home"}</div>{[ar ? "الطلبات" : "Orders", ar ? "القائمة" : "Menu", ar ? "التحليلات" : "Analytics", ar ? "الطاولات" : "Tables"].map((label) => <div key={label} className="px-2.5 py-1.5 text-[9px] opacity-70">{label}</div>)}</aside><main className="p-3"><div className="grid grid-cols-2 gap-2"><PreviewCard label={ar ? "المبيعات" : "Sales"} value="JOD 1,240" card={card} text={text} subtle={subtle} /><PreviewCard label={ar ? "الطلبات" : "Orders"} value="42" card={card} text={text} subtle={subtle} /></div><div className="mt-2.5 rounded-xl border p-3" style={{ background: card, borderColor: dark ? "#2c3440" : "#e5e7eb" }}><div className="flex items-center justify-between"><span className="text-[9px] font-bold">{ar ? "أداء اليوم" : "Today performance"}</span><span className="rounded-full px-2 py-1 text-[8px] font-bold" style={{ background: `${token.accent}22`, color: token.accent }}>+8.4%</span></div><div className="mt-3 flex h-10 items-end gap-1">{[34,55,42,70,48,80,62,88].map((height, index) => <i key={index} className="flex-1 rounded-t-sm" style={{ height: `${height}%`, background: index === 7 ? token.primary : `${token.primary}44` }} />)}</div></div><button type="button" className="mt-2.5 rounded-lg px-3 py-2 text-[9px] font-bold text-white" style={{ background: token.primary }}>{ar ? "إجراء أساسي" : "Primary action"}</button></main></div></div></section>;
}
function PreviewCard({ label, value, card, text, subtle }: { label: string; value: string; card: string; text: string; subtle: string }) { return <div className="rounded-xl border p-2.5" style={{ background: card, borderColor: `${subtle}33` }}><p className="text-[8px]" style={{ color: subtle }}>{label}</p><strong className="mt-1 block text-[13px]" style={{ color: text }}>{value}</strong></div>; }

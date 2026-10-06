import { useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { CheckCircle2, ChevronDown, Home, RotateCcw } from "lucide-react";

import { Input } from "@/components/ui/input";
import { readAppearance } from "@/lib/restaurant-appearance";
import { cn } from "@/lib/utils";

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
const BRAND_DEFAULT = "#e85d2a";
const ACCENT_DEFAULT = "#ff8a4c";
type Mode = "light" | "dark";

export function ApplicationColorStudio({
  ar,
  restaurantName,
  brand,
  setBrand,
  primaryColor,
  accentColor,
  setPrimaryColor,
  setAccentColor,
}: Props) {
  const [mode, setMode] = useState<Mode>("light");
  const update = <K extends keyof Appearance>(key: K, value: Appearance[K]) =>
    setBrand((current) => ({ ...current, [key]: value }));
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
    primary: (value: string) => (dark ? update("darkPrimaryColor", value) : setPrimaryColor(value)),
    accent: (value: string) => (dark ? update("darkAccentColor", value) : setAccentColor(value)),
    selected: (value: string) =>
      dark ? update("darkSelectedNavColor", value) : update("selectedNavColor", value),
    topBg: (value: string) =>
      dark ? update("darkTopNavBackground", value) : update("topNavBackground", value),
    topText: (value: string) =>
      dark ? update("darkTopNavText", value) : update("topNavText", value),
    sideBg: (value: string) =>
      dark ? update("darkSidebarBackground", value) : update("sidebarBackground", value),
    sideText: (value: string) =>
      dark ? update("darkSidebarText", value) : update("sidebarText", value),
    background: (value: string) =>
      dark ? update("darkBackground", value) : update("lightBackground", value),
  };
  const presets = dark
    ? [
        {
          id: "ember",
          label: ar ? "جمر" : "Ember",
          primary: "#ff6a1a",
          accent: "#ff9a5b",
          selected: "#ff6a1a",
          topBg: "#15191f",
          topText: "#f8fafc",
          sideBg: "#101418",
          sideText: "#cbd5e1",
          background: "#11171b",
        },
        {
          id: "graphite",
          label: ar ? "جرافيت" : "Graphite",
          primary: "#f97316",
          accent: "#a3a3a3",
          selected: "#f97316",
          topBg: "#18181b",
          topText: "#fafafa",
          sideBg: "#111113",
          sideText: "#d4d4d8",
          background: "#09090b",
        },
        {
          id: "olive",
          label: ar ? "زيتوني" : "Olive",
          primary: "#84a33a",
          accent: "#d8a24a",
          selected: "#84a33a",
          topBg: "#171a14",
          topText: "#f5f7ef",
          sideBg: "#11140f",
          sideText: "#cbd2be",
          background: "#0d100b",
        },
      ]
    : [
        {
          id: "quickserve",
          label: "QuickServe",
          primary: "#ff5a0a",
          accent: "#f59e0b",
          selected: "#ff5a0a",
          topBg: "#ffffff",
          topText: "#171a18",
          sideBg: "#ffffff",
          sideText: "#64748b",
          background: "#ffffff",
        },
        {
          id: "slate",
          label: ar ? "رمادي" : "Slate",
          primary: "#475569",
          accent: "#94a3b8",
          selected: "#475569",
          topBg: "#ffffff",
          topText: "#1e293b",
          sideBg: "#f8fafc",
          sideText: "#64748b",
          background: "#f1f5f9",
        },
        {
          id: "espresso",
          label: ar ? "إسبريسو" : "Espresso",
          primary: "#59433e",
          accent: "#b69787",
          selected: "#59433e",
          topBg: "#ffffff",
          topText: "#332923",
          sideBg: "#faf6f3",
          sideText: "#77695d",
          background: "#f5efea",
        },
        {
          id: "cobalt",
          label: ar ? "كوبالت" : "Cobalt",
          primary: "#1d4ed8",
          accent: "#60a5fa",
          selected: "#1d4ed8",
          topBg: "#ffffff",
          topText: "#172554",
          sideBg: "#f5f8ff",
          sideText: "#64748b",
          background: "#eff6ff",
        },
        {
          id: "forest",
          label: ar ? "غابة" : "Forest",
          primary: "#28745b",
          accent: "#c88b3c",
          selected: "#28745b",
          topBg: "#ffffff",
          topText: "#18342c",
          sideBg: "#f5faf7",
          sideText: "#64786f",
          background: "#f3f8f5",
        },
      ];

  function applyPreset(preset: (typeof presets)[number]) {
    set.primary(preset.primary);
    set.accent(preset.accent);
    set.selected(preset.selected);
    set.topBg(preset.topBg);
    set.topText(preset.topText);
    set.sideBg(preset.sideBg);
    set.sideText(preset.sideText);
    set.background(preset.background);
  }

  const activePresetId =
    presets.find(
      (preset) =>
        preset.primary.toLowerCase() === token.primary.toLowerCase() &&
        preset.accent.toLowerCase() === token.accent.toLowerCase() &&
        preset.selected.toLowerCase() === token.selected.toLowerCase() &&
        preset.topBg.toLowerCase() === token.topBg.toLowerCase() &&
        preset.topText.toLowerCase() === token.topText.toLowerCase() &&
        preset.sideBg.toLowerCase() === token.sideBg.toLowerCase() &&
        preset.sideText.toLowerCase() === token.sideText.toLowerCase() &&
        preset.background.toLowerCase() === token.background.toLowerCase(),
    )?.id ?? null;

  const reset = {
    primary: () =>
      dark ? update("darkPrimaryColor", defaults.darkPrimaryColor) : setPrimaryColor(BRAND_DEFAULT),
    accent: () =>
      dark ? update("darkAccentColor", defaults.darkAccentColor) : setAccentColor(ACCENT_DEFAULT),
    selected: () =>
      dark
        ? update("darkSelectedNavColor", defaults.darkSelectedNavColor)
        : update("selectedNavColor", defaults.selectedNavColor),
    topBg: () =>
      dark
        ? update("darkTopNavBackground", defaults.darkTopNavBackground)
        : update("topNavBackground", defaults.topNavBackground),
    topText: () =>
      dark
        ? update("darkTopNavText", defaults.darkTopNavText)
        : update("topNavText", defaults.topNavText),
    sideBg: () =>
      dark
        ? update("darkSidebarBackground", defaults.darkSidebarBackground)
        : update("sidebarBackground", defaults.sidebarBackground),
    sideText: () =>
      dark
        ? update("darkSidebarText", defaults.darkSidebarText)
        : update("sidebarText", defaults.sidebarText),
    background: () =>
      dark
        ? update("darkBackground", defaults.darkBackground)
        : update("lightBackground", defaults.lightBackground),
  };

  return (
    <div className="qs-color-studio ps-workspace-colors">
      <div className="ps-workspace-color-heading">
        <div>
          <h2>{ar ? "ألوان التطبيق" : "Application colors"}</h2>
          <p className="ps-workspace-help">
            {ar
              ? "خصص الوضع الفاتح والداكن بشكل مستقل."
              : "Customize light and dark themes separately."}
          </p>
        </div>
        <div className="ps-workspace-color-mode" aria-label={ar ? "وضع الألوان" : "Color mode"}>
          <button type="button" aria-pressed={!dark} onClick={() => setMode("light")}>
            {ar ? "فاتح" : "Light"}
          </button>
          <button type="button" aria-pressed={dark} onClick={() => setMode("dark")}>
            {ar ? "داكن" : "Dark"}
          </button>
        </div>
      </div>
      <section className="qs-color-presets ps-workspace-presets">
        <h3>{ar ? "أنماط سريعة" : "Quick styles"}</h3>
        <div className="ps-workspace-preset-rail">
          {presets.map((preset) => (
            <button
              key={preset.id}
              type="button"
              aria-pressed={activePresetId === preset.id}
              onClick={() => applyPreset(preset)}
              className="qs-color-preset"
            >
              <span className="qs-color-preset-swatches">
                <i style={{ background: preset.primary }} />
                <i style={{ background: preset.accent }} />
                <i style={{ background: preset.background }} />
                {activePresetId === preset.id && <CheckCircle2 className="size-4" />}
              </span>
              <strong>{preset.label}</strong>
            </button>
          ))}
        </div>
      </section>
      <div className="ps-workspace-color-groups">
        <TokenGroup
          title={ar ? "الأزرار والإجراءات" : "Buttons & actions"}
          description={
            ar
              ? "الأزرار الرئيسية والروابط والعناصر التفاعلية."
              : "Primary buttons, links and interactive elements."
          }
          defaultOpen
        >
          <ColorToken
            ar={ar}
            label={ar ? "الأساسي" : "Primary"}
            value={token.primary}
            onChange={set.primary}
            onReset={reset.primary}
          />
          <ColorToken
            ar={ar}
            label={ar ? "التمييز" : "Accent"}
            value={token.accent}
            onChange={set.accent}
            onReset={reset.accent}
          />
        </TokenGroup>
        <TokenGroup
          title={ar ? "التنقل" : "Navigation"}
          description={
            ar
              ? "العنصر النشط والشريط العلوي والقائمة الجانبية"
              : "Active item, top bar and sidebar"
          }
        >
          <ColorToken
            ar={ar}
            label={ar ? "التنقل النشط" : "Selected navigation"}
            value={token.selected}
            onChange={set.selected}
            onReset={reset.selected}
          />
          <ColorToken
            ar={ar}
            label={ar ? "خلفية الشريط العلوي" : "Top navigation"}
            value={token.topBg}
            onChange={set.topBg}
            onReset={reset.topBg}
          />
          <ColorToken
            ar={ar}
            label={ar ? "نص الشريط العلوي" : "Top navigation text"}
            value={token.topText}
            onChange={set.topText}
            onReset={reset.topText}
          />
          <ColorToken
            ar={ar}
            label={ar ? "خلفية القائمة" : "Sidebar background"}
            value={token.sideBg}
            onChange={set.sideBg}
            onReset={reset.sideBg}
          />
          <ColorToken
            ar={ar}
            label={ar ? "نص القائمة" : "Sidebar text"}
            value={token.sideText}
            onChange={set.sideText}
            onReset={reset.sideText}
          />
        </TokenGroup>
        <TokenGroup
          title={ar ? "خلفية مساحة العمل" : "Workspace background"}
          description={ar ? "خلفية الصفحة" : "Page background"}
        >
          <ColorToken
            ar={ar}
            label={ar ? "خلفية الصفحة" : "Page background"}
            value={token.background}
            onChange={set.background}
            onReset={reset.background}
          />
        </TokenGroup>
      </div>
      <section className="ps-workspace-color-preview">
        <h3>{ar ? "معاينة" : "Preview"}</h3>
        <div
          className="ps-workspace-color-preview-bar"
          style={{ background: token.topBg, color: token.topText }}
        >
          <strong>{restaurantName}</strong>
          <span className="ps-workspace-preview-home" style={{ color: token.selected }}>
            <Home className="size-4" />
            {ar ? "الرئيسية" : "Home"}
          </span>
          <span className="ps-workspace-preview-link">{ar ? "الطلبات" : "Orders"}</span>
          <span className="ps-workspace-preview-link">{ar ? "القائمة" : "Menu"}</span>
          <span
            className="ps-workspace-preview-action"
            style={{ background: token.primary, color: "#fff" }}
          >
            {ar ? "إجراء رئيسي" : "Primary action"}
          </span>
        </div>
        <p className="ps-workspace-help">
          {ar ? "احفظ لتطبيق الألوان على مساحة العمل." : "Save to apply colors to your workspace."}
        </p>
      </section>
    </div>
  );
}
function TokenGroup({
  title,
  description,
  children,
  defaultOpen = false,
}: {
  title: string;
  description: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details className="ps-workspace-color-group" open={defaultOpen || undefined}>
      <summary>
        <span>
          <strong>{title}</strong>
          <span>{description}</span>
        </span>
        <ChevronDown className="size-4" />
      </summary>
      <div className="ps-workspace-color-fields">{children}</div>
    </details>
  );
}
function ColorToken({
  ar,
  label,
  value,
  onChange,
  onReset,
}: {
  ar: boolean;
  label: string;
  value: string;
  onChange: (value: string) => void;
  onReset: () => void;
}) {
  const valid = /^#[0-9a-f]{6}$/i.test(value);
  return (
    <div className="ps-workspace-color-token">
      <div>
        <span>{label}</span>
        <div className="ps-workspace-color-input">
          <Input
            type="color"
            aria-label={`${label} ${ar ? "لون" : "color"}`}
            value={valid ? value : "#000000"}
            onChange={(event) => onChange(event.target.value)}
          />
          <Input
            aria-label={`${label} HEX`}
            value={value}
            aria-invalid={!valid}
            onChange={(event) => onChange(event.target.value)}
            spellCheck={false}
            maxLength={7}
          />
          <button
            type="button"
            aria-label={`${ar ? "إعادة ضبط" : "Reset"} ${label}`}
            onClick={onReset}
          >
            <RotateCcw className="size-4" />
          </button>
        </div>
      </div>
      {!valid && (
        <p className="text-xs text-destructive" role="alert">
          {ar ? "أدخل HEX من 6 خانات" : "Enter a 6-digit HEX"}
        </p>
      )}
    </div>
  );
}

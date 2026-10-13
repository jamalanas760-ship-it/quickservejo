import { BookOpenText, CheckCircle2, FileText } from "lucide-react";
import type { RestaurantAppearance } from "@/lib/restaurant-appearance";

export function MenuModeCards({
  appearance,
  selected,
  ar,
  disabled,
  pdfDisabled,
  onSelect,
}: {
  appearance: RestaurantAppearance;
  selected: "standard" | "pdf";
  ar: boolean;
  disabled?: boolean;
  pdfDisabled?: boolean;
  onSelect: (mode: "standard" | "pdf") => void;
}) {
  return (
    <div className="p2-menu-modes" aria-label={ar ? "نوع محرر القائمة" : "Menu editor type"}>
      {(
        [
          {
            id: "standard",
            image: appearance.standardMenuCardImage,
            icon: BookOpenText,
            title: ar ? "القائمة العادية" : "Standard Menu",
            description: ar
              ? "أنشئ وخصص قائمتك الإلكترونية"
              : "Build and customize your menu online",
          },
          {
            id: "pdf",
            image: appearance.pdfMenuCardImage,
            icon: FileText,
            title: ar ? "قائمة PDF التفاعلية" : "Clickable PDF Menu",
            description: ar
              ? "ارفع قائمتك وحدد مناطق النقر"
              : "Upload your menu and link clickable areas",
          },
        ] as const
      ).map(({ id, image, icon: Icon, title, description }) => (
        <button
          key={id}
          type="button"
          className="p2-menu-mode"
          aria-pressed={selected === id}
          disabled={disabled || (id === "pdf" && pdfDisabled)}
          onClick={() => onSelect(id)}
        >
          <span className="p2-menu-mode-art">
            {image ? (
              <img
                key={image}
                src={image}
                alt=""
                loading="lazy"
                onError={(event) => {
                  event.currentTarget.hidden = true;
                }}
              />
            ) : null}
            <Icon aria-hidden="true" className="p2-menu-mode-fallback" />
          </span>
          <span className="p2-menu-mode-copy">
            <strong>{title}</strong>
            <small>{description}</small>
          </span>
          {selected === id ? (
            <CheckCircle2 className="p2-menu-mode-check" aria-hidden="true" />
          ) : null}
        </button>
      ))}
    </div>
  );
}

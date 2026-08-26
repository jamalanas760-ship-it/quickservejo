import { useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { humanError } from "@/lib/errors";
import { removeRestaurantImage, uploadRestaurantImage, type MediaKind } from "@/lib/storage";
import { cn } from "@/lib/utils";

export function ImageUploader({
  restaurantId,
  kind,
  value,
  onChange,
  label,
  aspect = "square",
}: {
  restaurantId: string;
  kind: MediaKind;
  value: string | null;
  onChange: (url: string | null) => void;
  label: string;
  aspect?: "square" | "wide";
}) {
  const { t, lang } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      const url = await uploadRestaurantImage(restaurantId, kind, file);
      onChange(url);
    } catch (error) {
      toast.error(humanError(error, lang));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{label}</p>
      <div
        className={cn(
          "flex items-center justify-center overflow-hidden rounded-lg border border-dashed bg-muted/40",
          aspect === "square" ? "size-24" : "h-24 w-full",
        )}
      >
        {value ? (
          <img src={value} alt={label} className="size-full object-cover" loading="lazy" />
        ) : (
          <span className="px-2 text-center text-xs text-muted-foreground">{t("common.none")}</span>
        )}
      </div>
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? t("common.uploading") : value ? t("common.replace") : t("common.upload")}
        </Button>
        {value ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => {
              void removeRestaurantImage(value);
              onChange(null);
            }}
          >
            {t("common.remove")}
          </Button>
        ) : null}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        className="hidden"
        onChange={(e) => void handleFile(e.target.files?.[0])}
      />
    </div>
  );
}

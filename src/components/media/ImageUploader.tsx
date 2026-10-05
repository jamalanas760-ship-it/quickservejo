import { useRef, useState } from "react";
import { toast } from "sonner";

import { ActionMenu } from "@/components/app/ActionMenu";
import { ImagePlus, Trash2 } from "lucide-react";
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
  retainRemovedFile = false,
}: {
  restaurantId: string;
  kind: MediaKind;
  value: string | null;
  onChange: (url: string | null) => void;
  label: string;
  aspect?: "square" | "wide";
  retainRemovedFile?: boolean;
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
    <div className="qs-image-uploader space-y-2">
      <p className="text-sm font-medium">{label}</p>
      <div data-aspect={aspect} className="qs-image-upload-frame">
        <div
          className={cn(
            "flex items-center justify-center overflow-hidden rounded-xl border bg-muted/40",
            aspect === "square" ? "size-24 shrink-0" : "h-36 min-w-0 flex-1",
          )}
        >
          {value ? (
            <img src={value} alt={label} className="size-full object-cover" loading="lazy" />
          ) : (
            <span className="px-2 text-center text-sm text-muted-foreground">
              {t("common.none")}
            </span>
          )}
        </div>
        <ActionMenu
          className="qs-image-upload-actions"
          ar={lang === "ar"}
          label={`${label}: ${lang === "ar" ? "الخيارات" : "options"}`}
          actions={[
            {
              label: busy
                ? t("common.uploading")
                : value
                  ? t("common.replace")
                  : t("common.upload"),
              icon: ImagePlus,
              disabled: busy,
              onSelect: () => inputRef.current?.click(),
            },
            {
              label: t("common.remove"),
              icon: Trash2,
              hidden: !value,
              disabled: busy,
              destructive: true,
              separatorBefore: true,
              onSelect: () => {
                if (!retainRemovedFile) void removeRestaurantImage(value!);
                onChange(null);
              },
            },
          ]}
        />
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

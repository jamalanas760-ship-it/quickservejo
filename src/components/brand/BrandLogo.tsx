import markAsset from "@/assets/quickserve-mark.png.asset.json";
import { cn } from "@/lib/utils";

type Props = {
  /** Tailwind height class for the mark, e.g. "size-8". */
  className?: string;
  /** Wordmark accent color class (defaults to accent). */
  accentClassName?: string;
  /** Hide the wordmark and show only the Q mark. */
  markOnly?: boolean;
  textClassName?: string;
};

/** QuickServe brand lockup: Q mark plus wordmark. */
export function BrandLogo({
  className,
  accentClassName = "text-accent",
  markOnly = false,
  textClassName,
}: Props) {
  return (
    <span className="inline-flex items-center gap-2">
      <img
        src={markAsset.url}
        alt="QuickServe"
        className={cn("h-8 w-auto object-contain", className)}
      />
      {markOnly ? null : (
        <span className={cn("font-display text-lg font-bold leading-none", textClassName)}>
          Quick<span className={accentClassName}>Serve</span>
        </span>
      )}
    </span>
  );
}

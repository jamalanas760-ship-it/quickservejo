import { useState } from "react";
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
  const [failed, setFailed] = useState(false);
  return (
    <span className="inline-flex items-center gap-2">
      {failed ? (
        <svg
          viewBox="0 0 64 64"
          role="img"
          aria-label="QuickServe"
          className={cn("h-8 w-auto text-accent", className)}
        >
          <circle cx="30" cy="29" r="17" fill="none" stroke="currentColor" strokeWidth="6" />
          <path
            d="M37 37L51 51"
            fill="none"
            stroke="currentColor"
            strokeWidth="6"
            strokeLinecap="round"
          />
        </svg>
      ) : (
        <img
          onError={() => setFailed(true)}
          src={markAsset.url}
          alt="QuickServe"
          className={cn("h-8 w-auto object-contain", className)}
        />
      )}
      {markOnly ? null : (
        <span className={cn("font-display text-lg font-bold leading-none", textClassName)}>
          Quick<span className={accentClassName}>Serve</span>
        </span>
      )}
    </span>
  );
}

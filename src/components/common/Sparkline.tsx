import { useId } from "react";

import { cn } from "@/lib/utils";

/**
 * Tiny inline trend strip used on metric cards. Pure SVG, no chart library, so
 * it stays crisp at card size on phones.
 */
export function Sparkline({
  values,
  className,
  tone = "primary",
}: {
  values: number[];
  className?: string;
  tone?: "primary" | "accent" | "success";
}) {
  const id = useId().replace(/:/g, "");
  const points = values.length >= 2 ? values : [0, 0];
  const max = Math.max(...points);
  const min = Math.min(...points);
  const span = max - min || 1;
  const width = 100;
  const height = 36;

  const coords = points.map((v, i) => {
    const x = (i / (points.length - 1)) * width;
    const y = height - ((v - min) / span) * (height - 6) - 3;
    return [x, y] as const;
  });

  const line = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`).join(" ");
  const area = `${line} L${width} ${height} L0 ${height} Z`;

  const stroke =
    tone === "success"
      ? "var(--color-success)"
      : tone === "accent"
        ? "var(--color-accent)"
        : "var(--color-primary)";

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      aria-hidden
      className={cn("h-9 w-full", className)}
    >
      <defs>
        <linearGradient id={`sp-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.28" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#sp-${id})`} />
      <path
        d={line}
        fill="none"
        stroke={stroke}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

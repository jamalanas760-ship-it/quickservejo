import { memo, useId } from "react";
import { floorSeats } from "@/lib/floor-seating";

/** Flat top-down artwork; matches the existing table footprint and seat layout. */
export const TablePlanSymbol = memo(function TablePlanSymbol({
  shape,
  material = "wood",
  seats = 4,
  number,
  selected = false,
  centerpiece = true,
}: {
  shape: "round" | "square" | "rectangle";
  material?: string;
  seats?: number;
  number?: number | string;
  selected?: boolean;
  centerpiece?: boolean;
}) {
  const id = useId().replace(/:/g, "");
  const palette =
    material === "glass"
      ? ["#e1f1ef", "#b5d5d2", "#799c98"]
      : material === "aluminum"
        ? ["#edf0ed", "#b9c2be", "#74827b"]
        : material === "marble"
          ? ["#faf8ef", "#e2ded2", "#a29c8c"]
          : material === "neutral"
            ? ["#e4e0d6", "#c9c4b8", "#928c7e"]
            : ["#ead8b6", "#d1b587", "#94734e"];
  const width = shape === "rectangle" ? 94.4 : shape === "round" ? 73.6 : 64;
  const height = shape === "round" ? 73.6 : 64;
  return (
    <svg viewBox="0 0 176 160" className="qs-table-plan-symbol h-full w-full" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-top`} x2="0" y2="1">
          <stop stopColor={palette[0]} />
          <stop offset="1" stopColor={palette[1]} />
        </linearGradient>
        <linearGradient id={`${id}-chair`} x2="0" y2="1">
          <stop stopColor={material === "wood" ? "#d89554" : "#99a487"} />
          <stop offset="1" stopColor={material === "wood" ? "#a55c2f" : "#62735c"} />
        </linearGradient>
        <pattern id={`${id}-grain`} width="80" height="10" patternUnits="userSpaceOnUse">
          <path
            d="M-5 3Q20 0 42 3T85 3M-5 8Q20 5 42 8T85 8"
            fill="none"
            stroke={palette[2]}
            strokeWidth=".65"
            opacity=".16"
          />
        </pattern>
        <clipPath id={`${id}-clip`}>
          {shape === "round" ? (
            <circle cx="88" cy="80" r="36.8" />
          ) : (
            <rect
              x={88 - width / 2}
              y={80 - height / 2}
              width={width}
              height={height}
              rx={shape === "square" ? 6 : 5}
            />
          )}
        </clipPath>
      </defs>
      {floorSeats(shape, seats).map((seat, index) => (
        <g
          key={index}
          transform={`translate(${88 + seat.x * 80} ${80 + seat.y * 80}) rotate(${(-seat.rotation * 180) / Math.PI})`}
        >
          <rect
            x="-18"
            y="-16"
            width="36"
            height="32"
            rx="10"
            fill={`url(#${id}-chair)`}
            stroke={material === "wood" ? "#8a4c29" : "#52624c"}
            strokeWidth="1.2"
          />
          <rect
            x="-14"
            y="-11"
            width="28"
            height="23"
            rx="8"
            fill={material === "wood" ? "#d48d4c" : "#8f9e7d"}
            stroke="#ffffff"
            strokeOpacity=".25"
          />
          <path d="M-13-10Q0-16 13-10" fill="none" stroke="#ffffff" strokeOpacity=".4" />
        </g>
      ))}
      <g clipPath={`url(#${id}-clip)`}>
        <rect
          x={88 - width / 2}
          y={80 - height / 2}
          width={width}
          height={height}
          fill={`url(#${id}-top)`}
        />
        {material === "wood" && (
          <rect
            x={88 - width / 2}
            y={80 - height / 2}
            width={width}
            height={height}
            fill={`url(#${id}-grain)`}
          />
        )}
      </g>
      {shape === "round" ? (
        <circle
          cx="88"
          cy="80"
          r="36.8"
          fill="none"
          stroke={selected ? "#f2551d" : palette[2]}
          strokeWidth={selected ? 2.5 : 1.5}
        />
      ) : (
        <rect
          x={88 - width / 2}
          y={80 - height / 2}
          width={width}
          height={height}
          rx={shape === "square" ? 6 : 5}
          fill="none"
          stroke={selected ? "#f2551d" : palette[2]}
          strokeWidth={selected ? 2.5 : 1.5}
        />
      )}
      {number !== undefined ? (
        <g>
          <circle cx="88" cy="80" r="12" fill="#fffdf4" stroke="#c7bb9e" strokeWidth=".5" />
          <text x="88" y="84" textAnchor="middle" fontSize="12" fontWeight="700" fill="#263b2c">
            {number}
          </text>
        </g>
      ) : centerpiece ? (
        <g transform="translate(88 80)">
          <circle r="6" fill="#71874f" />
          <path d="M-4-4L4 4M-4 4L4-4" stroke="#b7c694" strokeWidth="2" />
        </g>
      ) : null}
    </svg>
  );
});

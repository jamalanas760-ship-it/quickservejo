import type { FloorElementType } from "@/lib/floor-plan-elements";

/** Architectural plan symbols: scalable artwork, with the same front as the 3D model. */
export function FloorPlanSymbol({ type }: { type: FloorElementType }) {
  const plant = type === "plant" || type === "tree" || type === "planter";
  return (
    <svg
      className="qs-plan-symbol"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
      fill="#e5ded2"
      stroke="#807665"
      strokeWidth="2"
      strokeLinejoin="round"
    >
      {plant ? (
        <>
          <circle cx="50" cy="50" r="45" fill="#dbe5ca" stroke="#819c6e" />
          {Array.from({ length: 8 }, (_, i) => (
            <ellipse
              key={i}
              cx="50"
              cy="30"
              rx="12"
              ry="24"
              transform={`rotate(${i * 45} 50 50)`}
              fill={i % 2 ? "#94b57d" : "#b5cd9b"}
              stroke="#769267"
            />
          ))}
          <circle cx="50" cy="50" r="10" fill="#c7d8ad" />
        </>
      ) : type === "door" ? (
        <>
          <path d="M5 95V5H12V88H95V95Z" fill="#a88a64" />
          <path d="M12 88V12M12 12A76 76 0 0 1 88 88" fill="none" strokeDasharray="4 3" />
          <path d="M12 88V12" stroke="#755c40" strokeWidth="5" />
        </>
      ) : type === "wall" || type === "partition" ? (
        <>
          <rect x="1" y="1" width="98" height="98" fill="#bcb7ae" />
          {[0, 20, 40, 60, 80].map((x) => (
            <path key={x} d={`M${x} 100L${x + 20} 0`} stroke="#dedbd3" />
          ))}
        </>
      ) : type === "window" ? (
        <>
          <rect x="1" y="1" width="98" height="98" fill="#dceaf0" stroke="#7998a4" />
          <path d="M4 25H96M4 75H96M33 4V96M67 4V96" stroke="#94adb5" />
        </>
      ) : type === "stool" ? (
        <>
          <circle cx="50" cy="50" r="43" fill="#d6ba96" />
          <circle cx="50" cy="50" r="33" fill="#e8d2b2" />
        </>
      ) : type === "chair" || type === "sofa" || type === "bench" ? (
        <>
          <rect x="5" y="8" width="90" height="85" rx="12" fill="#bfae9e" />
          <rect x="15" y="24" width="70" height="62" rx="8" fill="#e6d7c7" />
          <rect x="8" y="6" width="84" height="20" rx="6" fill="#d4c1af" />
          <rect x="3" y="24" width="12" height="65" rx="5" />
          <rect x="85" y="24" width="12" height="65" rx="5" />
          {type === "sofa" && <path d="M38 29V82M62 29V82" stroke="#bba794" />}
        </>
      ) : type === "toilet" ? (
        <>
          <rect x="18" y="5" width="64" height="28" rx="5" fill="#f4f5f0" />
          <ellipse cx="50" cy="60" rx="31" ry="34" fill="#fafbf8" />
          <ellipse cx="50" cy="60" rx="20" ry="25" fill="#dbe9e9" />
          <circle cx="66" cy="17" r="3" />
        </>
      ) : type === "kitchen" ? (
        <>
          <rect x="2" y="2" width="96" height="96" rx="4" fill="#dce1df" />
          <rect x="9" y="10" width="40" height="80" rx="5" fill="#f2f3ed" />
          {[28, 72].map((y) => (
            <g key={y}>
              <circle cx="29" cy={y} r="13" fill="#687873" />
              <circle cx="29" cy={y} r="7" fill="none" stroke="#a8b7b0" />
            </g>
          ))}
          <rect x="58" y="18" width="31" height="63" rx="8" fill="#aebcbb" />
          <rect x="63" y="24" width="21" height="49" rx="6" fill="#dfe8e6" />
          <path d="M74 12V32" stroke="#6f8382" strokeWidth="4" />
        </>
      ) : (
        <>
          <rect x="2" y="2" width="96" height="96" rx="5" fill="#c4a17a" />
          <rect x="7" y="8" width="86" height="78" rx="3" fill="#e4ccb0" />
          <path d="M10 30H90M10 58H90M10 82H90" stroke="#c8aa88" strokeWidth="1" />
          {type === "bar" && (
            <>
              <circle cx="24" cy="44" r="10" fill="#f8eee0" />
              <circle cx="50" cy="44" r="10" fill="#f8eee0" />
              <circle cx="76" cy="44" r="10" fill="#f8eee0" />
            </>
          )}
          <path d="M4 93H96" stroke="#8c7050" strokeWidth="5" />
        </>
      )}
    </svg>
  );
}

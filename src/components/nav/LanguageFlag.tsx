/** Vector flags remain visible on platforms that render emoji as country codes. */
export function LanguageFlag({ language }: { language: "en" | "ar" }) {
  return (
    <svg
      viewBox="0 0 30 20"
      width="26"
      height="18"
      className="shrink-0 overflow-hidden rounded-[3px] border border-border"
      aria-hidden="true"
      focusable="false"
    >
      {language === "en" ? (
        <>
          <rect width="30" height="20" fill="#fff" />
          {Array.from({ length: 7 }, (_, i) => (
            <rect key={i} y={(i * 40) / 13} width="30" height={20 / 13} fill="#b22234" />
          ))}
          <rect width="12" height={140 / 13} fill="#3c3b6e" />
          {Array.from({ length: 9 }, (_, row) =>
            Array.from({ length: row % 2 ? 5 : 6 }, (_, col) => (
              <circle
                key={`${row}-${col}`}
                cx={1 + col * 2 + (row % 2 ? 1 : 0)}
                cy={0.65 + row * 1.18}
                r=".36"
                fill="#fff"
              />
            )),
          )}
        </>
      ) : (
        <>
          <rect width="30" height="20" fill="#fff" />
          <rect width="30" height={20 / 3} fill="#111" />
          <rect y={40 / 3} width="30" height={20 / 3} fill="#007a3d" />
          <path d="M0 0L15 10L0 20Z" fill="#ce1126" />
          <polygon
            points={Array.from({ length: 14 }, (_, i) => {
              const angle = -Math.PI / 2 + (i * Math.PI) / 7,
                r = i % 2 ? 1.05 : 2.3;
              return `${5.5 + Math.cos(angle) * r},${10 + Math.sin(angle) * r}`;
            }).join(" ")}
            fill="#fff"
          />
        </>
      )}
    </svg>
  );
}

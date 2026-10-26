import { useEffect, useId, useRef } from "react";
import { dialArc, dialPoint, serviceFlow, servingWidth } from "@/lib/service-dial-geometry";

const SEGMENTS = [
  { start: 1, end: 58, color: "#c45e32" },
  { start: 61, end: 118, color: "#b6812a" },
  { start: 121, end: 178, color: "#26977d" },
  { start: 181, end: 238, color: "#237f70" },
  { start: 241, end: 298, color: "#ba8c3d" },
  { start: 301, end: 358, color: "#c37440" },
];
const ROWS = Array.from({ length: 66 }, (_, i) => ({ y: 208 + i * 3.2, i }));
const DOTS = Array.from({ length: 28 }, (_, i) => serviceFlow((i + 1) / 29));

/** The Service Dial: Anime.js timelines with SVG, matching the supplied motion reference. */
export function LaunchScene() {
  const host = useRef<HTMLDivElement>(null);
  const uid = useId().replace(/:/g, "");
  useEffect(() => {
    const element = host.current;
    if (!element || element.closest("#qs-boot")) return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } })
      .connection;
    const disabled = () =>
      media.matches ||
      connection?.saveData ||
      document.documentElement.dataset.qsNavigationMotion === "reduced";
    let cancelled = false,
      starting = false;
    let release = () => {};
    const stop = () => {
      const dispose = release;
      release = () => {};
      dispose();
      element.dataset.motion = "false";
    };
    const start = async () => {
      if (cancelled || disabled() || starting || element.dataset.motion === "true") return;
      starting = true;
      try {
        const { createTimeline, stagger } = await import("animejs");
        if (cancelled || disabled()) return;
        const all = <T extends Element>(selector: string) =>
          Array.from(element.querySelectorAll<T>(selector));
        const outer = all<SVGGElement>(".qs-dial-outer"),
          inner = all<SVGGElement>(".qs-dial-inner"),
          ticks = all<SVGLineElement>(".qs-dial-tick"),
          bars = all<SVGLineElement>(".qs-dial-bar"),
          dots = all<SVGCircleElement>(".qs-dial-dot"),
          steam = all<SVGPathElement>(".qs-dial-steam path");
        const timeline = createTimeline({ autoplay: false });
        let frame = 0,
          alive = true,
          lastPaint = 0,
          hiddenAt: number | null = null;
        let began = performance.now();
        release = () => {
          alive = false;
          cancelAnimationFrame(frame);
          document.removeEventListener("visibilitychange", visibility);
          timeline.revert();
          dots.forEach((dot, i) => {
            dot.setAttribute("cx", String(DOTS[i].x));
            dot.setAttribute("cy", String(DOTS[i].y));
            dot.setAttribute("r", "3.5");
          });
        };
        timeline
          .add(outer, { rotate: [-36, 78], opacity: [0.2, 1], duration: 1100, ease: "out(4)" }, 0)
          .add(outer, { rotate: 218, duration: 2300, ease: "inOut(2)" }, 1100)
          .add(inner, { rotate: [34, -92], duration: 3400, ease: "inOut(2)" }, 0)
          .add(
            ticks,
            {
              opacity: [0.08, 0.75],
              delay: stagger(5, { from: "center" }),
              duration: 700,
              ease: "out(3)",
            },
            0,
          );
        bars.forEach((bar, i) => {
          const y = ROWS[i].y,
            wave = 34 + Math.pow(Math.sin(i * 0.13), 2) * 116,
            width = servingWidth(y);
          timeline.add(
            bar,
            {
              x1: [320 - wave, 320 - width],
              x2: [320 + wave, 320 + width],
              opacity: [0.22, width > 0 ? 0.9 : 0.06],
              duration: 1450,
              ease: "inOut(3)",
            },
            380 + i * 8,
          );
        });
        steam.forEach((path, i) => {
          const length = path.getTotalLength();
          path.style.strokeDasharray = String(length);
          timeline
            .add(
              path,
              { strokeDashoffset: [length, 0], opacity: [0, 0.6], duration: 800, ease: "out(3)" },
              1750 + i * 110,
            )
            .add(path, { y: -12, opacity: 0.18, duration: 700, ease: "inOut(2)" }, 2600 + i * 50);
        });
        timeline.add(
          all<SVGGElement>(".qs-dial-cutlery"),
          { opacity: [0, 0.65], scale: [0.88, 1], duration: 650, ease: "out(3)" },
          1900,
        );
        const paint = (stamp: number) => {
          if (!alive) return;
          if (stamp - lastPaint < 1000 / 30) {
            frame = requestAnimationFrame(paint);
            return;
          }
          lastPaint = stamp;
          const elapsed = Math.min(3400, Math.max(0, performance.now() - began));
          timeline.seek(elapsed, true);
          dots.forEach((dot, i) => {
            const travel = (i / 28 + elapsed / 6500) % 1,
              point = serviceFlow(travel);
            dot.setAttribute("cx", point.x.toFixed(2));
            dot.setAttribute("cy", point.y.toFixed(2));
            dot.setAttribute("r", String(2.4 + Math.sin(travel * Math.PI) * 1.6));
          });
          element.dataset.motion = "true";
          element.dataset.phase = elapsed < 1900 ? "forming" : "serving";
          if (elapsed < 3400) frame = requestAnimationFrame(paint);
        };
        function visibility() {
          cancelAnimationFrame(frame);
          if (document.hidden) hiddenAt = performance.now();
          else {
            if (hiddenAt !== null) {
              began += performance.now() - hiddenAt;
              hiddenAt = null;
            }
            frame = requestAnimationFrame(paint);
          }
        }
        document.addEventListener("visibilitychange", visibility);
        visibility();
      } catch {
        stop();
      } finally {
        starting = false;
      }
    };
    const update = () => {
      if (disabled()) stop();
      else void start();
    };
    const preferences = new MutationObserver(update);
    preferences.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-qs-navigation-motion"],
    });
    media.addEventListener("change", update);
    void start();
    return () => {
      cancelled = true;
      preferences.disconnect();
      media.removeEventListener("change", update);
      stop();
    };
  }, []);
  return (
    <div ref={host} className="qs-dial-stage" aria-hidden="true">
      <svg className="qs-service-dial" viewBox="0 0 640 640" focusable="false">
        <defs>
          <filter id={`${uid}-glow`} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="3" />
          </filter>
          <linearGradient
            id={`${uid}-dish`}
            gradientUnits="userSpaceOnUse"
            x1="172"
            y1="210"
            x2="468"
            y2="405"
          >
            <stop stopColor="#a94d28" />
            <stop offset=".5" stopColor="#c87832" />
            <stop offset="1" stopColor="#a9512c" />
          </linearGradient>
          <radialGradient id={`${uid}-core`}>
            <stop stopColor="#d97e3b" stopOpacity=".065" />
            <stop offset="1" stopColor="#d97e3b" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx="320" cy="320" r="240" fill={`url(#${uid}-core)`} />
        {[266, 254, 224, 216, 203].map((r, i) => (
          <circle
            key={r}
            cx="320"
            cy="320"
            r={r}
            fill="none"
            stroke={i === 0 ? "#d8d5c9" : "#e3e1d7"}
            strokeWidth={i === 0 ? 1.5 : 1}
          />
        ))}
        <g className="qs-dial-outer" style={{ transformOrigin: "320px 320px" }}>
          <g filter={`url(#${uid}-glow)`} opacity=".25">
            {SEGMENTS.map((s) => (
              <path
                key={s.start}
                d={dialArc(263, s.start, s.end)}
                fill="none"
                stroke={s.color}
                strokeWidth="7"
              />
            ))}
          </g>
          {SEGMENTS.map((s) => (
            <path
              key={s.start}
              d={dialArc(263, s.start, s.end)}
              fill="none"
              stroke={s.color}
              strokeWidth="2.5"
            />
          ))}
        </g>
        <g>
          {Array.from({ length: 120 }, (_, i) => {
            const a = dialPoint(i % 5 === 0 ? 231 : 237, i * 3),
              b = dialPoint(246, i * 3);
            return (
              <line
                className="qs-dial-tick"
                key={i}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={i < 40 ? "#c9794f" : i < 80 ? "#b59b6b" : "#5da690"}
                strokeWidth={i % 5 === 0 ? 1.5 : 1}
                opacity=".65"
              />
            );
          })}
        </g>
        <g
          className="qs-dial-inner"
          style={{ transformOrigin: "320px 320px" }}
          fill="none"
          strokeLinecap="round"
        >
          <path d={dialArc(208, 12, 94)} stroke="#947151" strokeWidth="10" opacity=".22" />
          {[186, 192, 198].map((r, i) => (
            <path
              key={r}
              d={dialArc(r, 125 + i * 3, 186 + i * 3)}
              stroke="#c99b78"
              strokeWidth="1"
              opacity={0.35 + i * 0.15}
            />
          ))}
          <path d={dialArc(208, 216, 282)} stroke="#4f8c7b" strokeWidth="2" opacity=".4" />
        </g>
        <g stroke={`url(#${uid}-dish)`} strokeWidth="1.65" strokeLinecap="round">
          {ROWS.map(({ y, i }) => (
            <line
              className="qs-dial-bar"
              key={i}
              x1={320 - servingWidth(y)}
              y1={y}
              x2={320 + servingWidth(y)}
              y2={y}
              opacity={servingWidth(y) > 0 ? 0.85 : 0.06}
            />
          ))}
        </g>
        <g
          className="qs-dial-cutlery"
          fill="none"
          stroke="#66786e"
          strokeWidth="2"
          opacity=".65"
          style={{ transformOrigin: "320px 320px" }}
        >
          <path d="M161 275V305Q171 321 181 305V275M171 275V361M151 275V305Q151 320 171 320M171 320Q191 320 191 305V275M171 361V410" />
          <path d="M478 410V275Q459 290 461 338H478" />
        </g>
        <g
          className="qs-dial-steam"
          fill="none"
          stroke="#8a7054"
          strokeWidth="1.5"
          strokeLinecap="round"
          opacity=".65"
        >
          <path d="M290 215C274 202 303 193 289 175" />
          <path d="M320 207C305 194 334 185 320 167" />
          <path d="M350 215C334 202 363 193 349 175" />
        </g>
        <g fill="#ab682f">
          {DOTS.map((p, i) => (
            <circle
              key={i}
              className="qs-dial-dot"
              cx={p.x}
              cy={p.y}
              r="3.5"
              opacity={0.3 + (i / 28) * 0.6}
            />
          ))}
        </g>
        <circle cx="320" cy="65" r="2.2" fill="#af7d39" />
        <circle cx="320" cy="575" r="2.2" fill="#258974" />
      </svg>
    </div>
  );
}

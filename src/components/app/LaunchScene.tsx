import { useEffect, useRef } from "react";

/** A minimal indicator stays visible until the optional WebGL scene has rendered. */
export function LaunchScene() {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = host.current;
    if (!element || element.closest("#qs-boot")) return;
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const connection = (
      navigator as Navigator & { connection?: EventTarget & { saveData?: boolean } }
    ).connection;
    let disposed = false;
    let generation = 0;
    let cleanup: (() => void) | undefined;
    const update = () => {
      const current = ++generation;
      cleanup?.();
      cleanup = undefined;
      element.dataset.motion = "false";
      element.classList.remove("is-rendered");
      if (
        disposed ||
        media.matches ||
        connection?.saveData ||
        document.documentElement.dataset.qsNavigationMotion === "reduced"
      )
        return;
      void import("./chrome-service-scene")
        .then(({ mountChromeService }) => {
          if (disposed || current !== generation) return;
          cleanup = mountChromeService(element);
        })
        .catch(() => {
          /* The loading indicator remains available. */
        });
    };
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-qs-navigation-motion"],
    });
    media.addEventListener("change", update);
    connection?.addEventListener?.("change", update);
    update();
    return () => {
      disposed = true;
      generation++;
      cleanup?.();
      observer.disconnect();
      media.removeEventListener("change", update);
      connection?.removeEventListener?.("change", update);
    };
  }, []);
  return (
    <div ref={host} className="qs-chrome-stage" aria-hidden="true">
      <div className="qs-chrome-fallback">
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}

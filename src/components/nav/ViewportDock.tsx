import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { TenantBrandShell } from "@/components/tenant/TenantBrandShell";

/** Keep fixed navigation outside transformed route and resume-animation layers. */
export function ViewportDock({ children, dir }: { children: ReactNode; dir: "ltr" | "rtl" }) {
  const [mounted, setMounted] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setMounted(true);
  }, []);
  useEffect(() => {
    if (!mounted) return;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const viewport = window.visualViewport;
        const el = host.current;
        if (!el) return;
        // The browser's visible viewport can shrink independently of the page on iOS.
        const keyboard = Boolean(document.activeElement?.matches("input,textarea,[contenteditable=true]")) && window.innerHeight - (viewport?.height ?? window.innerHeight) > 150;
        el.style.top = `${viewport?.offsetTop ?? 0}px`;
        el.style.height = `${viewport?.height ?? window.innerHeight}px`;
        el.style.visibility = keyboard ? "hidden" : "visible";
        const dock = el.querySelector(".qs-mobile-bottom-nav");
        document.documentElement.style.setProperty("--qs-mobile-dock-height", `${dock?.getBoundingClientRect().height ?? 90}px`);
      });
    };
    update();
    const observer = new ResizeObserver(update);
    const dock = host.current?.querySelector(".qs-mobile-bottom-nav");
    if (dock) observer.observe(dock);
    window.addEventListener("resize", update);
    window.visualViewport?.addEventListener("resize", update);
    window.visualViewport?.addEventListener("scroll", update);
    document.addEventListener("focusin", update);
    document.addEventListener("focusout", update);
    return () => {
      cancelAnimationFrame(frame); observer.disconnect();
      window.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("scroll", update);
      document.removeEventListener("focusin", update); document.removeEventListener("focusout", update);
      document.documentElement.style.removeProperty("--qs-mobile-dock-height");
    };
  }, [mounted]);
  if (!mounted) return null;
  return createPortal(
    <div ref={host} className="qs-nav-portal" dir={dir}>
      <TenantBrandShell>{children}</TenantBrandShell>
    </div>,
    document.body,
  );
}

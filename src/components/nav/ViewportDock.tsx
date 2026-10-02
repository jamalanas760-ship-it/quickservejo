import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { TenantBrandShell } from "@/components/tenant/TenantBrandShell";

/** Keep fixed navigation outside transformed route and resume-animation layers. */
export function ViewportDock({ children, dir }: { children: ReactNode; dir: "ltr" | "rtl" }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  if (!mounted) return null;
  return createPortal(
    <div className="qs-nav-portal" dir={dir}>
      <TenantBrandShell>{children}</TenantBrandShell>
    </div>,
    document.body,
  );
}

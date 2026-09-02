import React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { isMenuThemeBridgeMessage } from "@/lib/menu-theme-bridge";
import type { MenuTheme } from "@/lib/menu-theme";

export const Route = createFileRoute("/r/$slug")({ component: DinerMenuPage });

function DinerMenuPage() {
  // Compile-safe route while the retired AI menu designer is removed.
  const [theme, setTheme] = React.useState<MenuTheme | null>(null);
  React.useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (isMenuThemeBridgeMessage(event.data)) setTheme(event.data.theme);
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);
  return <main style={{ minHeight: "100vh", background: theme?.background ?? "#fff" }} />;
}

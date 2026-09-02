import { createFileRoute } from "@tanstack/react-router";
import { isMenuThemeBridgeMessage } from "@/lib/menu-theme-bridge";
import type { MenuTheme } from "@/lib/menu-theme";

export const Route = createFileRoute("/r/$slug")({ component: DinerMenuPage });

function DinerMenuPage() {
  // Temporary compile-safe route shell while the retired menu implementation is removed.
  // Keeping the theme bridge import unique prevents the duplicate-declaration blank screen.
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

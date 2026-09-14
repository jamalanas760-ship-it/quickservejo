import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const KEY = "quickserve-theme";

type Theme = "light" | "dark";

function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.style.colorScheme = theme;
}

export function ThemeToggle({ compact = false, className }: { compact?: boolean; className?: string }) {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const stored = window.localStorage.getItem(KEY) as Theme | null;
    const initial: Theme = stored === "dark" || stored === "light"
      ? stored
      : window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
    setTheme(initial);
    applyTheme(initial);
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    window.localStorage.setItem(KEY, next);
    applyTheme(next);
  }

  const dark = theme === "dark";
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      aria-pressed={dark}
      className={cn(
        "inline-flex h-10 items-center gap-2 rounded-xl px-2 text-sm font-semibold text-muted-foreground transition hover:bg-muted hover:text-foreground",
        className,
      )}
    >
      {dark ? <Moon className="size-[18px]" /> : <Sun className="size-[18px]" />}
      <span className="relative h-6 w-11 rounded-full bg-muted shadow-inner transition-colors data-[dark=true]:bg-[#ff5a0a]" data-dark={dark}>
        <span className={cn("absolute top-1 size-4 rounded-full bg-white shadow transition-transform", dark ? "translate-x-6" : "translate-x-1")} />
      </span>
      {!compact ? <span className="hidden xl:inline">{dark ? "Dark" : "Light"}</span> : null}
    </button>
  );
}

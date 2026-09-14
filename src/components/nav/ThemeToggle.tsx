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
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(KEY) as Theme | null;
    const initial: Theme = stored === "dark" || stored === "light"
      ? stored
      : window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
    setTheme(initial);
    applyTheme(initial);
    setReady(true);
  }, []);

  function choose(next: Theme) {
    if (next === theme) return;
    setTheme(next);
    window.localStorage.setItem(KEY, next);
    applyTheme(next);
  }

  return (
    <div
      className={cn(
        "inline-grid h-10 grid-cols-2 items-center rounded-xl border border-border bg-muted/60 p-1 shadow-inner",
        compact ? "w-[78px]" : "w-[148px]",
        !ready && "opacity-80",
        className,
      )}
      role="group"
      aria-label="Color theme"
    >
      <button
        type="button"
        onClick={() => choose("light")}
        aria-label="Use light mode"
        aria-pressed={theme === "light"}
        className={cn(
          "inline-flex h-8 items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-bold transition-all duration-200",
          theme === "light"
            ? "bg-white text-slate-950 shadow-sm ring-1 ring-black/5"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <Sun className="size-4" />
        {!compact ? <span>Light</span> : null}
      </button>
      <button
        type="button"
        onClick={() => choose("dark")}
        aria-label="Use dark mode"
        aria-pressed={theme === "dark"}
        className={cn(
          "inline-flex h-8 items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-bold transition-all duration-200",
          theme === "dark"
            ? "bg-slate-950 text-white shadow-sm ring-1 ring-white/10"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <Moon className="size-4" />
        {!compact ? <span>Dark</span> : null}
      </button>
    </div>
  );
}

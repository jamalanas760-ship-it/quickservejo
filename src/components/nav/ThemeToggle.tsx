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
        "inline-grid shrink-0 grid-cols-2 items-center overflow-hidden rounded-full border border-border/90 bg-muted/70 p-[3px] shadow-inner",
        compact ? "h-9 w-[78px]" : "h-10 w-[146px]",
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
          "inline-flex min-w-0 items-center justify-center gap-1.5 rounded-full font-bold leading-none transition-[background-color,color,box-shadow,transform] duration-200",
          compact ? "h-[30px] px-0" : "h-8 px-2 text-xs",
          theme === "light"
            ? "bg-background text-foreground shadow-sm ring-1 ring-black/5"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <Sun className={cn("shrink-0", compact ? "size-[17px]" : "size-4")} />
        {!compact ? <span>Light</span> : null}
      </button>
      <button
        type="button"
        onClick={() => choose("dark")}
        aria-label="Use dark mode"
        aria-pressed={theme === "dark"}
        className={cn(
          "inline-flex min-w-0 items-center justify-center gap-1.5 rounded-full font-bold leading-none transition-[background-color,color,box-shadow,transform] duration-200",
          compact ? "h-[30px] px-0" : "h-8 px-2 text-xs",
          theme === "dark"
            ? "bg-slate-950 text-white shadow-sm ring-1 ring-white/10"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <Moon className={cn("shrink-0", compact ? "size-[16px]" : "size-4")} />
        {!compact ? <span>Dark</span> : null}
      </button>
    </div>
  );
}

import { Moon, Sun } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { cn } from "@/lib/utils";

const KEY = "quickserve-theme";
const EVENT = "quickserve:theme-change";
const TRANSITION_CLASS = "qs-theme-transitioning";
type Theme = "light" | "dark";

function preferredTheme(): Theme {
  if (typeof window === "undefined") return "light";
  const stored = window.localStorage.getItem(KEY) as Theme | null;
  if (stored === "dark" || stored === "light") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
}

type ViewTransitionDocument = Document & {
  startViewTransition?: (update: () => void) => { finished: Promise<void> };
};

export function ThemeToggle({ compact = false, className }: { compact?: boolean; className?: string }) {
  const [theme, setTheme] = useState<Theme>("light");
  const [ready, setReady] = useState(false);
  const themeRef = useRef<Theme>("light");

  useEffect(() => {
    const initial = preferredTheme();
    themeRef.current = initial;
    setTheme(initial);
    applyTheme(initial);
    setReady(true);

    const sync = (next: Theme) => {
      if (next === themeRef.current) return;
      themeRef.current = next;
      setTheme(next);
      applyTheme(next);
    };

    const onStorage = (event: StorageEvent) => {
      if (event.key !== KEY) return;
      const next = event.newValue;
      if (next === "dark" || next === "light") sync(next);
    };
    const onThemeEvent = (event: Event) => {
      const next = (event as CustomEvent<Theme>).detail;
      if (next === "dark" || next === "light") sync(next);
    };

    window.addEventListener("storage", onStorage);
    window.addEventListener(EVENT, onThemeEvent);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(EVENT, onThemeEvent);
      document.documentElement.classList.remove(TRANSITION_CLASS);
    };
  }, []);

  function choose(next: Theme) {
    if (next === themeRef.current) return;
    themeRef.current = next;
    window.localStorage.setItem(KEY, next);

    const root = document.documentElement;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const doc = document as ViewTransitionDocument;
    const commit = () => {
      flushSync(() => setTheme(next));
      applyTheme(next);
    };

    if (!reduceMotion && typeof doc.startViewTransition === "function") {
      root.classList.remove(TRANSITION_CLASS);
      root.classList.add("qs-theme-view-transition");
      const transition = doc.startViewTransition(commit);
      void transition.finished.finally(() => root.classList.remove("qs-theme-view-transition"));
    } else {
      // Unsupported browsers switch atomically. A synchronous change is much
      // better than painting the header, cards and canvas in separate phases.
      root.classList.add(TRANSITION_CLASS);
      commit();
      requestAnimationFrame(() => root.classList.remove(TRANSITION_CLASS));
    }

    window.dispatchEvent(new CustomEvent<Theme>(EVENT, { detail: next }));
  }

  if (compact) {
    return (
      <div
        className={cn(
          "qs-theme-toggle qs-theme-toggle-compact",
          !ready && "is-loading",
          className,
        )}
        data-theme={theme}
        role="group"
        aria-label="Color theme"
      >
        <span className="qs-theme-toggle-thumb" aria-hidden="true" />
        <button
          type="button"
          onClick={() => choose("light")}
          aria-label="Use light mode"
          aria-pressed={theme === "light"}
          className={cn("qs-theme-toggle-option", theme === "light" && "is-active")}
        >
          <Sun className="size-4 shrink-0" strokeWidth={2} />
        </button>
        <button
          type="button"
          onClick={() => choose("dark")}
          aria-label="Use dark mode"
          aria-pressed={theme === "dark"}
          className={cn("qs-theme-toggle-option", theme === "dark" && "is-active")}
        >
          <Moon className="size-4 shrink-0" strokeWidth={2} />
        </button>
      </div>
    );
  }

  const buttonBase = "inline-flex h-full w-full min-w-0 items-center justify-center gap-1.5 rounded-full font-bold leading-none transition-[background-color,color,box-shadow] duration-200";

  return (
    <div
      className={cn(
        "inline-grid h-10 w-[150px] shrink-0 grid-cols-2 items-stretch rounded-full border border-border/90 bg-muted/70 p-1",
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
          buttonBase,
          "px-2 text-xs",
          theme === "light" ? "bg-background text-foreground shadow-sm ring-1 ring-black/5" : "text-muted-foreground hover:text-foreground",
        )}
      >
        <Sun className="size-4 shrink-0" />
        <span>Light</span>
      </button>
      <button
        type="button"
        onClick={() => choose("dark")}
        aria-label="Use dark mode"
        aria-pressed={theme === "dark"}
        className={cn(
          buttonBase,
          "px-2 text-xs",
          theme === "dark" ? "bg-slate-950 text-white shadow-sm ring-1 ring-white/10" : "text-muted-foreground hover:text-foreground",
        )}
      >
        <Moon className="size-4 shrink-0" />
        <span>Dark</span>
      </button>
    </div>
  );
}

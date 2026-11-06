import { useEffect, useState } from "react";

export type Theme = "light" | "dark";
const STORAGE_KEY = "theme";

function systemTheme(): Theme {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function getStoredTheme(): Theme | null {
  if (typeof window === "undefined") return null;
  const v = window.localStorage.getItem(STORAGE_KEY);
  return v === "light" || v === "dark" ? v : null;
}

export function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
}

// Inline script string, injected before hydration, so the page never flashes the wrong theme.
export const themeBootScript = `(function(){try{var t=localStorage.getItem('${STORAGE_KEY}');if(!t){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}if(t==='dark')document.documentElement.classList.add('dark')}catch(e){}})();`;

/** Per-user light/dark preference, persisted in localStorage and applied as the .dark class. */
export function useTheme() {
  // Always starts as "light" — matching what the server renders, since the server can't see
  // localStorage — then syncs to the real value right after mount (themeBootScript has already
  // applied the correct .dark class before this ever paints, so there's no visible flash either way).
  const [theme, setThemeState] = useState<Theme>("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); setThemeState(getStoredTheme() ?? systemTheme()); }, []);
  useEffect(() => { if (mounted) applyTheme(theme); }, [theme, mounted]);

  function setTheme(next: Theme) {
    setThemeState(next);
    try { window.localStorage.setItem(STORAGE_KEY, next); } catch { /* storage unavailable — theme still applies for this session */ }
  }

  return { theme, setTheme, toggle: () => setTheme(theme === "dark" ? "light" : "dark") };
}

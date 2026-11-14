import { useTranslation } from "react-i18next";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

/** Light/dark mode toggle; preference is per-browser (localStorage), applied instantly via the .dark class. */
export function ThemeToggle({ className }: { className?: string }) {
  const {t}=useTranslation();
  const { theme, toggle } = useTheme();
  const dark = theme === "dark";
  return (
    <button type="button" onClick={toggle} aria-label={dark ? t("theme.light",{defaultValue:"Switch to light mode"}) : t("theme.dark",{defaultValue:"Switch to dark mode"})} title={dark ? t("theme.light",{defaultValue:"Switch to light mode"}) : t("theme.dark",{defaultValue:"Switch to dark mode"})}
      className={cn("inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground hover:text-foreground", className)}>
      {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}

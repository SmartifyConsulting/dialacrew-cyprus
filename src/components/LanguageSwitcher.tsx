import { Globe } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SUPPORTED_LANGUAGES, normalizeLanguage, languageDirection } from "@/i18n/languages";
import { cn } from "@/lib/utils";

export function LanguageSwitcher({ className }: { className?: string }) {
  const { i18n, t } = useTranslation();
  const code = normalizeLanguage(i18n.language);
  return (
    <Select value={code} onValueChange={(value) => { void i18n.changeLanguage(normalizeLanguage(value)); }} dir={languageDirection(code)}>
      <SelectTrigger aria-label={t("common.changeLanguage")} className={cn("w-40 max-w-full gap-2", className)}>
        <Globe aria-hidden="true" className="h-4 w-4 shrink-0" /><SelectValue />
      </SelectTrigger>
      <SelectContent>
        {SUPPORTED_LANGUAGES.map((language) => (
          <SelectItem key={language.code} value={language.code}><span lang={language.code} dir="auto">{language.name}</span></SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
import { Globe } from "lucide-react";
import { useState } from "react";
import { useSession } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "react-i18next";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SUPPORTED_LANGUAGES, normalizeLanguage, languageDirection } from "@/i18n/languages";
import { cn } from "@/lib/utils";

export function LanguageSwitcher({ className }: { className?: string }) {
  const { i18n, t } = useTranslation();
  const { session } = useSession();
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const pick = async (value: string) => {
    const language = normalizeLanguage(value);
    await i18n.changeLanguage(language);
    setFailed(false);
    if (!session) return;
    setSaving(true);
    try {
      const { data, error } = await supabase.from("profiles").update({ preferred_language: language }).eq("id", session.user.id).select("id");
      setFailed(!!error || !data?.length);
    } catch { setFailed(true); } finally { setSaving(false); }
  };
  const code = normalizeLanguage(i18n.language);
  return (
    <div><Select disabled={saving} value={code} onValueChange={(value) => { void pick(value); }} dir={languageDirection(code)}>
      <SelectTrigger aria-label={t("common.changeLanguage")} className={cn("w-40 max-w-full gap-2", className)}>
        <Globe aria-hidden="true" className="h-4 w-4 shrink-0" /><SelectValue />
      </SelectTrigger>
      <SelectContent>
        {SUPPORTED_LANGUAGES.map((language) => (
          <SelectItem key={language.code} value={language.code}><span lang={language.code} dir="auto">{language.name}</span></SelectItem>
        ))}
      </SelectContent>
    </Select>{failed && <p role="status" className="mt-1 text-xs text-muted-foreground">{t("common.languageDeviceOnly", "Language saved on this device. Account preference could not be saved.")}</p>}</div>
  );
}

import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/auth";
import { normalizeLanguage, SUPPORTED_LANGUAGES } from "./languages";

export function AccountLanguage() {
  const { session } = useSession();
  const { i18n } = useTranslation();
  const revision = useRef(0);
  useEffect(() => {
    const changed = () => { revision.current += 1; };
    i18n.on("languageChanged", changed);
    return () => { i18n.off("languageChanged", changed); };
  }, [i18n]);
  useEffect(() => {
    const userId = session?.user.id;
    if (!userId) return;
    let cancelled = false;
    const initialRevision = revision.current;
    void supabase.from("profiles").select("preferred_language").eq("id", userId).maybeSingle().then(({ data, error }) => {
      if (cancelled || error || revision.current !== initialRevision) return;
      if (SUPPORTED_LANGUAGES.some((language) => language.code === data?.preferred_language)) {
        void i18n.changeLanguage(normalizeLanguage(data?.preferred_language));
      }
    });
    return () => { cancelled = true; };
  }, [session?.user.id, i18n]);
  return null;
}

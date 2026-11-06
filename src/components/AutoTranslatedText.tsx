import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useSession } from "@/lib/auth";
import { translateContent } from "@/lib/translation.functions";
import { normalizeLanguage } from "@/i18n/languages";

export function AutoTranslatedText({ text }: { text: string }) {
  const { i18n, t } = useTranslation();
  const { session } = useSession();
  const language = normalizeLanguage(i18n.language);
  const [originalKey, setOriginalKey] = useState<string | null>(null);
  const identity = JSON.stringify([text, language]);
  const original = originalKey === identity;
  const translation = useQuery({
    queryKey: ["content-translation", session?.user.id, language, text],
    enabled: !!session && !!text.trim() && !original,
    staleTime: 3600000,
    gcTime: 3600000,
    retry: false,
    queryFn: () => translateContent({ data: { text, language }, headers: { Authorization: `Bearer ${session!.access_token}` } }),
  });
  return <span className="block">
    <span dir="auto" className="whitespace-pre-wrap">{original ? text : translation.data ?? text}</span>
    {translation.data && translation.data !== text && <button type="button" className="mt-1 block text-xs underline" onClick={() => setOriginalKey(original ? null : identity)}>
      {original ? t("content.showTranslation", "Show translation") : t("content.showOriginal", "Machine translated · Show original")}
    </button>}
    {translation.isError && <span className="mt-1 block text-xs">{t("content.unavailable", "Translation unavailable · Showing original")}</span>}
  </span>;
}

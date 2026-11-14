import { useTranslation } from "react-i18next";
import english from "@/i18n/locales/en.json";
/** Static interface copy only; names, stored values and user content stay unchanged. */
export function UiText({ k }: { k: string }) {
  const { t } = useTranslation();
  const source = k
    .split(".")
    .reduce<unknown>(
      (value, key) =>
        value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined,
      english,
    );
  return <>{t(k, { defaultValue: typeof source === "string" ? source : k })}</>;
}

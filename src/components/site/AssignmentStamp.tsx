import { useTranslation } from "react-i18next";
type AssignmentMeta = { assigned_by_name?: string | null; assigned_to_name?: string | null; assigned_at?: string | null };

/** Only display server-recorded assignment details; never infer them from creation. */
export function AssignmentStamp({ value }: { value: object }) {
  const { t, i18n } = useTranslation();
  const meta = value as AssignmentMeta;
  if (!meta.assigned_at || !meta.assigned_by_name) return null;
  const date = new Date(meta.assigned_at);
  if (Number.isNaN(date.getTime())) return null;
  const when = date.toLocaleString(i18n.language, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", timeZoneName: "short" });
  return <span className="mt-1 block text-[11px] font-normal leading-snug text-muted-foreground">
    {meta.assigned_to_name ? t("continuation.assigned", { by:meta.assigned_by_name, to:meta.assigned_to_name }) : t("continuation.unassigned", { by:meta.assigned_by_name })} · {when}
  </span>;
}

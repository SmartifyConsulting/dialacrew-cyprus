export function validationFieldName(field: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement): string {
  const explicit = field.getAttribute("aria-label");
  if (explicit) return explicit;
  const label = field.labels?.[0]?.cloneNode(true) as HTMLElement | undefined;
  label?.querySelectorAll("input,select,textarea,button,datalist").forEach(node => node.remove());
  return label?.textContent?.replace(/\*/g, "").replace(/\s+/g, " ").trim() || field.getAttribute("placeholder") || field.name || "This field";
}

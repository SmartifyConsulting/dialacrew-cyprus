import { useEffect, useId, useRef, useState, type SelectHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";

export function SearchableSelect({ children, className, value, defaultValue, onChange, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  const [mobile, setMobile] = useState(false);
  useEffect(() => { const media = window.matchMedia("(pointer: coarse)"); const update = () => setMobile(media.matches); update(); media.addEventListener("change", update); return () => media.removeEventListener("change", update); }, []);
  const native = useRef<HTMLSelectElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const id = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<{ value: string; text: string; disabled: boolean }[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  useEffect(() => {
    if (!native.current) return;
    setOptions(Array.from(native.current.options).map((option) => ({ value: option.value, text: option.textContent ?? option.value, disabled: option.disabled || !!(option.parentElement instanceof HTMLOptGroupElement && option.parentElement.disabled) })));
    setSelected(Array.from(native.current.selectedOptions).map((option) => option.value));
  }, [children, value, defaultValue]);
  const filtered = options.filter((option) => option.text.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  const label = options.filter((option) => selected.includes(option.value)).map((option) => option.text).join(", ");
  function pick(next: string) {
    if (!native.current) return;
    if (props.multiple) {
      for (const option of native.current.options) if (option.value === next) option.selected = !option.selected;
    } else native.current.value = next;
    native.current.dispatchEvent(new Event("change", { bubbles: true }));
    setSelected(Array.from(native.current.selectedOptions).map((option) => option.value));
    setQuery("");
    if (!props.multiple) setOpen(false);
  }
  if (!mobile) return <select {...props} ref={native} className={className} value={value} defaultValue={defaultValue} onChange={onChange}>{children}</select>;
  return <Popover open={open} onOpenChange={(next) => { setOpen(next); if (!next) setQuery(""); }}>
    <PopoverAnchor asChild><div className={`relative min-w-0 ${className ?? "rounded border border-input bg-background px-3 py-2 text-sm"}`}>
      <input ref={field} id={props.id} role="combobox" aria-expanded={open} aria-controls={id} aria-autocomplete="list" aria-label={props["aria-label"]} aria-required={props.required} disabled={props.disabled} autoComplete="off" placeholder={label || "Type to search…"} value={open ? query : label} className={`w-full border-0 bg-transparent pr-6 outline-none`} onFocus={() => setOpen(true)} onChange={(event) => { setQuery(event.target.value); setOpen(true); }} onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); if (event.key === "Enter") { event.preventDefault(); const first = filtered.find((option) => !option.disabled); if (first) pick(first.value); } if (event.key === "ArrowDown") { event.preventDefault(); setOpen(true); document.getElementById(id)?.querySelector<HTMLButtonElement>("button:not([disabled])")?.focus(); } }} />
      <button type="button" tabIndex={-1} aria-label="Show choices" disabled={props.disabled} className="absolute inset-y-0 right-1 px-1 text-muted-foreground" onClick={() => { setOpen(!open); if (!open) field.current?.focus(); }}><ChevronDown className="h-4 w-4" /></button>
      <select {...props} id={undefined} aria-label={undefined} aria-hidden="true" tabIndex={-1} ref={native} value={value} defaultValue={defaultValue} onChange={onChange} className="sr-only" onInvalid={(event) => { event.preventDefault(); setOpen(true); field.current?.focus(); }}>{children}</select>
    </div></PopoverAnchor>
    <PopoverContent align="start" className="z-[200] max-h-72 w-[min(24rem,90vw)] overflow-y-auto p-1" onInteractOutside={(event) => { if (event.target === field.current) event.preventDefault(); }} onOpenAutoFocus={(event) => event.preventDefault()} onCloseAutoFocus={(event) => event.preventDefault()}>
      <div id={id} role="listbox" aria-multiselectable={props.multiple || undefined}>
        {filtered.map((option, index) => <button key={`${option.value}:${index}`} type="button" role="option" aria-selected={selected.includes(option.value)} disabled={option.disabled} onClick={() => pick(option.value)} className={`block w-full rounded px-3 py-2 text-left text-sm hover:bg-muted focus:bg-muted disabled:opacity-40 ${selected.includes(option.value) ? "font-semibold text-primary" : ""}`}>{option.text}</button>)}
        {!filtered.length && <p className="p-3 text-sm text-muted-foreground">No matching choices</p>}
      </div>
    </PopoverContent>
  </Popover>;
}

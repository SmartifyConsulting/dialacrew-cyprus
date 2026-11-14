import { useRef, useState, type InputHTMLAttributes } from "react";
import { CalendarDays } from "lucide-react";
import { format, isValid } from "date-fns";
import { el, enUS } from "date-fns/locale";
import { useTranslation } from "react-i18next";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
export function DateInput({ className, value, defaultValue, onChange, ...props }: InputHTMLAttributes<HTMLInputElement>) {
 const input=useRef<HTMLInputElement>(null);const [open,setOpen]=useState(false);const {i18n}=useTranslation();
 const raw=String(value ?? input.current?.value ?? defaultValue ?? "");const candidate=raw ? new Date(raw+"T00:00:00") : undefined;const selected=candidate && isValid(candidate) ? candidate : undefined;
 function choose(day:Date|undefined){if(!day || !input.current)return;const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")?.set;setter?.call(input.current,format(day,"yyyy-MM-dd"));input.current.dispatchEvent(new Event("input",{bubbles:true}));input.current.dispatchEvent(new Event("change",{bubbles:true}));setOpen(false);}
 const year=new Date().getFullYear();
 return <Popover open={open} onOpenChange={setOpen}><div className={"relative inline-flex min-w-0 items-center "+(className ?? "rounded border border-input bg-background px-3 py-2 text-sm")}>
 <input {...props} ref={input} type="date" value={value} defaultValue={defaultValue} onChange={onChange} className="min-w-0 w-full border-0 bg-transparent pr-6 outline-none [&::-webkit-calendar-picker-indicator]:hidden" />
 <PopoverTrigger asChild><button type="button" disabled={props.disabled || props.readOnly} aria-label={(i18n?.language ?? "en").startsWith("el") ? "Άνοιγμα ημερολογίου" : "Open calendar"} className="absolute inset-y-0 right-1 px-1 text-muted-foreground"><CalendarDays className="h-4 w-4" /></button></PopoverTrigger>
 </div><PopoverContent className="z-[200] w-auto p-0" align="start"><Calendar mode="single" captionLayout="dropdown" locale={(i18n?.language ?? "en").startsWith("el") ? el : enUS} selected={selected} {...(selected ? {defaultMonth:selected} : {})} startMonth={new Date(year-120,0)} endMonth={new Date(year+10,11)} onSelect={choose} disabled={day=>(props.min ? format(day,"yyyy-MM-dd")<String(props.min) : false)||(props.max ? format(day,"yyyy-MM-dd")>String(props.max) : false)} /></PopoverContent></Popover>;
}



import { useRef, useState, type ChangeEvent, type InputHTMLAttributes } from "react";
import { CalendarDays } from "lucide-react";
import { format, isValid } from "date-fns";
import { el, enUS } from "date-fns/locale";
import { useTranslation } from "react-i18next";
import { Calendar, CalendarDayButton } from "@/components/ui/calendar";
import { Popover, PopoverAnchor, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { displayDate, parseDateEntry } from "@/lib/date-time-entry";

export function DateInput({
  className,
  value,
  defaultValue,
  onChange,
  name,
  min,
  max,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  const saved = useRef<HTMLInputElement>(null);
  const visible = useRef<HTMLInputElement>(null);
  const [local, setLocal] = useState(String(defaultValue ?? ""));
  const [draft, setDraft] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const { i18n } = useTranslation();
  const raw = String(value ?? local);
  const candidate = raw ? new Date(raw + "T00:00:00") : undefined;
  const selected = candidate && isValid(candidate) ? candidate : undefined;
  const greek = (i18n?.language ?? "en").startsWith("el");
  const bounded = (iso: string) =>
    !iso || ((!min || iso >= String(min)) && (!max || iso <= String(max)));
  function commit(iso: string, event?: ChangeEvent<HTMLInputElement>) {
    setLocal(iso);
    visible.current?.setCustomValidity("");
    if (saved.current) {
      saved.current.value = iso;
      onChange?.({
        ...event,
        target: saved.current,
        currentTarget: saved.current,
      } as ChangeEvent<HTMLInputElement>);
    }
  }
  function choose(day: Date | undefined) {
    if (!day) return;
    const iso = format(day, "yyyy-MM-dd");
    if (!bounded(iso)) return;
    commit(iso);
    setDraft(null);
    setOpen(false);
  }
  const year = new Date().getFullYear();
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div
          className={
            "relative inline-flex min-w-0 items-center " +
            (className ?? "rounded border border-input bg-background px-3 py-2 text-sm")
          }
        >
          <input type="hidden" ref={saved} name={name} value={raw} disabled={props.disabled} />
          <input
            {...props}
            ref={visible}
            min={undefined}
            max={undefined}
            type="text"
            value={draft ?? displayDate(raw, greek ? "el" : "en")}
            placeholder={props.placeholder ?? "dd-MMM-yy"}
            autoComplete="off"
            onChange={(event) => {
              const text = event.target.value;
              setDraft(text);
              const iso = parseDateEntry(text);
              event.target.setCustomValidity(
                iso === null
                  ? greek
                    ? "Εισαγάγετε έγκυρη ημερομηνία"
                    : "Enter a valid date, e.g. 14-Nov-26"
                  : !bounded(iso)
                    ? greek
                      ? "Η ημερομηνία είναι εκτός ορίων"
                      : "Date is outside the allowed range"
                    : "",
              );
              if (iso !== null && bounded(iso)) commit(iso, event);
            }}
            onBlur={(event) => {
              if (event.target.validity.valid) setDraft(null);
              props.onBlur?.(event);
            }}
            className="min-w-0 w-full border-0 bg-transparent pr-6 outline-none"
          />
          <PopoverTrigger asChild>
            <button
              type="button"
              disabled={props.disabled || props.readOnly}
              aria-label={greek ? "Άνοιγμα ημερολογίου" : "Open calendar"}
              className="absolute inset-y-0 right-1 px-1 text-muted-foreground"
            >
              <CalendarDays className="h-4 w-4" />
            </button>
          </PopoverTrigger>
        </div>
      </PopoverAnchor>
      <PopoverContent className="z-[200] w-auto p-0" align="start">
        <Calendar
          mode="single"
          captionLayout="dropdown"
          weekStartsOn={0}
          locale={greek ? el : enUS}
          selected={selected}
          {...(selected ? { defaultMonth: selected } : {})}
          startMonth={new Date(year - 120, 0)}
          endMonth={new Date(year + 10, 11)}
          onSelect={choose}
          formatters={{
            formatMonthDropdown: (date) => format(date, "MMMM", { locale: greek ? el : enUS }),
            formatWeekdayName: (date) => format(date, "EEEEE", { locale: greek ? el : enUS }),
          }}
          classNames={{
            dropdown_root: "relative border-0",
            today: "text-primary rounded-full",
            month: "flex w-full flex-col gap-2",
            week: "mt-1 flex w-full",
          }}
          components={{
            DayButton: (props) => (
              <CalendarDayButton
                {...props}
                className="!rounded-full data-[selected-single=true]:!rounded-full data-[selected-single=true]:bg-emerald-500 data-[selected-single=true]:text-white"
              />
            ),
          }}
          disabled={(day) => !bounded(format(day, "yyyy-MM-dd"))}
        />
        <div className="border-t px-3 py-2 text-right">
          <button
            type="button"
            disabled={!bounded(format(new Date(), "yyyy-MM-dd"))}
            onClick={() => choose(new Date())}
            className="text-xs text-primary disabled:opacity-40"
          >
            {greek ? "Σήμερα" : "Today"}
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

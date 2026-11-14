import {
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type InputHTMLAttributes,
} from "react";
import { ChevronDown } from "lucide-react";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { displayTime, parseTimeEntry } from "@/lib/date-time-entry";
import { DateInput } from "./date-input";

export function TimeInput({
  value,
  defaultValue,
  onChange,
  name,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  const saved = useRef<HTMLInputElement>(null);
  const visible = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const id = useId();
  const [local, setLocal] = useState(String(defaultValue ?? ""));
  const raw = String(value ?? local).slice(0, 5);
  const [draft, setDraft] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const options = Array.from(
    { length: 48 },
    (_, index) => `${String(Math.floor(index / 2)).padStart(2, "0")}:${index % 2 ? "30" : "00"}`,
  );
  if (raw && parseTimeEntry(raw) !== null && !options.includes(raw)) options.push(raw);
  options.sort();
  const bounded = (time: string) =>
    !time ||
    ((!props.min || time >= String(props.min)) && (!props.max || time <= String(props.max)));
  useEffect(() => {
    if (open)
      list.current
        ?.querySelector(`[data-index="${active}"]`)
        ?.scrollIntoView?.({ block: "nearest" });
  }, [open, active]);
  function commit(time: string, event?: ChangeEvent<HTMLInputElement>) {
    setLocal(time);
    visible.current?.setCustomValidity("");
    if (saved.current) {
      saved.current.value = time;
      onChange?.({
        ...event,
        target: saved.current,
        currentTarget: saved.current,
      } as ChangeEvent<HTMLInputElement>);
    }
  }
  function choose(time: string) {
    if (!bounded(time)) return;
    commit(time);
    setDraft(null);
    setOpen(false);
    visible.current?.focus();
  }
  function show() {
    if (props.disabled || props.readOnly) return;
    const current = raw || `${String(new Date().getHours()).padStart(2, "0")}:00`;
    const next = options.findIndex((time) => time >= current);
    setActive(next < 0 ? 0 : next);
    setOpen(true);
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div
          className={
            "relative inline-flex min-w-0 items-center " +
            (className ?? "rounded border border-input bg-background px-3 py-2 text-sm")
          }
        >
          <input type="hidden" name={name} ref={saved} value={raw} disabled={props.disabled} />
          <input
            {...props}
            ref={visible}
            type="text"
            role="combobox"
            aria-autocomplete="none"
            aria-expanded={open}
            aria-controls={id}
            aria-activedescendant={open ? `${id}-${active}` : undefined}
            autoComplete="off"
            value={draft ?? displayTime(raw)}
            placeholder={props.placeholder ?? "Select time"}
            className="w-full min-w-0 border-0 bg-transparent pr-6 outline-none"
            onChange={(event) => {
              setDraft(event.target.value);
              const time = parseTimeEntry(event.target.value);
              event.target.setCustomValidity(
                time === null
                  ? "Enter a valid time, e.g. 8:30 PM"
                  : !bounded(time)
                    ? "Time is outside the allowed range"
                    : "",
              );
              if (time !== null && bounded(time)) {
                commit(time, event);
                if (time) {
                  setActive([...new Set([...options, time])].sort().indexOf(time));
                  setOpen(true);
                }
              }
            }}
            onBlur={(event) => {
              if (event.target.validity.valid) setDraft(null);
              props.onBlur?.(event);
            }}
            onKeyDown={(event) => {
              props.onKeyDown?.(event);
              if (event.defaultPrevented || props.disabled || props.readOnly) return;
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                if (!open) show();
                else
                  setActive(
                    (index) =>
                      (index + (event.key === "ArrowDown" ? 1 : -1) + options.length) %
                      options.length,
                  );
              } else if (event.key === "Enter" && open) {
                event.preventDefault();
                choose(options[active]!);
              } else if (event.key === "Escape") {
                setOpen(false);
              } else if (event.key === "Tab") {
                setOpen(false);
              }
            }}
          />
          <button
            type="button"
            disabled={props.disabled || props.readOnly}
            aria-label={`Show times${props["aria-label"] ? ` for ${props["aria-label"]}` : ""}`}
            className="absolute inset-y-0 right-0 border-l px-2 text-muted-foreground"
            onClick={() => (open ? setOpen(false) : show())}
          >
            <ChevronDown className="h-4 w-4" />
          </button>
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        className="z-[200] w-[var(--radix-popover-trigger-width,10rem)] min-w-32 p-0"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          list.current
            ?.querySelector(`[data-index="${active}"]`)
            ?.scrollIntoView?.({ block: "start" });
        }}
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <div
          ref={list}
          id={id}
          role="listbox"
          aria-label="Times"
          className="max-h-52 overflow-y-auto py-1"
        >
          {options.map((time, index) => (
            <button
              key={time}
              id={`${id}-${index}`}
              data-index={index}
              role="option"
              aria-selected={raw === time}
              disabled={!bounded(time)}
              type="button"
              tabIndex={-1}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(time)}
              className={`block w-full px-3 py-2 text-left text-sm hover:bg-emerald-100 hover:text-emerald-950 disabled:opacity-40 ${index === active ? "bg-emerald-100 text-emerald-950" : ""}`}
            >
              {displayTime(time)}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function DateTimeInput({
  value,
  defaultValue,
  onChange,
  name,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  const saved = useRef<HTMLInputElement>(null);
  const [local, setLocal] = useState(String(defaultValue ?? ""));
  const raw = String(value ?? local);
  const date = raw.slice(0, 10);
  const time = raw.slice(11, 16);
  const [datePart, setDatePart] = useState(date);
  const [timePart, setTimePart] = useState(time);
  useEffect(() => {
    setDatePart(date);
    setTimePart(time);
  }, [date, time]);
  function commit(nextDate: string, nextTime: string, event: ChangeEvent<HTMLInputElement>) {
    setDatePart(nextDate);
    setTimePart(nextTime);
    const next = nextDate && nextTime ? `${nextDate}T${nextTime}` : "";
    setLocal(next);
    if (saved.current) {
      saved.current.value = next;
      onChange?.({ ...event, target: saved.current, currentTarget: saved.current });
    }
  }
  const label = props["aria-label"] ?? "Date and time";
  return (
    <div className="flex min-w-0 gap-2">
      <input ref={saved} type="hidden" name={name} value={raw} disabled={props.disabled} />
      <DateInput
        {...props}
        aria-label={`${label} date`}
        value={datePart}
        min={String(props.min ?? "").slice(0, 10) || undefined}
        max={String(props.max ?? "").slice(0, 10) || undefined}
        className={className}
        onChange={(event) => commit(event.target.value, timePart, event)}
      />
      <TimeInput
        {...props}
        id={props.id ? `${props.id}-time` : undefined}
        aria-label={`${label} time`}
        min={
          datePart === String(props.min ?? "").slice(0, 10)
            ? String(props.min).slice(11, 16)
            : undefined
        }
        max={
          datePart === String(props.max ?? "").slice(0, 10)
            ? String(props.max).slice(11, 16)
            : undefined
        }
        value={timePart}
        className={className}
        onChange={(event) => commit(datePart, event.target.value, event)}
      />
    </div>
  );
}

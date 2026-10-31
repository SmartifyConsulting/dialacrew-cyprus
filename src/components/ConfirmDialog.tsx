import { useEffect, useState } from "react";

// A styled, in-app replacement for window.confirm / window.prompt, whose native browser chrome
// ("An embedded page at ... says") looks broken and untrustworthy inside the app. Call confirmDialog()
// / promptDialog() exactly like the native versions — they return a Promise instead of blocking.
// <ConfirmDialogHost /> is mounted once at the app root; it falls back to the native dialog if that
// host isn't mounted yet (e.g. very early in boot), so callers never need a null check.

type ConfirmOptions = { title?: string; confirmLabel?: string; cancelLabel?: string; destructive?: boolean };
type PromptOptions = { title?: string; confirmLabel?: string; cancelLabel?: string; defaultValue?: string; placeholder?: string };

type DialogState =
  | { kind: "confirm"; message: string; options: ConfirmOptions; resolve: (v: boolean) => void }
  | { kind: "prompt"; message: string; options: PromptOptions; resolve: (v: string | null) => void }
  | null;

let pushState: ((s: DialogState) => void) | null = null;

export function confirmDialog(message: string, options: ConfirmOptions = {}): Promise<boolean> {
  return new Promise((resolve) => {
    if (!pushState) { resolve(window.confirm(message)); return; }
    pushState({ kind: "confirm", message, options, resolve });
  });
}

export function promptDialog(message: string, defaultValueOrOptions?: string | PromptOptions): Promise<string | null> {
  const options: PromptOptions = typeof defaultValueOrOptions === "string" ? { defaultValue: defaultValueOrOptions } : (defaultValueOrOptions ?? {});
  return new Promise((resolve) => {
    if (!pushState) { resolve(window.prompt(message, options.defaultValue)); return; }
    pushState({ kind: "prompt", message, options, resolve });
  });
}

export function ConfirmDialogHost() {
  const [state, setLocalState] = useState<DialogState>(null);
  const [value, setValue] = useState("");

  useEffect(() => {
    pushState = (s) => { setLocalState(s); setValue(s && s.kind === "prompt" ? (s.options.defaultValue ?? "") : ""); };
    return () => { pushState = null; };
  }, []);

  if (!state) return null;
  const isPrompt = state.kind === "prompt";

  function close(result: boolean | string | null) {
    state!.resolve(result as never);
    setLocalState(null);
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-sm rounded-lg border border-border bg-card p-5 shadow-xl">
        {state.options.title && <h2 className="mb-1.5 font-display text-sm font-semibold text-foreground">{state.options.title}</h2>}
        <p className="whitespace-pre-wrap text-sm text-foreground">{state.message}</p>
        {isPrompt && (
          <input
            autoFocus
            className="mt-3 w-full rounded-sm border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring"
            placeholder={(state.options as PromptOptions).placeholder}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") close(value); if (e.key === "Escape") close(null); }}
          />
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button autoFocus={!isPrompt} onClick={() => close(isPrompt ? null : false)} className="rounded-sm border border-border px-3 py-2 text-xs font-semibold hover:bg-muted">
            {state.options.cancelLabel ?? "Cancel"}
          </button>
          <button
            onClick={() => close(isPrompt ? value : true)}
            className={`rounded-sm px-3 py-2 text-xs font-semibold text-white ${!isPrompt && (state.options as ConfirmOptions).destructive ? "bg-destructive hover:bg-destructive/90" : "bg-primary hover:bg-primary/90"}`}
          >
            {state.options.confirmLabel ?? "OK"}
          </button>
        </div>
      </div>
    </div>
  );
}

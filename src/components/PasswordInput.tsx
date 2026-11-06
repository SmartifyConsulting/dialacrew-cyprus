import { useState, forwardRef, type InputHTMLAttributes } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useTranslation } from "react-i18next";

export const PasswordInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function PasswordInput(props, ref) {
  const [show, setShow] = useState(false);
  const { t } = useTranslation();
  return (
    <div className="relative">
      <input
        ref={ref}
        {...props}
        type={show ? "text" : "password"}
        className="w-full rounded-sm border border-input bg-background px-3 py-2 pe-10 text-foreground outline-none focus:border-primary"
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setShow((s) => !s)}
        aria-label={show ? t("auth.hidePassword") : t("auth.showPassword")}
        className="absolute inset-y-0 end-0 grid w-10 place-items-center text-muted-foreground hover:text-foreground"
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
});

export const fieldClass = "w-full rounded-sm border border-input bg-background px-3 py-2 text-foreground outline-none focus:border-primary";
export const labelClass = "mb-1 block font-display text-xs font-semibold text-muted-foreground";
export const submitClass = "w-full rounded-sm bg-primary px-6 py-3 font-display text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50";

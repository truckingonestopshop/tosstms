import { forwardRef } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/format";

export const inputBase =
  "w-full rounded-lg border border-line-strong bg-surface px-3 text-sm text-fg placeholder:text-fg-4 transition-colors hover:border-fg-4/60 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25 disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-fg-3";

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { prefix?: string; suffix?: string }>(
  function Input({ className, prefix, suffix, ...rest }, ref) {
    if (prefix || suffix) {
      return (
        <div className="relative">
          {prefix && <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-fg-3">{prefix}</span>}
          <input ref={ref} className={cn(inputBase, "h-9", prefix && "pl-7", suffix && "pr-10", className)} {...rest} />
          {suffix && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-fg-3">{suffix}</span>}
        </div>
      );
    }
    return <input ref={ref} className={cn(inputBase, "h-9", className)} {...rest} />;
  },
);

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, rows = 3, ...rest },
  ref,
) {
  return <textarea ref={ref} rows={rows} className={cn(inputBase, "py-2 leading-relaxed", className)} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, children, ...rest },
  ref,
) {
  return (
    <div className="relative">
      <select ref={ref} className={cn(inputBase, "h-9 appearance-none pr-8", className)} {...rest}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-3" />
    </div>
  );
});

export function Field({
  label,
  hint,
  error,
  className,
  children,
  required,
  action,
}: {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: string | null;
  className?: string;
  children: React.ReactNode;
  required?: boolean;
  /** A link on the label's right (e.g. "Edit list"), kept outside the <label> so it doesn't steal clicks. */
  action?: React.ReactNode;
}) {
  if (action) {
    return (
      <div className={cn("block min-w-0", className)}>
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <span className="flex items-center gap-1 text-xs font-semibold text-fg-2">
            {label}
            {required && <span className="text-brand">*</span>}
          </span>
          {action}
        </div>
        <label className="block">{children}</label>
        {error ? <span className="mt-1 block text-xs text-red-600 dark:text-red-400">{error}</span> : hint ? <span className="mt-1 block text-xs text-fg-3">{hint}</span> : null}
      </div>
    );
  }
  return (
    <label className={cn("block min-w-0", className)}>
      {label && (
        <span className="mb-1.5 flex items-center gap-1 text-xs font-semibold text-fg-2">
          {label}
          {required && <span className="text-brand">*</span>}
        </span>
      )}
      {children}
      {error ? <span className="mt-1 block text-xs text-red-600 dark:text-red-400">{error}</span> : hint ? <span className="mt-1 block text-xs text-fg-3">{hint}</span> : null}
    </label>
  );
}

export function Checkbox({
  checked,
  onChange,
  label,
  className,
  indeterminate,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: React.ReactNode;
  className?: string;
  indeterminate?: boolean;
}) {
  return (
    <label className={cn("inline-flex cursor-pointer items-center gap-2 text-sm text-fg-2", className)} onClick={(e) => e.stopPropagation()}>
      <input
        type="checkbox"
        checked={checked}
        ref={(el) => {
          if (el) el.indeterminate = !!indeterminate && !checked;
        }}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 cursor-pointer rounded border-line-strong accent-[#f28c38]"
      />
      {label}
    </label>
  );
}

/** Segmented control (two to five options). */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  size = "md",
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: React.ReactNode }[];
  className?: string;
  size?: "sm" | "md";
}) {
  return (
    <div className={cn("inline-flex rounded-lg border border-line bg-surface-2 p-0.5", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "inline-flex items-center gap-1.5 whitespace-nowrap rounded-md font-medium transition-colors",
            size === "sm" ? "h-7 px-2.5 text-xs" : "h-8 px-3 text-[13px]",
            value === o.value ? "bg-surface text-fg shadow-sm ring-1 ring-line" : "text-fg-3 hover:text-fg",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

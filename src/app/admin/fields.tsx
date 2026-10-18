// Labelled form fields for the admin forms (server- and client-safe: no state, no hooks).
import { errorText, field, fieldError, hint as hintCls, label as labelCls } from "./styles";

interface Base {
  name: string;
  label: string;
  error?: string;
  hint?: React.ReactNode;
}

function Wrap({ name, label, error, hint, children }: Base & { children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={name} className={labelCls}>
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${name}-error`} className={errorText}>
          {error}
        </p>
      ) : hint ? (
        <p className={hintCls}>{hint}</p>
      ) : null}
    </div>
  );
}

const a11y = (name: string, error?: string) => (error ? { "aria-invalid": true as const, "aria-describedby": `${name}-error` } : {});
const cls = (error?: string, extra = "") => `${field} ${error ? fieldError : ""} ${extra}`;

export function TextField({
  defaultValue,
  required,
  maxLength,
  placeholder,
  readOnly,
  type = "text",
  inputMode,
  ...b
}: Base & {
  defaultValue?: string;
  required?: boolean;
  maxLength?: number;
  placeholder?: string;
  readOnly?: boolean;
  type?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
}) {
  return (
    <Wrap {...b}>
      <input
        id={b.name}
        name={b.name}
        type={type}
        inputMode={inputMode}
        defaultValue={defaultValue}
        required={required}
        maxLength={maxLength}
        placeholder={placeholder}
        readOnly={readOnly}
        className={cls(b.error, readOnly ? "opacity-60" : "")}
        {...a11y(b.name, b.error)}
      />
    </Wrap>
  );
}

export function TextArea({ defaultValue, rows = 4, required, maxLength, ...b }: Base & { defaultValue?: string; rows?: number; required?: boolean; maxLength?: number }) {
  return (
    <Wrap {...b}>
      <textarea
        id={b.name}
        name={b.name}
        rows={rows}
        defaultValue={defaultValue}
        required={required}
        maxLength={maxLength}
        className={cls(b.error, "leading-relaxed")}
        {...a11y(b.name, b.error)}
      />
    </Wrap>
  );
}

export function SelectField({
  defaultValue,
  options,
  required,
  ...b
}: Base & { defaultValue?: string; options: { value: string; label: string }[]; required?: boolean }) {
  return (
    <Wrap {...b}>
      <select id={b.name} name={b.name} defaultValue={defaultValue} required={required} className={cls(b.error)} {...a11y(b.name, b.error)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Wrap>
  );
}

export function CheckField({ name, label, sub, defaultChecked }: { name: string; label: string; sub?: string; defaultChecked?: boolean }) {
  return (
    <label className="flex items-center gap-3 rounded-md border border-[#2a3a52] px-3 py-2.5">
      <input name={name} type="checkbox" defaultChecked={defaultChecked} className="h-5 w-5 accent-[#5cf2ff]" />
      <span>
        {label} {sub && <span className="block text-xs text-[#8fa3b8]">{sub}</span>}
      </span>
    </label>
  );
}

export function FormErrors({ errors }: { errors?: Record<string, string> }) {
  if (!errors || !Object.keys(errors).length) return null;
  return (
    <p role="alert" className="rounded-md border border-[#5a2630] bg-[#1d0b10] px-3 py-2 text-sm text-[#ff9aa8]">
      Please fix the marked fields.
    </p>
  );
}

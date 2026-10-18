"use client";

import { btnDanger } from "./styles";

/** A one-field form that asks before it submits (deletes). */
export function ConfirmButton({
  action,
  name,
  value,
  confirm,
  children,
}: {
  action: (form: FormData) => Promise<void>;
  name: string;
  value: string;
  confirm: string;
  children: React.ReactNode;
}) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!window.confirm(confirm)) e.preventDefault();
      }}
    >
      <input type="hidden" name={name} value={value} />
      <button type="submit" className={btnDanger}>
        {children}
      </button>
    </form>
  );
}

"use client";

import { deleteEventAction } from "./actions";
import { btnDanger } from "./styles";

/** Delete with a confirmation; the server action removes the event and refreshes the site. */
export function DeleteButton({ id, what, className = "" }: { id: string; what: string; className?: string }) {
  return (
    <form
      action={deleteEventAction}
      onSubmit={(e) => {
        if (!window.confirm(`Delete ${what}?\nThis cannot be undone.`)) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button type="submit" className={`${btnDanger} ${className}`}>
        Delete
      </button>
    </form>
  );
}

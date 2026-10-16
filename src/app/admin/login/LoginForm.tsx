"use client";

import { useActionState } from "react";
import { loginAction, type LoginState } from "../actions";
import { btnPrimary, field, label } from "../styles";

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction, undefined);
  return (
    <form action={action} className="space-y-4">
      <div>
        <label htmlFor="user" className={label}>
          Login
        </label>
        <input id="user" name="user" required autoComplete="username" autoCapitalize="none" spellCheck={false} className={field} />
      </div>
      <div>
        <label htmlFor="password" className={label}>
          Password
        </label>
        <input id="password" name="password" type="password" required autoComplete="current-password" className={field} />
      </div>
      {state?.error && (
        <p role="alert" className="text-sm text-[#ff9aa8]">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending} className={`${btnPrimary} w-full`}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}

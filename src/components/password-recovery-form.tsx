"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import {
  requestPasswordReset,
  resetPassword,
  type AuthState,
} from "@/app/auth/actions";

export function PasswordRecoveryForm({ mode }: { mode: "request" | "reset" }) {
  const [show, setShow] = useState(false);
  const [state, action, pending] = useActionState(
    mode === "request" ? requestPasswordReset : resetPassword,
    {} as AuthState,
  );
  return (
    <div className="raised-panel p-6">
      <p className="eyebrow">Account recovery</p>
      <h1 className="font-display mt-2 text-2xl font-semibold text-[var(--navy)]">
        {mode === "request" ? "Reset your password" : "Choose a new password"}
      </h1>
      <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
        {mode === "request"
          ? "Enter your email. We will send the same secure recovery flow whether you forgot your password or need a fresh verification link."
          : "Use at least eight characters and avoid a password you use elsewhere."}
      </p>
      <form action={action} className="mt-6 grid gap-4">
        {mode === "request" ? (
          <label className="field-label">
            Email
            <input
              required
              type="email"
              name="email"
              autoComplete="email"
              className="field-control"
            />
          </label>
        ) : (
          <>
            <label className="field-label">
              New password
              <span className="password-field">
                <input
                  required
                  minLength={8}
                  type={show ? "text" : "password"}
                  name="password"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShow((value) => !value)}
                  aria-label={show ? "Hide password" : "Show password"}
                >
                  {show ? (
                    <EyeOff className="size-4" />
                  ) : (
                    <Eye className="size-4" />
                  )}
                </button>
              </span>
            </label>
            <label className="field-label">
              Confirm password
              <input
                required
                minLength={8}
                type={show ? "text" : "password"}
                name="confirmation"
                autoComplete="new-password"
                className="field-control"
              />
            </label>
          </>
        )}
        {state.error && (
          <p className="inline-error" role="alert">
            {state.error}
          </p>
        )}
        {state.message && (
          <p className="inline-success" role="status">
            {state.message}
          </p>
        )}
        <button disabled={pending} className="btn btn-primary min-h-12">
          {pending
            ? "Please wait…"
            : mode === "request"
              ? "Send recovery link"
              : "Update password"}
        </button>
      </form>
      <Link
        href={mode === "reset" ? "/" : "/auth"}
        className="mt-5 inline-block text-sm font-semibold text-[var(--cyan-deep)]"
      >
        {mode === "reset" ? "Return to Kairos" : "Back to sign in"}
      </Link>
    </div>
  );
}

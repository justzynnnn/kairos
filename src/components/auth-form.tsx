"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { authenticate, type AuthState } from "@/app/auth/actions";

export function AuthForm({ configured }: { configured: boolean }) {
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [showPassword, setShowPassword] = useState(false);
  const [state, action, pending] = useActionState(
    authenticate,
    {} as AuthState,
  );

  return (
    <div className="raised-panel p-6">
      <div className="segmented-control">
        {(["sign-in", "sign-up"] as const).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={mode === value}
            onClick={() => setMode(value)}
          >
            {value === "sign-in" ? "Sign in" : "Create account"}
          </button>
        ))}
      </div>
      <h1 className="font-display mt-6 text-2xl font-semibold text-[var(--navy)]">
        {mode === "sign-in" ? "Welcome back" : "Protect your time"}
      </h1>
      <p className="mt-1 text-sm text-[var(--muted)]">
        {mode === "sign-in"
          ? "Open your private schedule."
          : "Start with a private schedule by default."}
      </p>
      <form action={action} className="mt-6 grid gap-4">
        <input type="hidden" name="mode" value={mode} />
        {mode === "sign-up" && (
          <label className="field-label">
            Name
            <input
              name="fullName"
              autoComplete="name"
              className="field-control"
            />
          </label>
        )}
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
        <label className="field-label">
          Password
          <span className="password-field">
            <input
              required
              minLength={8}
              type={showPassword ? "text" : "password"}
              name="password"
              autoComplete={
                mode === "sign-in" ? "current-password" : "new-password"
              }
            />
            <button
              type="button"
              onClick={() => setShowPassword((value) => !value)}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? (
                <EyeOff className="size-4" />
              ) : (
                <Eye className="size-4" />
              )}
            </button>
          </span>
        </label>
        {mode === "sign-in" && (
          <Link
            href="/auth/forgot"
            className="justify-self-end text-xs font-semibold text-[var(--cyan-deep)]"
          >
            Forgot password or can&apos;t verify?
          </Link>
        )}
        {state.error && (
          <p role="alert" className="inline-error">
            {state.error}
          </p>
        )}
        {state.message && (
          <p role="status" className="inline-success">
            {state.message}
          </p>
        )}
        <button
          disabled={!configured || pending}
          className="btn btn-primary min-h-12"
        >
          {pending
            ? "Please wait…"
            : mode === "sign-in"
              ? "Open Kairos"
              : "Create account"}
        </button>
      </form>
    </div>
  );
}

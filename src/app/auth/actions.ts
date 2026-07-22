"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { z } from "zod";
import { isSupabaseConfigured } from "@/lib/env";
import { allowPersistentRequest, clientKey } from "@/lib/rate-limit-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type AuthState = { error?: string; message?: string };
const authSchema = z.object({
  email: z.email(),
  password: z.string().min(8),
  fullName: z.string().max(80).optional(),
  mode: z.enum(["sign-in", "sign-up"]),
});

export async function signOut() {
  if (isSupabaseConfigured())
    await (await createServerSupabaseClient()).auth.signOut();
  redirect("/auth");
}

export async function authenticate(
  _: AuthState,
  form: FormData,
): Promise<AuthState> {
  if (!isSupabaseConfigured()) return { error: "Supabase is not configured." };
  const requestHeaders = await headers();
  if (!(await allowPersistentRequest(clientKey(requestHeaders, "auth"), 10)))
    return { error: "Too many attempts. Please wait a minute and try again." };
  const value = authSchema.safeParse({
    email: form.get("email"),
    password: form.get("password"),
    fullName: form.get("fullName") || undefined,
    mode: form.get("mode"),
  });
  if (!value.success) return { error: value.error.issues[0]?.message };
  const supabase = await createServerSupabaseClient();
  if (value.data.mode === "sign-in") {
    const { error } = await supabase.auth.signInWithPassword({
      email: value.data.email,
      password: value.data.password,
    });
    if (error) return { error: error.message };
    redirect("/");
  }
  const { data, error } = await supabase.auth.signUp({
    email: value.data.email,
    password: value.data.password,
    options: {
      data: {
        full_name: value.data.fullName || value.data.email.split("@")[0],
      },
    },
  });
  if (error) return { error: error.message };
  if (!data.session)
    return {
      message: "Check your email to verify your account, then sign in.",
    };
  redirect("/onboarding" as Route);
}

export async function requestPasswordReset(
  _: AuthState,
  form: FormData,
): Promise<AuthState> {
  if (!isSupabaseConfigured()) return { error: "Supabase is not configured." };
  const email = z.email().safeParse(form.get("email"));
  if (!email.success) return { error: "Enter a valid email address." };
  const requestHeaders = await headers();
  if (
    !(await allowPersistentRequest(
      clientKey(requestHeaders, "password-reset"),
      5,
      15 * 60_000,
    ))
  )
    return { error: "Too many requests. Try again later." };
  const origin =
    requestHeaders.get("origin") ??
    `${requestHeaders.get("x-forwarded-proto") ?? "https"}://${requestHeaders.get("host")}`;
  const supabase = await createServerSupabaseClient();
  await supabase.auth.resetPasswordForEmail(email.data, {
    redirectTo: `${origin}/auth/callback?next=/auth/reset`,
  });
  return {
    message: "If that account exists, a secure reset link is on its way.",
  };
}

export async function resetPassword(
  _: AuthState,
  form: FormData,
): Promise<AuthState> {
  const password = z.string().min(8).safeParse(form.get("password"));
  const confirmation = form.get("confirmation");
  if (!password.success) return { error: "Use at least 8 characters." };
  if (password.data !== confirmation)
    return { error: "Passwords do not match." };
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.updateUser({ password: password.data });
  if (error)
    return {
      error: "This reset link is invalid or expired. Request a new one.",
    };
  return { message: "Password updated. You can return to Kairos." };
}

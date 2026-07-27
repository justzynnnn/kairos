import type { Metadata } from "next";
import Link from "next/link";
import { AuthForm } from "@/components/auth-form";
import { Brand } from "@/components/brand";
import { MoriMascot } from "@/components/mori-mascot";
import { isSupabaseConfigured } from "@/lib/env";

export const metadata: Metadata = { title: "Sign in" };

export default function AuthPage() {
  const configured = isSupabaseConfigured();
  return (
    <main className="auth-layout">
      <section className="auth-story">
        <Brand />
        <div>
          <MoriMascot state="wave" size="large" alt="Mori, your planning companion" />
          <p className="eyebrow mt-5 text-[var(--cyan-deep)]">
            Your time. Your rules.
          </p>
          <h2 className="font-display mt-2 text-4xl font-bold tracking-tight text-[var(--navy)]">
            A calmer way to protect a busy day.
          </h2>
          <p className="mt-4 max-w-lg leading-7 text-[var(--muted)]">
            Plan, coordinate, and recover when life changes—without giving up
            control of your schedule.
          </p>
        </div>
      </section>
      <section className="auth-panel">
        <div className="w-full max-w-md">
          {!configured && (
            <div className="mb-4 rounded-xl bg-[var(--gold-soft)] p-4 text-sm text-[var(--gold-deep)]">
              <strong>Supabase setup is pending.</strong>
              <Link href="/" className="btn btn-primary mt-3 min-h-11 w-full">
                Explore local preview
              </Link>
            </div>
          )}
          <AuthForm configured={configured} />
        </div>
      </section>
    </main>
  );
}

import type { Metadata } from "next";
import { Brand } from "@/components/brand";
import { PasswordRecoveryForm } from "@/components/password-recovery-form";
export const metadata: Metadata = { title: "New password" };
export default function ResetPasswordPage() {
  return (
    <main className="min-h-screen bg-[var(--background)] p-4 sm:p-8">
      <div className="mx-auto max-w-md">
        <Brand />
        <div className="mt-12">
          <PasswordRecoveryForm mode="reset" />
        </div>
      </div>
    </main>
  );
}

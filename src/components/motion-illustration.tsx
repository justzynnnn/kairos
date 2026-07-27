"use client";

import { MoriMascot } from "@/components/mori-mascot";

/**
 * Decorative artwork for quiet empty and onboarding moments. Status is always
 * supplied by the surrounding UI, so it stays hidden from assistive technology.
 */
export function MotionIllustration({ className = "" }: { className?: string }) {
  return (
    <div className={`motion-illustration ${className}`} aria-hidden="true">
      <MoriMascot state="onboarding" size="large" alt="" />
    </div>
  );
}

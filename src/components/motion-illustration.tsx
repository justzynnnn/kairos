"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

const DotLottieReact = dynamic(
  () =>
    import("@lottiefiles/dotlottie-react").then(
      ({ DotLottieReact: Player }) => Player,
    ),
  { ssr: false },
);

/**
 * Decorative, one-shot artwork for quiet empty and onboarding moments.
 * Status is always supplied by the surrounding UI; this is intentionally
 * hidden from assistive technology and disappears when reduced motion is on.
 */
export function MotionIllustration({ className = "" }: { className?: string }) {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  if (reducedMotion) return null;

  return (
    <div className={`motion-illustration ${className}`} aria-hidden="true">
      <DotLottieReact
        autoplay
        loop={false}
        src="/motion/kairos-welcome.json"
        renderConfig={{ autoResize: true }}
      />
    </div>
  );
}

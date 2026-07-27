"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { moriAssets, type MoriState } from "@/config/mori-assets";

const MoriScene = dynamic(
  () => import("@/components/mori-scene").then((module) => module.MoriScene),
  { ssr: false },
);

export type MoriMascotSize = "small" | "medium" | "large";

const sizes: Record<MoriMascotSize, string> = {
  small: "size-12",
  medium: "size-24 sm:size-28",
  large: "size-36 sm:size-44",
};

export function MoriMascot({
  state = "idle",
  size = "medium",
  alt = "Mori, your planning companion",
  interactive = false,
  className = "",
}: {
  state?: MoriState;
  size?: MoriMascotSize;
  alt?: string;
  interactive?: boolean;
  className?: string;
}) {
  const asset = moriAssets[state];
  const node = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);
  const [tabVisible, setTabVisible] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [failedModelPath, setFailedModelPath] = useState<string | null>(null);
  // Enabled by default for new deployments; set the public flag to "false" to
  // keep the static mascot while a model is being prepared.
  const enabled = process.env.NEXT_PUBLIC_ENABLE_MORI_3D !== "false";
  const show3d =
    enabled &&
    Boolean(asset.modelPath) &&
    visible &&
    tabVisible &&
    failedModelPath !== asset.modelPath;

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotion = () => setReducedMotion(media.matches);
    const updateVisibility = () => setTabVisible(!document.hidden);
    updateMotion();
    updateVisibility();
    media.addEventListener("change", updateMotion);
    document.addEventListener("visibilitychange", updateVisibility);
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { threshold: 0.05 },
    );
    if (node.current) observer.observe(node.current);
    return () => {
      media.removeEventListener("change", updateMotion);
      document.removeEventListener("visibilitychange", updateVisibility);
      observer.disconnect();
    };
  }, []);

  return (
    <div
      ref={node}
      className={`mori-mascot ${sizes[size]} ${interactive ? "mori-mascot-interactive" : ""} ${className}`}
      aria-label={alt || undefined}
      aria-hidden={alt ? undefined : true}
    >
      <Image
        src={asset.image}
        alt=""
        fill
        sizes={
          size === "small" ? "48px" : size === "medium" ? "112px" : "176px"
        }
        className={`object-contain transition-opacity duration-200 ${show3d ? "opacity-0" : "opacity-100"}`}
        priority={size === "large"}
      />
      {show3d && asset.modelPath ? (
        <div className="absolute inset-0">
          <MoriScene
            state={state}
            modelPath={asset.modelPath}
            active={visible && tabVisible}
            reducedMotion={reducedMotion}
            onError={() => setFailedModelPath(asset.modelPath ?? null)}
          />
        </div>
      ) : null}
    </div>
  );
}

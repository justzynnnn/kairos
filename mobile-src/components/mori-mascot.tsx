import moriPlanning from "../../public/mori/static/mori-planning.png";
import moriReviewing from "../../public/mori/static/mori-reviewing.png";
import moriSuccess from "../../public/mori/static/mori-success.png";
import moriThinking from "../../public/mori/static/mori-thinking.png";
import moriWave from "../../public/mori/static/mori-wave.png";

export type MobileMoriState =
  | "idle"
  | "wave"
  | "listening"
  | "thinking"
  | "planning"
  | "reviewing"
  | "success";

type ImportedImage = string | { src: string };

const images: Record<MobileMoriState, ImportedImage> = {
  idle: moriWave,
  wave: moriWave,
  listening: moriThinking,
  thinking: moriThinking,
  planning: moriPlanning,
  reviewing: moriReviewing,
  success: moriSuccess,
};

export default function MoriMascot({
  state = "idle",
  alt = "Mori, your planning companion",
  className = "",
  eager = false,
}: {
  state?: MobileMoriState;
  alt?: string;
  className?: string;
  eager?: boolean;
}) {
  const image = images[state];
  return (
    // The native Vite bundle cannot use next/image; these files are local,
    // immutable app assets copied into the signed iOS bundle.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={typeof image === "string" ? image : image.src}
      alt={alt}
      aria-hidden={alt ? undefined : true}
      className={"mori-mascot " + className}
      decoding="async"
      draggable={false}
      loading={eager ? "eager" : "lazy"}
    />
  );
}

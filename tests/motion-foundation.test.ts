import fs from "node:fs";
import { describe, expect, it } from "vitest";

describe("motion foundation", () => {
  const css = fs.readFileSync("src/app/globals.css", "utf8");

  it("defines a calm motion system with a reduced-motion escape hatch", () => {
    expect(css).toContain("--motion-ease");
    expect(css).toContain("--motion-quick");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain(".motion-card-enter");
  });

  it("ships a local, decorative Lottie illustration", () => {
    const motion = fs.readFileSync(
      "src/components/motion-illustration.tsx",
      "utf8",
    );
    const asset = fs.readFileSync("public/motion/kairos-welcome.json", "utf8");
    expect(motion).toContain("@lottiefiles/dotlottie-react");
    expect(motion).toContain('aria-hidden="true"');
    expect(asset).toContain('"nm": "Kairos welcome"');
  });

  it("keeps AI and repair animation honest about pending review", () => {
    const assistant = fs.readFileSync(
      "src/components/assistant-workspace.tsx",
      "utf8",
    );
    const repair = fs.readFileSync(
      "src/components/repair-workspace.tsx",
      "utf8",
    );
    expect(assistant).toContain("Your calendar has not changed.");
    expect(repair).toContain("Nothing has changed yet.");
  });
});

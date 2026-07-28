import fs from "node:fs";
import { describe, expect, it } from "vitest";

describe("Mori shell design system", () => {
  const css = fs.readFileSync("src/app/globals.css", "utf8");
  const shell = fs.readFileSync("src/components/app-shell.tsx", "utf8");

  it("defines semantic Mori visual tokens and accessible focus treatment", () => {
    expect(css).toContain("--mori-cream");
    expect(css).toContain("--mori-river");
    expect(css).toContain("--focus-ring");
    expect(css).toContain("@media (forced-colors: active)");
    expect(css).toContain(":focus-visible");
  });

  it("keeps the desktop and mobile navigation inside the Mori shell", () => {
    expect(shell).toContain("mori-app-shell");
    expect(shell).toContain("mori-sidebar");
    expect(shell).toContain("mori-mobile-header");
    expect(shell).toContain("mori-mobile-navigation");
    expect(shell).toContain('aria-label="Primary navigation"');
  });
});

import fs from "node:fs";
import { describe, expect, it } from "vitest";

describe("user-facing Mori branding", () => {
  it("uses Mori in native source-of-truth display copy", () => {
    const capacitor = fs.readFileSync("capacitor.config.ts", "utf8");
    const plist = fs.readFileSync("ios/App/App/Info.plist", "utf8");
    const monitor = fs.readFileSync(
      "ios/App/App/KairosTripMonitorPlugin.swift",
      "utf8",
    );

    expect(capacitor).toContain('appName: "Mori"');
    expect(plist).toContain("<string>Mori</string>");
    expect(plist).toContain("Mori uses your location");
    expect(monitor).toContain('content.title = "Mori repaired your schedule"');
  });

  it("uses Mori in setup and preview identities without renaming compatibility keys", () => {
    const setup = fs.readFileSync("mobile-shell/index.html", "utf8");
    const demo = fs.readFileSync("src/lib/demo-data.ts", "utf8");
    const meetings = fs.readFileSync("src/lib/meetings/preview-store.ts", "utf8");
    const profile = fs.readFileSync("src/lib/profile/preview-store.ts", "utf8");

    expect(setup).toContain("Mori mobile setup");
    expect(setup).toContain("KAIROS_MOBILE_SERVER_URL");
    expect(demo).toContain("demo@mori.app");
    expect(meetings).toContain("chloe@mori.app");
    expect(profile).toContain("noah@mori.app");
  });
});

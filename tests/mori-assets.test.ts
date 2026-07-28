import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const forbiddenContactSheetHash =
  "30623bae06f48735356015d6f64f9a4d68847260332a9234ea51fbe8810104f0";
const runtimeAssets = [
  "mori-idle.png",
  "mori-wave.png",
  "mori-thinking.png",
  "mori-planning.png",
  "mori-reviewing.png",
  "mori-success.png",
  "mori-conflict.png",
  "mori-sleeping.png",
  "mori-empty-planner.png",
  "mori-empty-inbox.png",
];

function hash(file: string) {
  return createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

describe("Mori runtime assets", () => {
  it("ships exactly the approved individual static pose set", () => {
    const directory = path.join(process.cwd(), "public/mori/static");
    expect(fs.readdirSync(directory).sort()).toEqual([...runtimeAssets].sort());

    for (const asset of runtimeAssets) {
      const file = path.join(directory, asset);
      expect(fs.readFileSync(file).subarray(0, 8)).toEqual(
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      );
      expect(hash(file)).not.toBe(forbiddenContactSheetHash);
    }
  });

  it("does not retain the contact sheet at the legacy runtime path", () => {
    const legacyIdle = path.join(process.cwd(), "public/mori/mori-idle.png");
    expect(hash(legacyIdle)).not.toBe(forbiddenContactSheetHash);
  });
});

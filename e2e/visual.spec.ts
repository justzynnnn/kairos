import { expect, test } from "@playwright/test";

const viewports = [
  { name: "phone", width: 390, height: 844 },
  { name: "tablet", width: 820, height: 1180 },
  { name: "laptop", width: 1280, height: 800 },
  { name: "wide", width: 1600, height: 1000 },
] as const;

test("Settings privacy stays visually stable across breakpoints", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "webkit-desktop");
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.goto("/settings/privacy");
    await expect(
      page.getByRole("heading", { name: "Schedule visibility" }),
    ).toBeVisible();
    await expect(page).toHaveScreenshot(
      `settings-privacy-${viewport.name}.png`,
      {
        animations: "disabled",
        fullPage: true,
      },
    );
  }
});

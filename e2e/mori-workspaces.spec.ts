import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.request.post("/api/demo/reset");
});

test("Home puts the Mori planner entry first and keeps it usable at key widths", async ({
  page,
}) => {
  await page.goto("/");
  for (const width of [320, 375, 390, 430, 820, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    const entry = page.locator(".home-plan-entry");
    const input = page.getByLabel("Ask Mori from Home");
    const submit = page.getByRole("button", { name: "Open in Assistant" });

    await expect(entry).toBeVisible();
    await expect(page.locator(".home-priority-grid > :first-child")).toHaveClass(
      /home-plan-entry/,
    );
    await expect(input).toBeVisible();
    await expect(submit).toBeVisible();
    await expect(entry.locator(".home-plan-entry-mori img")).toBeVisible();
    const metrics = await page.evaluate(() => ({
      innerWidth: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(metrics.scrollWidth, JSON.stringify(metrics)).toBeLessThanOrEqual(
      metrics.innerWidth,
    );
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByLabel("Ask Mori from Home").fill("Protect an hour tomorrow");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/assistant\?command=Protect/);
  await expect(page.getByLabel("What needs to happen?")).toHaveValue(
    "Protect an hour tomorrow",
  );
});

test("Assistant retains explicit review and no-change-before-confirmation status", async ({
  page,
}) => {
  await page.goto("/assistant?command=Plan%20gym%20three%20times%20next%20week");
  await expect(page.getByLabel("What needs to happen?")).toHaveValue(
    "Plan gym three times next week",
  );
  await page.getByRole("button", { name: "Review proposal" }).click();
  await expect(page.getByText("Editable confirmation")).toBeVisible();
  await expect(
    page.getByText("Proposal ready for review. Your calendar has not changed."),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirm all items" })).toBeVisible();
});

test("Planner and Inbox use approved dedicated empty Mori poses", async ({ page }) => {
  await page.goto("/planner?date=2099-01-01");
  await expect(page.getByRole("heading", { name: "Nothing scheduled" })).toBeVisible();
  await expect(
    page.locator(".day-timeline-empty .mori-mascot img"),
  ).toBeVisible();

  await page.goto("/inbox/meetings");
  await page.getByRole("button", { name: "Drafts" }).click();
  const empty = page.getByRole("heading", { name: "No meetings in this view" });
  if (await empty.isVisible()) {
    await expect(
      page.locator(".mori-mascot img"),
    ).toBeVisible();
  }
});

import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.request.post("/api/demo/reset");
});

test("Planner week view is URL-backed and navigable", async ({ page }) => {
  await page.goto("/planner");
  await page.waitForLoadState("networkidle");
  const week = page.getByRole("button", { name: "week", exact: true });
  await week.click();
  await expect(page).toHaveURL(/view=week/);
  await expect(week).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Next week" })).toBeVisible();
  const before = await page.getByTestId("planner-range").textContent();
  await page.getByRole("button", { name: "Next week" }).click();
  await expect(page.getByTestId("planner-range")).not.toHaveText(before!);
  await page.getByRole("button", { name: "Return to today" }).click();
  await expect(page).toHaveURL(/view=week/);
});

test("Planner day view uses a vertical hourly timeline", async ({ page }) => {
  await page.goto("/planner");
  await page.waitForLoadState("networkidle");
  const guide = page.getByTestId("planner-time-guide");
  await expect(guide).toBeVisible();
  await expect(guide).toContainText("6 AM");
  await expect(guide).toContainText("12 PM");
  await expect(guide).toContainText("10 PM");
  await expect(guide.locator(".day-time-axis")).toBeVisible();
  await expect(guide.locator(".timeline-item").first()).toBeVisible();
});

test("account settings have explicit Save and Cancel behavior", async ({
  page,
}) => {
  await page.goto("/settings/account");
  await page.waitForLoadState("networkidle");
  const name = page.getByLabel("Full name");
  await name.fill("Justin Lawrence");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Settings saved.")).toBeVisible();
  await name.fill("Temporary name");
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(name).toHaveValue("Justin Lawrence");
});

test("automation switches save independently", async ({ page }) => {
  await page.goto("/settings/automation");
  await page.waitForLoadState("networkidle");
  const reminders = page.getByRole("switch", { name: "Schedule reminders" });
  await reminders.uncheck();
  await expect(page.getByText("Automation setting updated.")).toBeVisible();
  await page.reload();
  await expect(reminders).not.toBeChecked();
});

test("Demo data control and per-friend permissions are absent", async ({
  page,
}) => {
  await page.goto("/settings/privacy");
  await page.waitForLoadState("networkidle");
  await expect(page.getByText("Demo data")).toHaveCount(0);
  await expect(page.getByText(/What Chloe may see/)).toHaveCount(0);
  await expect(page.getByRole("radio", { name: /Private/ })).toBeVisible();
  await expect(page.getByRole("radio", { name: /Friends/ })).toBeVisible();
  await expect(page.getByRole("radio", { name: /Kairos users/ })).toBeVisible();
});

test("remembered preferences support Save, Cancel, and confirmed deletion", async ({
  page,
}) => {
  await page.goto("/settings/preferences");
  await page.waitForLoadState("networkidle");
  const editor = page.locator(".preference-editor").first();
  const category = editor.getByLabel("Category");
  await category.fill("Training");
  await editor.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Training saved.")).toBeVisible();
  await editor.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.getByRole("button", { name: "Delete preference" }).click();
  await expect(page.getByText("Training removed.")).toBeVisible();
});

test("task completion appears in private Activity settings", async ({
  page,
}) => {
  await page.goto("/planner");
  await page.waitForLoadState("networkidle");
  const gym = page.getByRole("article").filter({ hasText: "Gym Session" });
  await gym.getByRole("button", { name: "Mark complete" }).click();
  await expect(gym).toContainText("Done");
  await page.goto("/settings/activity");
  await page.waitForLoadState("networkidle");
  await expect(page.getByText("Gym Session", { exact: true })).toBeVisible();
  await expect(page.getByText(/task completion/i).first()).toBeVisible();
});

test("mobile primary controls remain tappable", async ({ page }, info) => {
  test.skip(!info.project.name.includes("iphone"), "iPhone interaction audit");
  for (const path of [
    "/",
    "/planner",
    "/assistant",
    "/inbox",
    "/settings/account",
  ]) {
    await page.goto(path);
    const buttons = page.locator(
      'button:visible:not([aria-label="Open Next.js Dev Tools"])',
    );
    await expect(buttons.first()).toBeVisible();
    const count = await buttons.count();
    expect(count).toBeGreaterThan(0);
    for (let index = 0; index < count; index += 1) {
      const button = buttons.nth(index),
        box = await button.boundingBox();
      expect(box?.width, `${path}: button ${index}`).toBeGreaterThanOrEqual(24);
      expect(box?.height, `${path}: button ${index}`).toBeGreaterThanOrEqual(
        24,
      );
    }
  }
});

test("every mobile navigation target stays in the app shell", async ({
  page,
}, info) => {
  test.skip(!info.project.name.includes("iphone"), "iPhone navigation audit");
  await page.goto("/");
  for (const [label, path] of [
    ["Planner", "/planner"],
    ["Kairos", "/assistant"],
    ["Inbox", "/inbox"],
    ["Settings", "/settings/account"],
    ["Home", "/"],
  ] as const) {
    const link = page
      .getByTestId("mobile-navigation")
      .getByRole("link", { name: label, exact: true });
    await link.click();
    await expect(page).toHaveURL(
      new RegExp(path === "/" ? "/$" : `^.*${path}`),
    );
    await expect(page.getByTestId("mobile-navigation")).toBeVisible();
  }
});

import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.request.post("/api/demo/reset");
});

test("schedule cards stay compact without inline Journey expansion", async ({
  page,
}) => {
  await page.goto("/planner");
  await page.waitForLoadState("networkidle");
  const card = page
    .getByRole("article")
    .filter({ hasText: "Systems Design Class" })
    .first();
  await expect(card).toBeVisible();
  await expect(card.getByRole("button", { name: "Journey" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Create item" })).toBeVisible();
});

test("event details and Journey Mode live in a URL-backed dialog", async ({
  page,
}) => {
  await page.goto("/planner");
  const card = page
    .getByRole("article")
    .filter({ hasText: "Systems Design Class" })
    .first();
  await card.getByRole("link", { name: "View details" }).click();
  await expect(page).toHaveURL(/item=class/);
  const dialog = page.getByRole("dialog", { name: "Systems Design Class" });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("heading", { name: "Journey Mode" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});

test("Planner soft cancellation is confirmed and removes the active item", async ({
  page,
}) => {
  await page.goto("/planner");
  const card = page.getByRole("article").filter({ hasText: "Gym Session" });
  await card.getByRole("link", { name: "View details" }).click();
  await page.getByRole("button", { name: "Cancel item" }).click();
  const confirmation = page.getByRole("alertdialog", {
    name: "Cancel this schedule item?",
  });
  await confirmation.getByRole("button", { name: "Cancel item" }).click();
  await expect(page).not.toHaveURL(/item=gym/);
  await expect(card).toHaveCount(0);
});

test("Settings removes Demo data while retaining account scheduling controls", async ({
  page,
}) => {
  await page.goto("/profile");
  await page.waitForLoadState("networkidle");
  await expect(page).toHaveURL(/\/settings\/account$/);
  await expect(page.getByText("Demo data")).toHaveCount(0);
  await expect(page.getByLabel("Default travel buffer")).toBeVisible();
});

test("confirmed Assistant items appear in URL-backed Planner dates", async ({
  page,
}) => {
  const command =
    "Add dentist appointment tomorrow at 4pm for one hour at Makati Medical Center";
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Ask Kairos from Home").fill(command);
  await page.getByRole("button", { name: "Open in Assistant" }).click();
  await page.getByRole("button", { name: "Review proposal" }).click();
  await expect(
    page.getByRole("heading", { name: "Create 1 schedule item." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Confirm all items" }).click();
  await expect(
    page.getByText("Schedule confirmed for this demo session."),
  ).toBeVisible();
  await page.goto("/planner");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Next day" }).click();
  await expect(page).toHaveURL(/date=/);
  const card = page
    .getByRole("article")
    .filter({ hasText: "Dentist Appointment" });
  await expect(card).toBeVisible();
  await expect(card).toContainText("Makati Medical Center");
});

test("background day-start refresh cannot interrupt navigation", async ({
  page,
}, info) => {
  test.skip(
    !info.project.name.includes("desktop"),
    "one navigation race regression is sufficient",
  );
  await page.route("**/api/day/start", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 800));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        dayStarted: true,
        firstOpen: true,
        broken: false,
        incident: null,
      }),
    });
  });
  await page.goto("/");
  await page
    .getByTestId("desktop-navigation")
    .getByRole("link", { name: "Planner" })
    .click();
  await expect(page).toHaveURL(/\/planner/);
  await page.waitForTimeout(1000);
  await expect(page).toHaveURL(/\/planner/);
});

test("offline screen reports connection state and offers Retry", async ({
  page,
}) => {
  await page.goto("/offline");
  await expect(
    page.getByRole("heading", { name: /online|offline/i }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
});

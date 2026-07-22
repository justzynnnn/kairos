import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.request.post("/api/demo/reset");
});

test("find-times language creates a private unsent draft", async ({ page }) => {
  await page.goto("/inbox/meetings");
  await page.waitForLoadState("networkidle");
  await page
    .getByLabel("Meeting command")
    .fill("Find 60 minutes with Chloe next week");
  await page.getByRole("button", { name: "Coordinate meeting" }).click();
  await expect(page.getByText("Private draft", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Send these options" }),
  ).toBeVisible();
  await expect(page.getByText(/Nothing was sent/)).toBeVisible();
});

test("Justin and Chloe complete final confirmation on the meeting route", async ({
  page,
}, info) => {
  test.skip(!info.project.name.includes("desktop"), "single shared-state flow");
  await page.goto("/inbox/meetings?demoUser=justin");
  await page.waitForLoadState("networkidle");
  await page
    .getByLabel("Meeting command")
    .fill("Schedule a 60 minute Strategy Alignment with Chloe next week");
  await page.getByRole("button", { name: "Coordinate meeting" }).click();
  await expect(
    page.getByText("Awaiting recipient", { exact: true }),
  ).toBeVisible();
  await page.goto("/inbox/meetings?demoUser=chloe");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Accept selected time" }).click();
  await expect(
    page.getByText("Awaiting sender", { exact: true }),
  ).toBeVisible();
  await page.goto("/inbox/meetings?demoUser=justin");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Final confirmation" }).click();
  await expect(page.getByText("Confirmed", { exact: true })).toBeVisible();
});

test("meeting cards remain usable on iPhone", async ({ page }, info) => {
  test.skip(!info.project.name.includes("iphone"), "iPhone layout check");
  await page.goto("/inbox/meetings");
  await page.waitForLoadState("networkidle");
  await page
    .getByLabel("Meeting command")
    .fill("Schedule a 60 minute Strategy Alignment with Chloe next week");
  await page.getByRole("button", { name: "Coordinate meeting" }).click();
  await expect(
    page.getByRole("heading", { name: "Strategy Alignment" }),
  ).toBeVisible();
  await expect(page.getByTestId("mobile-navigation")).toBeVisible();
});

test("meeting filters lead to a focused detail route", async ({ page }) => {
  await page.goto("/inbox/meetings");
  await page.waitForLoadState("networkidle");
  await page
    .getByLabel("Meeting command")
    .fill("Find 45 minutes with Chloe next week");
  await page.getByRole("button", { name: "Coordinate meeting" }).click();
  await page.getByRole("button", { name: "Drafts" }).click();
  await expect(page.getByText("Private draft", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "View details" }).click();
  await expect(page).toHaveURL(/\/inbox\/meetings\/[^?]+/);
  await expect(
    page.getByRole("heading", { name: "Meeting details" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Send these options" }),
  ).toBeVisible();
});

test("guest booking shows timezone clarity and records a response", async ({
  page,
}, info) => {
  test.skip(
    !info.project.name.includes("desktop"),
    "single external-token flow",
  );
  await page.goto("/inbox/meetings");
  await page.waitForLoadState("networkidle");
  await page
    .getByLabel("Meeting command")
    .fill("Schedule a 30 minute review with guest@example.com tomorrow");
  await page.getByRole("button", { name: "Coordinate meeting" }).click();
  const link = page.getByRole("link", { name: "Open no-account booking page" });
  const path = await link.getAttribute("href");
  await page.goto(path!);
  await expect(
    page.getByRole("heading", { name: "Respond without an account" }),
  ).toBeVisible();
  await expect(page.getByText(/Meeting timezone:/)).toBeVisible();
  await page.getByRole("button", { name: "Accept selected time" }).click();
  await expect(
    page.getByText(/organizer must give final confirmation/),
  ).toBeVisible();
});

import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.request.post("/api/demo/reset");
});

test("all core areas are reachable with route-specific titles", async ({
  page,
}) => {
  for (const [path, heading, title] of [
    ["/", /Good (morning|afternoon|evening), Justin/, "Today · Kairos"],
    ["/planner", "Planner", "Planner · Kairos"],
    ["/assistant", "Plan with Kairos", "Assistant · Kairos"],
    ["/inbox", "Inbox", "Chats · Kairos"],
    ["/settings/account", "Settings", "Account · Kairos"],
  ] as const) {
    await page.goto(path);
    await expect(
      page.getByRole("heading", { name: heading, exact: true }),
    ).toBeVisible();
    await expect(page).toHaveTitle(title);
  }
});

test("compound fallback reaches one editable confirmation", async ({
  page,
}) => {
  await page.goto("/assistant");
  await page.waitForLoadState("networkidle");
  const command = page.getByLabel("What needs to happen?");
  await command.fill(
    "Add Systems Design class tomorrow from 10 to 11:30, gym after class for an hour, and my paper is due Friday at 5pm. Block 90 minutes for research.",
  );
  await page.getByRole("button", { name: "Review proposal" }).click();
  await expect(
    page.getByRole("heading", { name: "Create 4 schedule items." }),
  ).toBeVisible();
  await expect(
    page.locator('input[value="Systems Design Class"]'),
  ).toBeVisible();
  await expect(page.locator('input[value="Gym Session"]')).toBeVisible();
  await page.getByRole("button", { name: "Confirm all items" }).click();
  await expect(
    page.getByText(/Schedule confirmed for this demo session/),
  ).toBeVisible();
});

test("onboarding saves day and privacy rules before the first item", async ({
  page,
}) => {
  await page.goto("/onboarding");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("radio", { name: /Friends/ }).check();
  await page.getByRole("button", { name: "Save and continue" }).click();
  const command = "Prepare the project brief tomorrow for 90 minutes";
  await page.getByLabel("What needs to happen?").fill(command);
  await page.getByRole("button", { name: "Review in Assistant" }).click();
  await expect(page).toHaveURL(/\/assistant\?command=/);
  await expect(page.getByLabel("What needs to happen?")).toHaveValue(command);
});

test("Home command opens the complete Assistant workflow", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  const value = "Add dentist appointment tomorrow at 4pm for one hour";
  await page.getByLabel("Ask Kairos from Home").fill(value);
  await page.getByRole("button", { name: "Open in Assistant" }).click();
  await expect(page).toHaveURL(/\/assistant\?command=/);
  await expect(page.getByLabel("What needs to happen?")).toHaveValue(value);
  await expect(
    page.getByRole("heading", { name: "Plan with Kairos" }),
  ).toBeVisible();
});

test("bare deadline asks for preparation details", async ({ page }) => {
  await page.goto("/assistant");
  await page.waitForLoadState("networkidle");
  await page
    .getByLabel("What needs to happen?")
    .fill("My paper is due Friday at 5pm");
  await page.getByRole("button", { name: "Review proposal" }).click();
  await expect(
    page.getByText(/Should preparation use one block or multiple blocks/),
  ).toBeVisible();
});

test("mobile navigation exposes the focused product areas", async ({
  page,
}, info) => {
  test.skip(!info.project.name.includes("iphone"), "mobile only");
  await page.goto("/");
  const nav = page.getByTestId("mobile-navigation");
  for (const label of ["Home", "Planner", "Kairos", "Inbox", "Settings"])
    await expect(nav.getByText(label, { exact: true })).toBeVisible();
});

test("manual protected repair stays available without occupying Home", async ({
  page,
}) => {
  await page.route("**/api/day/start", async (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        dayStarted: true,
        firstOpen: true,
        broken: false,
        incident: null,
      }),
    }),
  );
  await page.goto("/");
  await expect(
    page.getByRole("region", { name: "Schedule repair" }),
  ).toHaveCount(0);
  await page.goto("/planner");
  await page.getByText("Manual schedule repair", { exact: true }).click();
  await page.getByRole("button", { name: "I woke up late" }).click();
  await expect(
    page.getByRole("tab", { name: /Recommended · least disruption/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Approve whole repair" }),
  ).toBeVisible();
});

test("repair confirmation is atomic and makes older proposals stale", async ({
  page,
}, info) => {
  test.skip(!info.project.name.includes("desktop"), "single transaction test");
  const first = await page.request.post("/api/repair/propose", {
    data: { trigger: "woke_late", delayMinutes: 45 },
  });
  const second = await page.request.post("/api/repair/propose", {
    data: { trigger: "woke_late", delayMinutes: 45 },
  });
  const firstBody = await first.json(),
    secondBody = await second.json();
  const accepted = await page.request.post("/api/repair/confirm", {
    data: {
      proposalId: firstBody.proposalId,
      alternativeId: firstBody.alternatives[0].id,
      baseScheduleVersion: firstBody.baseScheduleVersion,
    },
  });
  expect(accepted.ok()).toBe(true);
  const stale = await page.request.post("/api/repair/confirm", {
    data: {
      proposalId: secondBody.proposalId,
      alternativeId: secondBody.alternatives[0].id,
      baseScheduleVersion: secondBody.baseScheduleVersion,
    },
  });
  expect(stale.status()).toBe(409);
});

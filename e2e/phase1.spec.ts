import { expect, test } from "@playwright/test";

test.beforeEach(async({page})=>{await page.request.post("/api/demo/reset");});

test("all core areas are reachable", async ({ page }) => {
  for (const [path, heading] of [["/", /Good morning, Justin/], ["/planner", "Planner"], ["/assistant", "Talk to Kairos"], ["/inbox", "Inbox"], ["/profile", "Profile"]] as const) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
  }
});

test("compound fallback reaches one editable confirmation", async ({ page }) => {
  await page.goto("/assistant");
  await page.getByRole("button", { name: "Create proposal" }).click();
  await expect(page.getByRole("heading", { name: "Create 4 schedule items." })).toBeVisible();
  await expect(page.locator('input[value="Systems Design Class"]')).toBeVisible();
  await expect(page.locator('input[value="Gym Session"]')).toBeVisible();
  const confirm = page.getByRole("button", { name: "Confirm all items" });
  await expect(confirm).toBeVisible();
  await confirm.click();
  await expect(page.getByText(/Schedule confirmed for this demo session/)).toBeVisible();
});

test("Home composer creates its proposal in place", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Ask Kairos from Home").fill("Add Systems Design class tomorrow from 10 to 11:30, gym after class for an hour, and my paper is due Friday at 5pm. Block 90 minutes for research.");
  await page.getByRole("button", { name: "Create schedule proposal" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "Create 4 schedule items." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirm all items" })).toBeVisible();
});

test("bare deadline asks for preparation details", async ({ page }) => {
  await page.goto("/assistant");
  await page.waitForLoadState("networkidle");
  const command = page.getByLabel("What needs to happen?");
  await command.fill("My paper is due Friday at 5pm");
  await expect(command).toHaveValue("My paper is due Friday at 5pm");
  await page.getByRole("button", { name: "Create proposal" }).click();
  await expect(page.getByText(/Should preparation use one block or multiple blocks/)).toBeVisible();
});

test("mobile navigation keeps the Stitch pattern", async ({ page }, info) => {
  test.skip(!info.project.name.includes("iphone"), "mobile only");
  await page.goto("/");
  const nav = page.getByTestId("mobile-navigation");
  for (const label of ["Home", "Planner", "AI", "Inbox", "Profile"]) await expect(nav.getByText(label, { exact: true })).toBeVisible();
});

test("schedule repair stays on Home and requires whole-plan approval", async ({ page }) => {
  await page.request.post("/api/demo/reset");
  await page.goto("/");
  await page.getByRole("button", { name: "I woke up late" }).click();
  await expect(page.getByRole("tab", { name: /Recommended · least disruption/ })).toBeVisible();
  await expect(page.getByText(/Approval is atomic and rejected if your calendar changed/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve whole repair" })).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
});

test("repair confirmation is atomic and makes older proposals stale", async ({ page }, info) => {
  test.skip(!info.project.name.includes("desktop"), "single transaction test");
  await page.request.post("/api/demo/reset");
  const first=await page.request.post("/api/repair/propose",{data:{trigger:"woke_late",delayMinutes:45}});
  const second=await page.request.post("/api/repair/propose",{data:{trigger:"woke_late",delayMinutes:45}});
  const firstBody=await first.json();
  const secondBody=await second.json();
  const accepted=await page.request.post("/api/repair/confirm",{data:{proposalId:firstBody.proposalId,alternativeId:firstBody.alternatives[0].id,baseScheduleVersion:firstBody.baseScheduleVersion}});
  expect(accepted.ok()).toBe(true);
  await page.goto("/planner");
  await expect(page.getByRole("article").filter({hasText:"Gym Session"})).toContainText("1:00 PM");
  const stale=await page.request.post("/api/repair/confirm",{data:{proposalId:secondBody.proposalId,alternativeId:secondBody.alternatives[0].id,baseScheduleVersion:secondBody.baseScheduleVersion}});
  expect(stale.status()).toBe(409);
});

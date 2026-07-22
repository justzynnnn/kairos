import { expect, test } from "@playwright/test";

const conversationId = "44444444-4444-4444-8444-444444444444";
test.beforeEach(async ({ page }) => {
  await page.request.post("/api/demo/reset");
});

test("healthy Home keeps activity history as a supporting consistency panel", async ({
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
  await page.waitForLoadState("networkidle");
  await expect(page.getByText("Next up", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Today's agenda" }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Your activity rhythm" }),
  ).toBeVisible();
  await expect(page.getByText(/day streak/)).toBeVisible();
});

test("opening a chat navigates to a dedicated conversation URL", async ({
  page,
}) => {
  await page.goto("/inbox");
  await page.waitForLoadState("networkidle");
  await page.locator(".conversation-row").filter({ hasText: "Chloe" }).click();
  await expect(page).toHaveURL(new RegExp(`/inbox/chats/${conversationId}`));
  await expect(page.getByRole("heading", { name: "Chloe" })).toBeVisible();
  await page
    .getByLabel("Write a message")
    .fill("Please keep the 15-minute notes buffer.");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(
    page.getByText("Please keep the 15-minute notes buffer."),
  ).toBeVisible();
  await expect(
    page
      .locator(".message-row")
      .filter({ hasText: "Please keep the 15-minute notes buffer." }),
  ).not.toContainText("Sending…");
  await page.goto(`/inbox/chats/${conversationId}?demoUser=chloe`);
  await expect(
    page.getByText("Please keep the 15-minute notes buffer."),
  ).toBeVisible();
});

test("message retries do not create duplicates", async ({ page }) => {
  const body = {
    body: "Exactly once",
    clientNonce: "81111111-1111-4111-8111-111111111111",
    relatedMeetingId: null,
  };
  await page.request.post(`/api/conversations/${conversationId}/messages`, {
    headers: { "x-demo-user": "justin" },
    data: body,
  });
  await page.request.post(`/api/conversations/${conversationId}/messages`, {
    headers: { "x-demo-user": "justin" },
    data: body,
  });
  await page.goto(`/inbox/chats/${conversationId}?demoUser=justin`);
  await page.waitForLoadState("networkidle");
  await expect(page.getByText("Exactly once")).toHaveCount(1);
});

test("authorized participants can download a restricted attachment", async ({
  page,
}) => {
  await page.goto(`/inbox/chats/${conversationId}?demoUser=justin`);
  await page.waitForLoadState("networkidle");
  await page.locator('input[type="file"]').setInputFiles({
    name: "agenda.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("private agenda"),
  });
  await page.getByLabel("Write a message").fill("Agenda for our meeting");
  await page.getByRole("button", { name: "Send message" }).click();
  let link = page.getByRole("link", { name: /agenda\.txt/ });
  const justinPath = await link.getAttribute("href");
  expect(justinPath).toMatch(/demoUser=justin/);
  expect(await (await page.request.get(justinPath!)).text()).toBe(
    "private agenda",
  );
  await page.goto(`/inbox/chats/${conversationId}?demoUser=chloe`);
  link = page.getByRole("link", { name: /agenda\.txt/ });
  const chloePath = await link.getAttribute("href");
  expect(chloePath).toMatch(/demoUser=chloe/);
  expect(await (await page.request.get(chloePath!)).text()).toBe(
    "private agenda",
  );
});

test("meeting discussion opens the dedicated thread", async ({ page }) => {
  await page.goto("/inbox/meetings");
  await page.waitForLoadState("networkidle");
  await page
    .getByLabel("Meeting command")
    .fill("Schedule a 60 minute Strategy Alignment with Chloe next week");
  await page.getByRole("button", { name: "Coordinate meeting" }).click();
  await page.getByRole("button", { name: "Discuss this request" }).click();
  await expect(page).toHaveURL(new RegExp(`/inbox/chats/${conversationId}`));
});

test("users are found and added from the People route", async ({ page }) => {
  await page.goto("/inbox/people");
  await page.waitForLoadState("networkidle");
  await page
    .getByRole("search")
    .getByPlaceholder("Name, username, or email")
    .fill("noah");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  const result = page.getByRole("article").filter({ hasText: "Noah Santos" });
  await result.getByRole("button", { name: "Add friend" }).click();
  await expect(page.getByText("Friend request sent.")).toBeVisible();
  await expect(result).toContainText("Request sent");
});

test("schedule visibility is one global privacy control", async ({ page }) => {
  await page.goto("/settings/privacy");
  await page.waitForLoadState("networkidle");
  await expect(page.getByText("Availability only")).toBeVisible();
  await page.getByRole("radio", { name: /Friends/ }).check();
  await expect(page.getByText("Schedule visibility updated.")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("radio", { name: /Friends/ })).toBeChecked();
  await expect(
    page.getByText(/never shares titles, descriptions, categories, locations/i),
  ).toBeVisible();
});

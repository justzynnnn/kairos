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
    await expect(page.locator(".home-hero-mori img")).toBeVisible();
    const metrics = await page.evaluate(() => {
      const hero = document.querySelector<HTMLElement>(".home-hero");
      const mascot = document.querySelector<HTMLElement>(".home-hero-mori");
      const name = document.querySelector<HTMLElement>(".home-hero-title span");
      const nextUp = document.querySelector<HTMLElement>(".next-up-panel");
      const plannerEntry =
        document.querySelector<HTMLElement>(".home-plan-entry");
      const priorityGrid = document.querySelector<HTMLElement>(
        ".home-priority-grid",
      );
      const representativeName = name!.cloneNode(false) as HTMLElement;
      representativeName.textContent = "Alexandria Montgomery Chen";
      representativeName.style.position = "absolute";
      representativeName.style.visibility = "hidden";
      name!.parentElement!.append(representativeName);
      const mascotRect = mascot!.getBoundingClientRect();
      const nameRect = representativeName.getBoundingClientRect();
      const nextUpRect = nextUp!.getBoundingClientRect();
      const plannerEntryRect = plannerEntry!.getBoundingClientRect();
      const nameLineHeight = Number.parseFloat(
        getComputedStyle(representativeName).lineHeight,
      );
      representativeName.remove();

      return {
        cardEdgeWithinMascot:
          (plannerEntryRect.top - mascotRect.top) / mascotRect.height,
        heroLayer: Number(getComputedStyle(hero!).zIndex),
        innerWidth: window.innerWidth,
        nameLines: nameRect.height / nameLineHeight,
        nextUpAspect: nextUpRect.height / nextUpRect.width,
        plannerEntryAspect: plannerEntryRect.height / plannerEntryRect.width,
        plannerEntryLeft: plannerEntryRect.left,
        plannerEntryRight: plannerEntryRect.right,
        priorityGridLayer: Number(getComputedStyle(priorityGrid!).zIndex),
        scrollWidth: document.documentElement.scrollWidth,
      };
    });
    expect(metrics.scrollWidth, JSON.stringify(metrics)).toBeLessThanOrEqual(
      metrics.innerWidth,
    );
    expect(metrics.priorityGridLayer, JSON.stringify(metrics)).toBeGreaterThan(
      metrics.heroLayer,
    );
    expect(metrics.cardEdgeWithinMascot, JSON.stringify(metrics)).toBeGreaterThan(
      0.45,
    );
    expect(metrics.cardEdgeWithinMascot, JSON.stringify(metrics)).toBeLessThan(
      0.7,
    );
    expect(metrics.nameLines, JSON.stringify(metrics)).toBeLessThanOrEqual(2.1);
    expect(metrics.plannerEntryAspect, JSON.stringify(metrics)).toBeLessThan(0.9);
    expect(metrics.nextUpAspect, JSON.stringify(metrics)).toBeLessThan(0.8);
    expect(metrics.plannerEntryLeft, JSON.stringify(metrics)).toBeGreaterThanOrEqual(
      0,
    );
    expect(metrics.plannerEntryRight, JSON.stringify(metrics)).toBeLessThanOrEqual(
      metrics.innerWidth,
    );
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const homeCommand = page.getByLabel("Ask Mori from Home");
  await homeCommand.fill("Protect an hour tomorrow");
  await homeCommand.press("Enter");
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

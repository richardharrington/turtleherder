import { expect, test } from "@playwright/test";

// The wall and the join flow, browsed signed-out: no storageState
// cookie, fresh localStorage. Alphabetically this file runs after
// app.spec.ts, which revokes Bob's token — so the valid-join test uses
// Alice's (untouched by every other test).

test.use({ storageState: { cookies: [], origins: [] } });

test.describe.configure({ mode: "serial" });

test("the public landing serves strangers and invited teammates together", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Know who’s playing." })).toBeVisible();
  await expect(page.getByRole("link", { name: "Create a team" })).toBeVisible();
  await expect(page.locator("body")).toContainText("Already on a team?");
  await expect(page.locator("body")).toContainText(
    "You need the link your captain texted you.",
  );
});

test("self-serve creation signs in the captain and completes guided setup", async ({ page, context }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Create a team" }).click();
  await page.getByLabel("Team name").fill("Night Owls");
  await expect(page.getByLabel("Team URL")).toHaveValue("night-owls");
  await page.getByLabel("Your name").fill("Nora Captain");
  await page.getByRole("button", { name: "Create team" }).click();

  await expect(page).toHaveURL("/night-owls/setup");
  await expect(page.getByRole("heading", { name: "Set up Night Owls" })).toBeVisible();
  await expect(page.locator("code")).toContainText("/join/");
  await expect(page.locator("body")).toContainText("bookmark it, or email it to yourself");
  expect((await context.cookies()).find((cookie) => cookie.name === "th_session")).toBeDefined();

  // Format suggestions are placeholders, not silently stored defaults.
  await expect(page.getByLabel("Players per side")).toHaveValue("");
  await expect(page.getByLabel("Players per side")).toHaveAttribute("placeholder", "7");
  await expect(page.getByLabel("Fewest to play")).toHaveValue("");
  await page.getByLabel("Players per side").fill("7");
  await page.getByLabel("Fewest to play").fill("5");

  await page.locator('input[name="gender-rule"][value="yes"]').check();
  await page.locator('input[name="rule-shape"][value="cap-and-floor"]').check();
  await page.getByLabel("Maximum restricted players for combined rule").fill("5");
  await page.getByLabel("Minimum protected players for combined rule").fill("1");
  await page.locator('input[name="has-goalkeeper"][value="yes"]').check();
  await page.locator('input[name="keeper-counts"][value="no"]').check();
  await expect(page.getByLabel("Category we’re protecting")).toHaveValue("women");
  await page.getByLabel("Category we’re protecting").fill("people");
  await expect(page.getByLabel("Singular").first()).toHaveValue("person");
  await page.getByLabel("Category we’re protecting").fill("women");
  await expect(page.getByLabel("Category we’re restricting")).toHaveValue("men");
  await page.getByRole("button", { name: "Finish setup" }).click();

  await expect(page).toHaveURL("/night-owls");
  await expect(page.getByRole("heading", { name: "Night Owls Schedule" })).toBeVisible();
  await page.getByRole("link", { name: "Settings" }).click();
  await page.getByLabel("Team name").fill("Night Owl United");
  await page.getByLabel("Timezone").fill("UTC");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("button", { name: "Night Owl United" })).toBeVisible();
  await expect(page.locator("body")).toContainText("/night-owls");
  await expect(page.getByLabel("Maximum restricted players for combined rule")).toHaveValue("5");
});

test("a signed-out visitor at a team URL is bounced to the wall", async ({
  page,
}) => {
  await page.goto("/testcats");

  await expect(page).toHaveURL("/?from=testcats");
  await expect(page.locator("body")).toContainText(
    "Ask your captain for your link.",
  );
  await expect(page.locator("body")).toContainText(
    "The schedule is only visible to team members.",
  );
  // Nothing about the team leaks — not even its name.
  await expect(page.locator("body")).not.toContainText("Testcats");
});

test("an invalid join link shows the invalid-link wall", async ({ page }) => {
  await page.goto("/join/definitely-not-a-real-token");

  await expect(page).toHaveURL("/?join=invalid");
  await expect(page.locator("body")).toContainText("That link didn’t work");
  await expect(page.locator("body")).toContainText(
    "Ask your captain for a fresh one.",
  );
  await expect(page.locator("body")).not.toContainText("Testcats");
});

test("a valid join link sets the session cookie and lands on the team", async ({
  page,
  context,
}) => {
  await page.goto("/join/e2e-alice-token");

  await expect(page).toHaveURL("/testcats");
  await expect(
    page.getByRole("heading", { name: "Testcats Schedule" }),
  ).toBeVisible();
  await expect(page.getByTestId("status-strip")).toContainText("You:");

  const session = (await context.cookies()).find(
    (c) => c.name === "th_session",
  );
  expect(session).toBeDefined();
  expect(session!.httpOnly).toBe(true);
});

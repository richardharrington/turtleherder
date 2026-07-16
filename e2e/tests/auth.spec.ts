import { expect, test } from "@playwright/test";

// The wall and the join flow, browsed signed-out: no storageState
// cookie, fresh localStorage. Alphabetically this file runs after
// app.spec.ts, which revokes Bob's token — so the valid-join test uses
// Alice's (untouched by every other test).

test.use({ storageState: { cookies: [], origins: [] } });

test.describe.configure({ mode: "serial" });

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
    page.getByRole("heading", { name: "Testcats Game Schedule" }),
  ).toBeVisible();
  await expect(page.getByTestId("personal-question")).toContainText(
    "Alice, will you be coming",
  );

  const session = (await context.cookies()).find(
    (c) => c.name === "th_session",
  );
  expect(session).toBeDefined();
  expect(session!.httpOnly).toBe(true);
});

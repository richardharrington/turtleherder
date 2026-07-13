import { expect, test, type Page } from "@playwright/test";

// Flows against the seeded Testcats team (see global-setup.ts):
// players Alice (counts toward minimum), Bob, Carol; a past game vs
// Marmots; a future game vs Wombats where Alice has said yes.
//
// The tests mutate shared state, so they run in order in one worker.
test.describe.configure({ mode: "serial" });

function playerLine(page: Page, name: string) {
  return page.locator("p.list1", { hasText: name });
}

test("marking attendance inline updates the line and the roster report", async ({
  page,
}) => {
  await page.goto("/testcats");
  await expect(
    page.getByRole("heading", { name: "Testcats Game Schedule" }),
  ).toBeVisible();

  const bob = playerLine(page, "Bob");
  await expect(bob).toContainText("hasn't responded yet");
  await expect(page.locator("body")).toContainText(
    "So far we have one player, one of whom is a woman.",
  );

  // .click(), not .check(): the radios are controlled inputs that only
  // re-render as checked after the mutation and refetch complete.
  await bob.getByLabel("Yes", { exact: true }).click();

  await expect(bob).toContainText("will be playing");
  await expect(bob.getByLabel("Yes", { exact: true })).toBeChecked();
  await expect(page.locator("body")).toContainText(
    "So far we have two players, one of whom is a woman.",
  );

  await playerLine(page, "Carol").getByLabel("No", { exact: true }).click();
  await expect(playerLine(page, "Carol")).toContainText("will not be playing");
});

test("the shareable single-game URL shows that game with controls", async ({
  page,
}) => {
  await page.goto("/testcats/games/2");
  await expect(page.locator("body")).toContainText("against Wombats");
  await expect(page.locator("body")).toContainText("(the red team)");
  await expect(playerLine(page, "Alice")).toContainText("will be playing");
  await expect(
    page.getByRole("link", { name: "See the whole schedule" }),
  ).toBeVisible();
});

test("the past-games toggle reveals past games and persists", async ({
  page,
}) => {
  await page.goto("/testcats");
  await expect(page.locator("body")).not.toContainText("Marmots");

  await page.getByRole("link", { name: "Show past games" }).click();
  await expect(page.locator("body")).toContainText("Past games:");
  await expect(page.locator("body")).toContainText("Marmots");

  await page.reload();
  await expect(page.locator("body")).toContainText("Marmots");
  await expect(
    page.getByRole("link", { name: "Hide past games" }),
  ).toBeVisible();
});

test("adding a player puts them on the roster and every game", async ({
  page,
}) => {
  await page.goto("/testcats/players");
  await expect(
    page.getByRole("heading", { name: "Manage Player Roster" }),
  ).toBeVisible();

  await page.getByRole("link", { name: "Add new player" }).click();
  await page.getByLabel("Name:").fill("Davina");
  await page.getByLabel("Counts toward the women minimum").check();
  await page.getByRole("button", { name: "SUBMIT" }).click();

  await expect(page.locator("body")).toContainText("Player added");
  await page
    .getByRole("link", { name: "Return to roster management page" })
    .click();
  await expect(page.locator("body")).toContainText("Davina");

  await page.goto("/testcats");
  await expect(playerLine(page, "Davina")).toContainText(
    "hasn't responded yet",
  );
});

test("adding a game shows it under manage games and the schedule", async ({
  page,
}) => {
  await page.goto("/testcats/games");
  await expect(
    page.getByRole("heading", { name: "Manage Games" }),
  ).toBeVisible();

  await page.getByRole("link", { name: "Add new game" }).click();
  await page.getByLabel("Opposing team name").fill("Ocelots");
  await page.getByLabel("Opposing team color").fill("blue");
  await page.getByLabel("Date and time:").fill("2027-09-01T18:30");
  await page.getByRole("button", { name: "SUBMIT" }).click();

  await expect(page.locator("body")).toContainText("Game added");
  await page
    .getByRole("link", { name: "Return to games management page" })
    .click();
  await expect(page.locator("body")).toContainText(/Ocelots on \w+day, September 1, 2027 at 6:30\spm/);

  await page.goto("/testcats");
  await expect(page.locator("body")).toContainText("against Ocelots");
  await expect(page.locator("body")).toContainText("(the blue team)");
});

test("deleting a player asks for confirmation and removes them", async ({
  page,
}) => {
  await page.goto("/testcats/players");
  const carolRow = page.locator("p", { hasText: "Carol" });

  page.on("dialog", (dialog) => {
    expect(dialog.message()).toBe(
      "Do you really want to delete Carol from the roster?",
    );
    void dialog.accept();
  });
  await carolRow.getByRole("link", { name: "Delete" }).click();

  await expect(page.locator("body")).not.toContainText("Carol");
  await page.goto("/testcats");
  await expect(page.locator("body")).not.toContainText("Carol");
});

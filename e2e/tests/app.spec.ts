import { expect, test, type Page } from "@playwright/test";

// Flows against the seeded Testcats team (see global-setup.ts):
// players Alice (captain, counts toward minimum), Bob, Carol; a past
// game vs Marmots; a future game vs Wombats where Alice has said yes.
// Every test browses as signed-in Alice via the storageState cookie.
//
// The tests mutate shared state, so they run in order in one worker.
test.describe.configure({ mode: "serial" });

function playerRow(page: Page, name: string) {
  return page.getByTestId("player-row").filter({ hasText: name });
}

test("marking attendance inline updates the row and the roster report", async ({
  page,
}) => {
  await page.goto("/testcats");
  await expect(
    page.getByRole("heading", { name: "Testcats Game Schedule" }),
  ).toBeVisible();

  const bob = playerRow(page, "Bob");
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

  await playerRow(page, "Carol").getByLabel("No", { exact: true }).click();
  await expect(playerRow(page, "Carol")).toContainText("will not be playing");
});

test("the shareable single-game URL shows that game with controls", async ({
  page,
}) => {
  await page.goto("/testcats/games/2");
  await expect(page.locator("body")).toContainText("against Wombats");
  await expect(page.locator("body")).toContainText("(the red team)");
  await expect(playerRow(page, "Alice")).toContainText("will be playing");
  await expect(
    page.getByRole("link", { name: "See the whole schedule" }),
  ).toBeVisible();
});

test("the personal question card asks about the game and saves a status", async ({
  page,
}) => {
  // On the schedule it's about the next upcoming non-bye game (Wombats),
  // addressed to the signed-in player with their status preselected.
  await page.goto("/testcats");
  const card = page.getByTestId("personal-question");
  await expect(card).toContainText(
    /Alice, will you be coming to the game on .+ against Wombats at .+\?/,
  );
  await expect(card.getByLabel("Yes", { exact: true })).toBeChecked();

  await card.getByLabel("Not sure", { exact: true }).click();
  await expect(card.getByLabel("Not sure", { exact: true })).toBeChecked();
  await expect(playerRow(page, "Alice")).toContainText("isn't sure");

  // The single-game page asks about that specific game.
  await page.goto("/testcats/games/2");
  await expect(page.getByTestId("personal-question")).toContainText(
    "against Wombats",
  );
});

test("the past-games toggle reveals past games and persists", async ({
  page,
}) => {
  await page.goto("/testcats");
  await expect(page.locator("body")).not.toContainText("Marmots");

  await page.getByRole("button", { name: "Show past games" }).click();
  await expect(page.locator("body")).toContainText("Past games");
  await expect(page.locator("body")).toContainText("Marmots");

  await page.reload();
  await expect(page.locator("body")).toContainText("Marmots");
  await expect(
    page.getByRole("button", { name: "Hide past games" }),
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
  await page.getByLabel("Name").fill("Davina");
  await page.getByLabel("Counts toward the women minimum").check();
  await page.getByRole("button", { name: "Save" }).click();

  await expect(page.locator("body")).toContainText("Player added");
  await page
    .getByRole("link", { name: "Return to roster management page" })
    .click();
  await expect(page.locator("body")).toContainText("Davina");

  await page.goto("/testcats");
  await expect(playerRow(page, "Davina")).toContainText(
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
  await page.getByLabel("Date and time").fill("2027-09-01T18:30");
  await page.getByRole("button", { name: "Save" }).click();

  await expect(page.locator("body")).toContainText("Game added");
  await page
    .getByRole("link", { name: "Return to games management page" })
    .click();
  await expect(page.locator("body")).toContainText(
    /Ocelots on \w+day, September 1, 2027 at 6:30\spm/,
  );

  await page.goto("/testcats");
  await expect(page.locator("body")).toContainText("against Ocelots");
  await expect(page.locator("body")).toContainText("(the blue team)");
});

test("removing a player is reversible: former players list, dead link, add back", async ({
  page,
}) => {
  await page.goto("/testcats/players");
  const carolRow = page.locator("li", { hasText: "Carol" });

  page.on("dialog", (dialog) => {
    expect(dialog.message()).toBe(
      "Remove Carol from the roster? Their game history stays, " +
        "and a captain can add them back later.",
    );
    void dialog.accept();
  });
  await carolRow.getByRole("button", { name: "Remove" }).click();

  await expect(
    page.locator("li", { hasText: "Carol" }).getByRole("button", {
      name: "Remove",
    }),
  ).toHaveCount(0);
  await page.goto("/testcats");
  await expect(page.locator("body")).not.toContainText("Carol");

  // Her join link now gets the distinct departed wall — not the
  // invalid-link one. (No cookie is set, so we stay signed in as Alice.)
  await page.goto("/join/e2e-carol-token");
  await expect(page).toHaveURL("/?join=departed&team=Testcats");
  await expect(page.locator("body")).toContainText(
    "You’re no longer on the Testcats roster",
  );
  await expect(page.locator("body")).toContainText(
    "ask your captain to add you back",
  );

  // Alice (a captain) sees her under Former players and adds her back.
  await page.goto("/testcats/players");
  await page.getByRole("button", { name: "Show former players" }).click();
  await expect(page.locator("body")).toContainText("Former players");
  const formerCarol = page.locator("li", { hasText: "Carol" });
  await expect(formerCarol).toContainText("Left");
  await formerCarol.getByRole("button", { name: "Add back" }).click();

  await expect(page.locator("body")).toContainText("No former players.");
  await expect(
    page.locator("li", { hasText: "Carol" }).getByRole("button", {
      name: "Remove",
    }),
  ).toBeVisible();
});

test("visiting / while signed in forwards to the team", async ({ page }) => {
  // The PWA start URL is "/": a signed-in visitor is forwarded to the
  // team they last visited (remembered in localStorage).
  await page.goto("/testcats");
  await expect(
    page.getByRole("heading", { name: "Testcats Game Schedule" }),
  ).toBeVisible();

  await page.goto("/");
  await expect(page).toHaveURL("/testcats");
});

test("a walled-off team URL explains itself instead of silently forwarding", async ({
  page,
}) => {
  // Alice's session is for Testcats only; the API 401s any other slug
  // identically (real team or not). Instead of silently landing her on
  // Testcats, the wall explains one-team-at-a-time and offers the link.
  await page.goto("/testcats");
  await expect(
    page.getByRole("heading", { name: "Testcats Game Schedule" }),
  ).toBeVisible();

  await page.goto("/otters");
  await expect(page).toHaveURL("/?from=otters");
  await expect(page.locator("body")).toContainText(
    "Ask your captain for your link.",
  );
  await expect(page.locator("body")).toContainText(
    "You can only be signed into one team at a time.",
  );
  await expect(page.locator("body")).toContainText("“otters”");

  await page.getByRole("link", { name: "Go to Testcats" }).click();
  await expect(
    page.getByRole("heading", { name: "Testcats Game Schedule" }),
  ).toBeVisible();
});

test("a captain can see, copy, regenerate, and revoke join links", async ({
  page,
}) => {
  page.on("dialog", (dialog) => void dialog.accept());

  await page.goto("/testcats");
  // The Access nav item is captain-only; Alice is the captain.
  await page.getByRole("link", { name: "Access" }).click();
  await expect(
    page.getByRole("heading", { name: "Manage Team Access" }),
  ).toBeVisible();

  // Desktop viewport (≥1024px): every link is visible in the table.
  const bobRow = page.getByTestId("access-row").filter({ hasText: "Bob" });
  await expect(bobRow).toContainText("/join/e2e-bob-token");

  await bobRow.getByRole("button", { name: "Regenerate" }).click();
  await expect(bobRow).not.toContainText("/join/e2e-bob-token");
  await expect(bobRow).toContainText("/join/");

  await bobRow.getByRole("button", { name: "Revoke" }).click();
  await expect(bobRow).toContainText("Link revoked");
  await expect(bobRow).not.toContainText("/join/");
});

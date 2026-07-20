import { expect, request as pwRequest, test, type Page } from "@playwright/test";

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
    page.getByRole("heading", { name: "Testcats Schedule" }),
  ).toBeVisible();

  const bob = playerRow(page, "Bob");
  await expect(bob).toContainText("hasn't responded");
  await expect(page.locator("body")).toContainText(
    "So far we have one player, one of whom is a woman.",
  );

  // Editing is on demand, and only one roster row is open at a time.
  await bob.click();
  await expect(bob.getByTestId("attendance-editor")).toBeVisible();
  const carol = playerRow(page, "Carol");
  await carol.click();
  await expect(bob.getByTestId("attendance-editor")).toHaveCount(0);
  await expect(carol.getByTestId("attendance-editor")).toBeVisible();
  await bob.click();
  await bob.getByLabel("Yes", { exact: true }).click();

  await expect(bob).toContainText("will be playing");
  // The selected answer shows briefly, then the row collapses.
  await expect(bob.getByTestId("attendance-editor")).toHaveCount(0);
  await expect(bob.getByLabel("Playing")).toBeVisible();
  await expect(page.locator("body")).toContainText(
    "So far we have two players, one of whom is a woman.",
  );

  await carol.click();
  await carol.getByLabel("No", { exact: true }).click();
  await expect(carol).toContainText("will not be playing");
});

test("the shareable single-game URL shows that game with controls", async ({
  page,
}) => {
  await page.goto("/testcats/games/2");
  await expect(page.locator("body")).toContainText("Wombats");
  await expect(page.locator("body")).toContainText("the red team");
  await expect(playerRow(page, "Alice")).toContainText("will be playing");
  await expect(
    page.getByRole("link", { name: "See the whole schedule" }),
  ).toBeVisible();
});

test("the status strip jumps to the signed-in player's editor and persists after answering", async ({ page }) => {
  await page.goto("/testcats");
  const strip = page.getByTestId("status-strip");
  await expect(strip).toContainText(/You: playing .+ ✓/);
  await strip.click();
  const alice = playerRow(page, "Alice");
  await expect(alice.getByTestId("attendance-editor")).toBeVisible();
  await expect(alice).toContainText("Alice, will you be playing?");
  await alice.getByLabel("Not sure", { exact: true }).click();
  await expect(alice).toContainText("isn't sure");
  await expect(alice.getByTestId("attendance-editor")).toHaveCount(0);
  await expect(strip).toContainText(/You: not sure for .+ →/);

  await page.goto("/testcats/games/2");
  await expect(page.getByTestId("status-strip")).toBeVisible();
});

test("the past-games toggle reveals past games and persists", async ({
  page,
}) => {
  await page.goto("/testcats");
  await expect(page.locator("body")).not.toContainText("Marmots");

  await page.getByRole("button", { name: "Show past games" }).click();
  await expect(page.locator("body")).toContainText("Past games");
  await expect(page.locator("body")).toContainText("Marmots");

  // The Marmots game is past the attendance lock: past-tense report with
  // no quota clause, "didn't respond" rows, and no attendance controls.
  const marmots = page.locator("section", { hasText: "Marmots" });
  await expect(marmots).toContainText("1 confirmed attendance");
  await marmots.getByRole("button").click();
  await expect(marmots).toContainText("One player confirmed they were playing.");
  await expect(marmots.getByTestId("player-row").first()).toContainText(
    "didn't respond",
  );
  await expect(marmots.getByRole("radio")).toHaveCount(0);

  await page.reload();
  await expect(page.locator("body")).toContainText("Marmots");
  await expect(
    page.getByRole("button", { name: "Hide past games" }),
  ).toBeVisible();
});

test("adding a player inline puts them on the roster and every game", async ({
  page,
}) => {
  await page.goto("/testcats/players");
  await expect(page.getByRole("heading", { name: "Players" })).toBeVisible();

  // Add is the final row of the table and expands to the inline form.
  await page.getByTestId("add-player-row").click();
  await page.getByLabel("Name").fill("Davina");
  await page.getByLabel(/Woman/).check();
  await page.getByRole("button", { name: "Add", exact: true }).click();

  // Collapses after the save; the new row shows Name + quota noun.
  const davina = page.getByTestId("player-row").filter({ hasText: "Davina" });
  await expect(davina).toBeVisible();
  await expect(davina).toContainText("Woman");
  await expect(page.getByLabel("Name")).toHaveCount(0);

  await page.goto("/testcats");
  await expect(playerRow(page, "Davina")).toContainText("hasn't responded");
});

test("editing a player inline is pessimistic: Saving…, Saved ✓, then collapse", async ({
  page,
}) => {
  await page.goto("/testcats/players");

  // Hold the PUT long enough to observe the pending label.
  await page.route("**/api/teams/testcats/players/*", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 600));
    await route.continue();
  });

  const davina = page.getByTestId("player-row").filter({ hasText: "Davina" });
  await davina.click();
  await page.getByLabel("Name").fill("Dee");
  await page.getByRole("button", { name: "Save", exact: true }).click();

  await expect(page.getByRole("button", { name: "Saving…" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Saved ✓" })).toBeVisible();
  await expect(
    page.getByTestId("player-row").filter({ hasText: "Dee" }),
  ).toBeVisible();
  // And it eventually collapses.
  await expect(page.getByLabel("Name")).toHaveCount(0);
  await page.unroute("**/api/teams/testcats/players/*");
});

test("only one row opens at a time; a dirty draft demands a discard decision", async ({
  page,
}) => {
  await page.goto("/testcats/players");
  const bob = page.getByTestId("player-row").filter({ hasText: "Bob" });
  const carol = page.getByTestId("player-row").filter({ hasText: "Carol" });

  // Untouched forms close freely when another row opens.
  await bob.click();
  await expect(page.getByLabel("Name")).toHaveValue("Bob");
  await carol.click();
  await expect(page.getByLabel("Name")).toHaveValue("Carol");

  // A dirty draft intercepts the switch with an inline confirmation.
  await page.getByLabel("Name").fill("Carolyn");
  await bob.click();
  const discard = page.getByTestId("discard-confirm");
  await expect(discard).toContainText("Discard unsaved changes?");
  await discard.getByRole("button", { name: "Keep editing" }).click();
  await expect(page.getByLabel("Name")).toHaveValue("Carolyn");

  // Navigating away from the dirty draft is also intercepted.
  await page.getByRole("link", { name: "Games" }).click();
  await expect(page).toHaveURL("/testcats/players");
  await expect(page.getByTestId("discard-confirm")).toBeVisible();
  await page.getByRole("button", { name: "Keep editing" }).click();

  // Discarding opens the row the user was headed to, values untouched.
  await bob.click();
  await page.getByTestId("discard-confirm").getByRole("button", { name: "Discard" }).click();
  await expect(page.getByLabel("Name")).toHaveValue("Bob");
  await expect(carol).toContainText("Carol");

  // Cancel closes an open form without ceremony.
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByLabel("Name")).toHaveCount(0);
});

test("adding and editing games inline, date-first, with inline delete", async ({
  page,
}) => {
  await page.goto("/testcats/games");
  await expect(page.getByRole("heading", { name: "Games" })).toBeVisible();
  await expect(page.locator("body")).toContainText("Past games (1)");

  await page.getByTestId("add-game-row").click();
  await page.getByLabel("Opposing team name").fill("Ocelots");
  await page.getByLabel("Opposing team color").fill("blue");
  await page.getByLabel("Date and time").fill("2027-09-01T18:30");
  await page.getByRole("button", { name: "Add", exact: true }).click();

  // Date-first summary; the year shows because 2027 isn't the current year.
  const ocelots = page.getByTestId("game-row").filter({ hasText: "Ocelots" });
  await expect(ocelots).toContainText("Wed, Sep 1, 2027 · 6:30 pm");
  await expect(ocelots).toContainText("blue");

  await page.goto("/testcats");
  await expect(page.locator("body")).toContainText("Ocelots");
  await expect(page.locator("body")).toContainText("the blue team");

  // Inline edit.
  await page.goto("/testcats/games");
  await ocelots.click();
  await page.getByLabel("Opposing team color").fill("navy");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(ocelots).toContainText("navy");
  await expect(page.getByLabel("Opposing team color")).toHaveCount(0);

  // Inline delete names the game and its consequences — no native dialog.
  await ocelots.click();
  await page.getByRole("button", { name: "Delete game…" }).click();
  const confirm = page.getByTestId("delete-game-confirm");
  await expect(confirm).toContainText(
    /Delete the game against Ocelots on \w+day, September 1, 2027 at 6:30\spm\?/,
  );
  await confirm.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(ocelots).toHaveCount(0);
});

test("removing a player is reversible: former players, dead link, guarded purge, add back", async ({
  page,
}) => {
  await page.goto("/testcats/players");
  const carol = page.getByTestId("player-row").filter({ hasText: "Carol" });

  // Remove lives below the inline form, behind an inline confirmation.
  await carol.click();
  await page.getByRole("button", { name: "Remove from roster…" }).click();
  const confirm = page.getByTestId("inline-confirm");
  await expect(confirm).toContainText(
    "Remove Carol from the roster? Their game history stays, and a " +
      "captain can add them back later.",
  );
  await confirm.getByRole("button", { name: "Remove", exact: true }).click();

  await expect(carol).toHaveCount(0);
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

  // Alice (a captain) finds her under the always-counted disclosure.
  await page.goto("/testcats/players");
  await page.getByRole("button", { name: "Former players (1)" }).click();
  const formerCarol = page.getByTestId("former-row").filter({ hasText: "Carol" });
  await expect(formerCarol).toContainText(/2026/);
  await formerCarol.click();

  // Permanent deletion is guarded: Carol has recorded attendance.
  await page.getByRole("button", { name: "Delete permanently…" }).click();
  await page
    .getByTestId("purge-confirm")
    .getByRole("button", { name: "Delete permanently", exact: true })
    .click();
  await expect(page.getByTestId("purge-confirm")).toContainText(
    "Carol has game history",
  );

  // Add back revives the row — the confirmation names the link consequence.
  await page.getByRole("button", { name: "Add back to roster…" }).click();
  const addBack = page.getByTestId("add-back-confirm");
  await expect(addBack).toContainText(
    "Their existing personal link will immediately work again.",
  );
  await addBack.getByRole("button", { name: "Add back", exact: true }).click();
  await expect(addBack).toContainText("Added back ✓");

  await expect(
    page.getByTestId("player-row").filter({ hasText: "Carol" }),
  ).toBeVisible();
  await expect(page.locator("body")).toContainText("Former players (0)");
});

test("a permanent purge deletes a never-played typo from Former players", async ({
  page,
}) => {
  await page.goto("/testcats/players");

  await page.getByTestId("add-player-row").click();
  await page.getByLabel("Name").fill("Typo");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  const typo = page.getByTestId("player-row").filter({ hasText: "Typo" });
  await expect(typo).toBeVisible();

  await typo.click();
  await page.getByRole("button", { name: "Remove from roster…" }).click();
  await page
    .getByTestId("inline-confirm")
    .getByRole("button", { name: "Remove", exact: true })
    .click();
  await expect(typo).toHaveCount(0);

  await page.getByRole("button", { name: "Former players (1)" }).click();
  const formerTypo = page.getByTestId("former-row").filter({ hasText: "Typo" });
  await formerTypo.click();
  await page.getByRole("button", { name: "Delete permanently…" }).click();
  const confirm = page.getByTestId("purge-confirm");
  await expect(confirm).toContainText(
    "Permanently delete Typo? This erases the player entirely and cannot be undone.",
  );
  await confirm
    .getByRole("button", { name: "Delete permanently", exact: true })
    .click();

  await expect(formerTypo).toHaveCount(0);
  await expect(page.locator("body")).toContainText("Former players (0)");
});

test("visiting / while signed in forwards to the team", async ({ page }) => {
  // The PWA start URL is "/": a signed-in visitor is forwarded to the
  // team they last visited (remembered in localStorage).
  await page.goto("/testcats");
  await expect(
    page.getByRole("heading", { name: "Testcats Schedule" }),
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
    page.getByRole("heading", { name: "Testcats Schedule" }),
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
    page.getByRole("heading", { name: "Testcats Schedule" }),
  ).toBeVisible();
});

test.describe("access", () => {
  test.use({ permissions: ["clipboard-read", "clipboard-write"] });

  test("copy, token usage, regenerate, revoke, and recovery", async ({
    page,
    baseURL,
  }) => {
    await page.goto("/testcats");
    // The Access nav item is captain-only; Alice is the captain.
    await page.getByRole("link", { name: "Access" }).click();
    await expect(page.getByRole("heading", { name: "Access" })).toBeVisible();

    const carolRow = page.getByTestId("access-row").filter({ hasText: "Carol" });
    await expect(carolRow).toContainText("Never opened");

    // Copy lives in the collapsed summary, gives feedback, and never
    // toggles the row.
    await carolRow.getByRole("button", { name: "Copy", exact: true }).click();
    await expect(carolRow.getByRole("button", { name: "Copied!" })).toBeVisible();
    await expect(page.getByTestId("join-url")).toHaveCount(0);
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
      "/join/e2e-carol-token",
    );

    // A real join redemption (separate cookie jar — Alice stays signed
    // in here) flips the durable state to Opened.
    const joiner = await pwRequest.newContext({ baseURL });
    await joiner.get("/join/e2e-carol-token");
    await joiner.dispose();
    await page.reload();
    await expect(carolRow).not.toContainText("Never opened");
    await expect(carolRow).toContainText("Opened");

    // Expanding exposes the selectable full URL and the nested manage
    // disclosure.
    await carolRow.click();
    await expect(page.getByTestId("join-url")).toContainText(
      "/join/e2e-carol-token",
    );

    // Regenerate: confirmation names the player; success keeps the row
    // open, highlights the new URL, and resets usage to Never opened.
    await page.getByRole("button", { name: "Manage link" }).click();
    await page.getByRole("button", { name: "Generate a new link…" }).click();
    const regen = page.getByTestId("regenerate-confirm");
    await expect(regen).toContainText("Generate a new link for Carol?");
    await regen.getByRole("button", { name: "Generate new link" }).click();

    const urlBox = page.getByTestId("join-url");
    await expect(urlBox).toContainText("New link generated ✓");
    await expect(urlBox).not.toContainText("e2e-carol-token");
    await expect(
      urlBox.getByRole("button", { name: "Copy new link" }),
    ).toBeVisible();
    await expect(carolRow).toContainText("Never opened");

    // The regenerated-away link is dead.
    const stale = await pwRequest.newContext({ baseURL });
    const staleRes = await stale.get("/join/e2e-carol-token");
    expect(staleRes.url()).toContain("/?join=invalid");
    await stale.dispose();

    // Revoke: success beat, then the collapsed row preserves usage state.
    await page.getByRole("button", { name: "Manage link" }).click();
    await page.getByRole("button", { name: "Revoke access…" }).click();
    const revoke = page.getByTestId("revoke-confirm");
    await expect(revoke).toContainText("Revoke Carol's access?");
    await revoke.getByRole("button", { name: "Revoke", exact: true }).click();
    await expect(revoke).toContainText("Access revoked ✓");
    await expect(carolRow).toContainText("Revoked · never opened");
    await expect(page.getByTestId("join-url")).toHaveCount(0);
    await expect(
      carolRow.getByRole("button", { name: "Copy", exact: true }),
    ).toHaveCount(0);

    // A revoked row expands to the revocation date and the direct
    // recovery action — no Manage link detour.
    await carolRow.click();
    await expect(page.getByText(/Revoked \w+ \d+, \d{4}/)).toBeVisible();
    await page.getByRole("button", { name: "Generate a new link…" }).click();
    await page
      .getByTestId("recover-confirm")
      .getByRole("button", { name: "Generate new link" })
      .click();
    await expect(page.getByTestId("join-url")).toBeVisible();
    await expect(carolRow).toContainText("Never opened");
  });
});

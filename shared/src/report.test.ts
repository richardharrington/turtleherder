import { describe, expect, it } from "vitest";
import { rosterStatus, type RosterRules } from "./engine.js";
import { numWord, pastRosterReport, rosterReport } from "./report.js";

const nouns = {
  quotaNounSingular: "woman",
  quotaNounPlural: "women",
};

const bobcats: RosterRules = {
  fullSide: 7,
  minToPlay: 7,
  menCeiling: null,
  womenFloor: 2,
  floorType: "play_down",
  keeperScoping: "included",
};

const footy: RosterRules = {
  fullSide: 7,
  minToPlay: 5,
  menCeiling: null,
  womenFloor: 2,
  floorType: "play_down",
  keeperScoping: "excluded",
};

const volo: RosterRules = {
  fullSide: 7,
  minToPlay: 5,
  menCeiling: 5,
  womenFloor: 1,
  floorType: "forfeit",
  keeperScoping: "included",
};

function report(rules: RosterRules, men: number, women: number): string[] {
  return rosterReport(rosterStatus(rules, { men, women }), nouns);
}

describe("numWord", () => {
  it("converts integers to words like the original", () => {
    expect(numWord(0)).toBe("zero");
    expect(numWord(1)).toBe("one");
    expect(numWord(21)).toBe("twenty-one");
    expect(numWord(30)).toBe("thirty");
  });

  it("falls back to digits past thirty (the original crashed)", () => {
    expect(numWord(31)).toBe("31");
  });
});

describe("rosterReport", () => {
  it("is silent about surplus when the team is at full strength", () => {
    expect(report(volo, 8, 2)).toEqual([
      "So far we have **ten** players, **two** of whom are women.",
    ]);
  });

  it("renders the plain body-shortfall forfeit branch", () => {
    expect(report(bobcats, 3, 2)).toEqual([
      "So far we have **five** players, **two** of whom are women.",
      "You need **two** more players to avoid forfeit.",
    ]);
  });

  it("merges body and woman shortfalls in the forfeit branch", () => {
    expect(report(volo, 3, 0)).toEqual([
      "So far we have **three** players, **none** of whom are women.",
      "You need **two** more players, **one** of whom must be a woman, to avoid forfeit.",
    ]);
  });

  it("asks only for women when every added player must be a woman", () => {
    expect(report(bobcats, 6, 1)).toEqual([
      "So far we have **seven** players, **one** of whom is a woman.",
      "You need **one** more woman to avoid forfeit.",
    ]);
  });

  it("renders a woman-only path from a legal side to full strength", () => {
    expect(report(footy, 6, 1)).toEqual([
      "So far we have **seven** players, **one** of whom is a woman.",
      "**Six** can play now; with **one** more woman it'll be a full **seven**.",
    ]);
  });

  it("renders a mixed path from a legal side to full strength", () => {
    expect(report(footy, 4, 1)).toEqual([
      "So far we have **five** players, **one** of whom is a woman.",
      "**Five** can play now; with **two** more players, **one** of whom must be a woman, it'll be a full **seven**.",
    ]);
  });

  it("renders a plain body path from a legal side to full strength", () => {
    expect(report(footy, 4, 2)).toEqual([
      "So far we have **six** players, **two** of whom are women.",
      "**Six** can play now; with **one** more player it'll be a full **seven**.",
    ]);
  });

  it("always shows the protected count for gender-constrained teams", () => {
    expect(report(volo, 0, 0)[0]).toBe(
      "So far we have **zero** players, **none** of whom are women.",
    );
  });

  it("omits the protected count and wording for a genderless team", () => {
    const genderless: RosterRules = {
      fullSide: 7,
      minToPlay: 5,
      menCeiling: null,
      womenFloor: null,
      floorType: null,
      keeperScoping: "included",
    };
    expect(report(genderless, 4, 1)).toEqual([
      "So far we have **five** players.",
      "**Five** can play now; with **two** more players it'll be a full **seven**.",
    ]);
  });

  it("uses configured singular nouns and their indefinite article", () => {
    const status = rosterStatus(
      { ...volo, menCeiling: null },
      { men: 3, women: 0 },
    );
    expect(
      rosterReport(status, {
        quotaNounSingular: "adult",
        quotaNounPlural: "adults",
      })[1],
    ).toBe(
      "You need **two** more players, **one** of whom must be an adult, to avoid forfeit.",
    );
  });

  it("reports a past game in past tense with no quota clause", () => {
    expect(pastRosterReport(7)).toEqual([
      "**Seven** players confirmed they were playing.",
    ]);
  });

  it("keeps the singular for one past confirmation", () => {
    expect(pastRosterReport(1)).toEqual([
      "**One** player confirmed they were playing.",
    ]);
  });

  it("says 'No players' when nobody confirmed a past game", () => {
    expect(pastRosterReport(0)).toEqual([
      "**No** players confirmed they were playing.",
    ]);
  });
});

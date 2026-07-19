import { describe, expect, it } from "vitest";
import {
  numWord,
  pastRosterReport,
  rosterReport,
  type ReportInput,
} from "./report.js";

// The classic bobcats configuration: 7 players minimum, 2 must be women.
function bobcats(attendingTotal: number, attendingQuota: number): ReportInput {
  return {
    attendingTotal,
    attendingQuota,
    minPlayers: 7,
    minQuotaPlayers: 2,
    quotaNounSingular: "woman",
    quotaNounPlural: "women",
  };
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
  it("says only what we have when both quotas are met", () => {
    expect(rosterReport(bobcats(7, 2))).toEqual([
      "So far we have **seven** players, **two** of whom are women.",
    ]);
  });

  it("asks for quota players when there are enough bodies", () => {
    expect(rosterReport(bobcats(7, 0))).toEqual([
      "So far we have **seven** players, **none** of whom are women.",
      "We need **two** more women.",
    ]);
  });

  it("uses the singular quota noun for a shortfall of one", () => {
    expect(rosterReport(bobcats(8, 1))).toEqual([
      "So far we have **eight** players, **one** of whom is a woman.",
      "We need **one** more woman.",
    ]);
  });

  it("handles 'who must be a woman' when needs coincide at one", () => {
    expect(rosterReport(bobcats(6, 1))).toEqual([
      "So far we have **six** players, **one** of whom is a woman.",
      "At a minimum we need **one** more player, who must be a woman.",
    ]);
  });

  it("handles 'both of whom' when needs coincide at two", () => {
    expect(rosterReport(bobcats(5, 0))).toEqual([
      "So far we have **five** players, **none** of whom are women.",
      "At a minimum we need **two** more players, **both** of whom must be women.",
    ]);
  });

  it("handles 'all of whom' when needs coincide above two", () => {
    // 4 of 7 players, none of 3 quota players: both shortfalls are 3.
    expect(rosterReport({ ...bobcats(4, 0), minQuotaPlayers: 3 })).toEqual([
      "So far we have **four** players, **none** of whom are women.",
      "At a minimum we need **three** more players, **all** of whom must be women.",
    ]);
  });

  it("handles 'N of whom' when fewer quota players than total are needed", () => {
    expect(rosterReport(bobcats(3, 0))).toEqual([
      "So far we have **three** players, **none** of whom are women.",
      "At a minimum we need **four** more players, **two** of whom must be women.",
    ]);
  });

  it("counts the quota shortfall as the player shortfall when it dominates", () => {
    // 6 players, none women: roster shortfall 1, quota shortfall 2 — the
    // original took the max.
    expect(rosterReport(bobcats(6, 0))).toEqual([
      "So far we have **six** players, **none** of whom are women.",
      "At a minimum we need **two** more players, **both** of whom must be women.",
    ]);
  });

  it("skips the quota clause entirely for single-sex teams", () => {
    expect(
      rosterReport({
        attendingTotal: 5,
        attendingQuota: 0,
        minPlayers: 7,
        minQuotaPlayers: 0,
        quotaNounSingular: "woman",
        quotaNounPlural: "women",
      }),
    ).toEqual([
      "So far we have **five** players.",
      "At a minimum we need **two** more players.",
    ]);
  });

  it("handles nobody coming", () => {
    expect(rosterReport(bobcats(0, 0))).toEqual([
      "So far we have **zero** players.",
      "At a minimum we need **seven** more players, **two** of whom must be women.",
    ]);
  });

  it("says 'all of whom are' when everyone attending counts", () => {
    expect(rosterReport(bobcats(7, 7))).toEqual([
      "So far we have **seven** players, **all** of whom are women.",
    ]);
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

  it("uses 'an' for vowel-initial quota nouns", () => {
    expect(
      rosterReport({
        attendingTotal: 6,
        attendingQuota: 0,
        minPlayers: 7,
        minQuotaPlayers: 1,
        quotaNounSingular: "adult",
        quotaNounPlural: "adults",
      })[1],
    ).toBe("At a minimum we need **one** more player, who must be an adult.");
  });
});

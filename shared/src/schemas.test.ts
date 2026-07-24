import { describe, expect, it } from "vitest";
import { createTeamInputSchema, slugifyTeamName, teamSchema } from "./schemas.js";

const team = {
  id: 1,
  name: "Bobcats",
  slug: "bobcats",
  fullSide: 7,
  minToPlay: 7,
  menCeiling: null,
  womenFloor: 2,
  floorType: "play_down" as const,
  keeperScoping: "included" as const,
  quotaNounSingular: "woman",
  quotaNounPlural: "women",
  restrictingNounSingular: null,
  restrictingNounPlural: null,
  setupCompletedAt: "2026-07-24T12:00:00.000Z",
  timezone: "America/New_York",
};

describe("teamSchema coed rules", () => {
  it("accepts genderless, floor, and ceiling-only teams", () => {
    expect(teamSchema.safeParse(team).success).toBe(true);
    expect(
      teamSchema.safeParse({ ...team, keeperScoping: "none" }).success,
    ).toBe(true);
    expect(
      teamSchema.safeParse({
        ...team,
        womenFloor: null,
        floorType: null,
        quotaNounSingular: null,
        quotaNounPlural: null,
      }).success,
    ).toBe(true);
    expect(
      teamSchema.safeParse({
        ...team,
        menCeiling: 5,
        womenFloor: null,
        floorType: null,
        restrictingNounSingular: "man",
        restrictingNounPlural: "men",
      }).success,
    ).toBe(true);
  });

  it("requires floorType with womenFloor and nouns with any gender constraint", () => {
    expect(teamSchema.safeParse({ ...team, floorType: null }).success).toBe(false);
    expect(
      teamSchema.safeParse({
        ...team,
        womenFloor: null,
        floorType: "forfeit",
      }).success,
    ).toBe(false);
    expect(
      teamSchema.safeParse({ ...team, quotaNounPlural: null }).success,
    ).toBe(false);
  });
});

const creation = {
  name: "Brooklyn Bocce",
  slug: "brooklyn-bocce",
  fullSide: 7,
  minToPlay: 5,
  menCeiling: null,
  womenFloor: null,
  floorType: null,
  keeperScoping: "included" as const,
  quotaNounSingular: null,
  quotaNounPlural: null,
  restrictingNounSingular: null,
  restrictingNounPlural: null,
  timezone: "America/New_York",
  captain: "Alison Bechdel",
  website: "",
};

describe("createTeamInputSchema", () => {
  it("accepts genderless and ceiling-only teams and enforces side sizes", () => {
    expect(createTeamInputSchema.safeParse(creation).success).toBe(true);
    expect(
      createTeamInputSchema.safeParse({
        ...creation,
        keeperScoping: "none",
      }).success,
    ).toBe(true);
    expect(
      createTeamInputSchema.safeParse({
        ...creation,
        menCeiling: 5,
        quotaNounSingular: "woman",
        quotaNounPlural: "women",
        restrictingNounSingular: "man",
        restrictingNounPlural: "men",
      }).success,
    ).toBe(true);
    expect(
      createTeamInputSchema.safeParse({ ...creation, minToPlay: 8 }).success,
    ).toBe(false);
  });

  it("rejects reserved slugs", () => {
    for (const slug of ["join", "api", "create", "assets", "health"]) {
      expect(createTeamInputSchema.safeParse({ ...creation, slug }).success).toBe(false);
    }
  });

  it("slugifies a visible team name", () => {
    expect(slugifyTeamName("  Café Rovers!  ")).toBe("cafe-rovers");
  });
});

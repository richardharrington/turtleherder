import { describe, expect, it } from "vitest";
import { teamSchema } from "./schemas.js";

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
  timezone: "America/New_York",
};

describe("teamSchema coed rules", () => {
  it("accepts matching women-floor and floor-type values", () => {
    expect(teamSchema.safeParse(team).success).toBe(true);
    expect(
      teamSchema.safeParse({
        ...team,
        womenFloor: null,
        floorType: null,
      }).success,
    ).toBe(true);
  });

  it("requires floorType if and only if womenFloor is set", () => {
    expect(teamSchema.safeParse({ ...team, floorType: null }).success).toBe(false);
    expect(
      teamSchema.safeParse({
        ...team,
        womenFloor: null,
        floorType: "forfeit",
      }).success,
    ).toBe(false);
  });
});

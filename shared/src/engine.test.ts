import { describe, expect, it } from "vitest";
import {
  rosterStatus,
  type RosterRules,
  type RosterStatus,
  type Turnout,
} from "./engine.js";

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

const nsc: RosterRules = {
  fullSide: 7,
  minToPlay: 4,
  menCeiling: 4,
  womenFloor: null,
  floorType: null,
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

function status(
  rules: RosterRules,
  men: number,
  women: number,
): RosterStatus {
  return rosterStatus(rules, { men, women });
}

function expectStatus(
  rules: RosterRules,
  turnout: Turnout,
  expected: Partial<RosterStatus>,
) {
  expect(rosterStatus(rules, turnout)).toMatchObject(expected);
}

describe("rosterStatus", () => {
  it("echoes the turnout, full side, and presence of a gender constraint", () => {
    expect(status(bobcats, 3, 2)).toMatchObject({
      attendingTotal: 5,
      attendingQuota: 2,
      fullSide: 7,
      hasGenderConstraint: true,
    });
  });

  it.each([
    {
      name: "Bobcats: body shortfall below a no-shorthanded minimum",
      rules: bobcats,
      turnout: { men: 3, women: 2 },
      expected: {
        canField: false,
        sideSize: 0,
        atFullStrength: false,
        playersNeeded: 2,
        womenNeeded: 0,
      },
    },
    {
      name: "Bobcats: full side",
      rules: bobcats,
      turnout: { men: 5, women: 2 },
      expected: {
        canField: true,
        sideSize: 7,
        atFullStrength: true,
        playersNeeded: 0,
        womenNeeded: 0,
      },
    },
    {
      name: "Bobcats: soft floor still leaves a no-shorthanded forfeit",
      rules: bobcats,
      turnout: { men: 6, women: 1 },
      expected: {
        canField: false,
        sideSize: 0,
        atFullStrength: false,
        playersNeeded: 1,
        womenNeeded: 1,
      },
    },
    {
      name: "NYC Footy: 6 men and 1 woman play six",
      rules: footy,
      turnout: { men: 6, women: 1 },
      expected: {
        canField: true,
        sideSize: 6,
        atFullStrength: false,
        playersNeeded: 1,
        womenNeeded: 1,
      },
    },
    {
      name: "NYC Footy: five men play five",
      rules: footy,
      turnout: { men: 5, women: 0 },
      expected: {
        canField: true,
        sideSize: 5,
        atFullStrength: false,
        playersNeeded: 2,
        womenNeeded: 2,
      },
    },
    {
      name: "NYC Footy: mixed full-side shortfall",
      rules: footy,
      turnout: { men: 4, women: 1 },
      expected: {
        canField: true,
        sideSize: 5,
        atFullStrength: false,
        playersNeeded: 2,
        womenNeeded: 1,
      },
    },
    {
      name: "NYC Footy: floor met but one body short",
      rules: footy,
      turnout: { men: 4, women: 2 },
      expected: {
        canField: true,
        sideSize: 6,
        atFullStrength: false,
        playersNeeded: 1,
        womenNeeded: 0,
      },
    },
    {
      name: "NYC Footy: two bodies short of the forfeit line",
      rules: footy,
      turnout: { men: 3, women: 0 },
      expected: {
        canField: false,
        sideSize: 0,
        atFullStrength: false,
        playersNeeded: 2,
        womenNeeded: 0,
      },
    },
    {
      name: "NSC: excluded keeper is a fifth man",
      rules: nsc,
      turnout: { men: 8, women: 0 },
      expected: {
        canField: true,
        sideSize: 5,
        atFullStrength: false,
        playersNeeded: 2,
        womenNeeded: 2,
      },
    },
    {
      name: "NSC: cap-only rules still need women for a full side",
      rules: nsc,
      turnout: { men: 4, women: 0 },
      expected: {
        canField: true,
        sideSize: 4,
        atFullStrength: false,
        playersNeeded: 3,
        womenNeeded: 2,
      },
    },
    {
      name: "Volo: surplus men are silent",
      rules: volo,
      turnout: { men: 8, women: 2 },
      expected: {
        canField: true,
        sideSize: 7,
        atFullStrength: true,
        playersNeeded: 0,
        womenNeeded: 0,
      },
    },
    {
      name: "Volo: hard floor met but full side needs another woman",
      rules: volo,
      turnout: { men: 6, women: 1 },
      expected: {
        canField: true,
        sideSize: 6,
        atFullStrength: false,
        playersNeeded: 1,
        womenNeeded: 1,
      },
    },
    {
      name: "Volo: bodies meet the minimum but hard floor does not",
      rules: volo,
      turnout: { men: 5, women: 0 },
      expected: {
        canField: false,
        sideSize: 0,
        atFullStrength: false,
        playersNeeded: 1,
        womenNeeded: 1,
      },
    },
    {
      name: "Volo: body and hard-floor shortfalls combine",
      rules: volo,
      turnout: { men: 3, women: 0 },
      expected: {
        canField: false,
        sideSize: 0,
        atFullStrength: false,
        playersNeeded: 2,
        womenNeeded: 1,
      },
    },
  ])("$name", ({ rules, turnout, expected }) => {
    expectStatus(rules, turnout, expected);
  });

  it("does not show a gender constraint for a genuinely genderless ruleset", () => {
    expect(
      status(
        {
          fullSide: 7,
          minToPlay: 5,
          menCeiling: null,
          womenFloor: null,
          floorType: null,
          keeperScoping: "included",
        },
        3,
        1,
      ),
    ).toMatchObject({
      hasGenderConstraint: false,
      playersNeeded: 1,
      womenNeeded: 0,
    });
  });
});

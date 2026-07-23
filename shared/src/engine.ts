export interface RosterRules {
  fullSide: number;
  minToPlay: number;
  menCeiling: number | null;
  womenFloor: number | null;
  floorType: "play_down" | "forfeit" | null;
  keeperScoping: "included" | "excluded";
}

export interface Turnout {
  /** Attending players who do not count toward the protected minimum. */
  men: number;
  /** Attending players who count toward the protected minimum. */
  women: number;
}

export interface RosterStatus {
  attendingTotal: number;
  attendingQuota: number;
  fullSide: number;
  canField: boolean;
  sideSize: number;
  atFullStrength: boolean;
  playersNeeded: number;
  womenNeeded: number;
  hasGenderConstraint: boolean;
}

interface CompiledRules {
  fullSide: number;
  minToPlay: number;
  effectiveMenCap: number;
  hardWall: number;
  keeperExcluded: boolean;
}

function compile(rules: RosterRules): CompiledRules {
  const countedFull =
    rules.fullSide - (rules.keeperScoping === "excluded" ? 1 : 0);
  const floorCap =
    rules.floorType === "play_down"
      ? countedFull - rules.womenFloor!
      : Number.POSITIVE_INFINITY;

  return {
    fullSide: rules.fullSide,
    minToPlay: rules.minToPlay,
    effectiveMenCap: Math.min(
      rules.menCeiling ?? Number.POSITIVE_INFINITY,
      floorCap,
    ),
    hardWall:
      rules.floorType === "forfeit" ? rules.womenFloor! : 0,
    keeperExcluded: rules.keeperScoping === "excluded",
  };
}

function countedLineupExists(
  slots: number,
  men: number,
  women: number,
  rules: CompiledRules,
): boolean {
  const minimumWomen = Math.max(
    0,
    rules.hardWall,
    slots - rules.effectiveMenCap,
    slots - men,
  );
  return minimumWomen <= Math.min(slots, women);
}

function legalSideExists(
  sideSize: number,
  turnout: Turnout,
  rules: CompiledRules,
): boolean {
  if (sideSize === 0) return true;

  if (!rules.keeperExcluded) {
    return countedLineupExists(sideSize, turnout.men, turnout.women, rules);
  }

  const countedSlots = sideSize - 1;
  const maleKeeper =
    turnout.men >= 1 &&
    countedLineupExists(
      countedSlots,
      turnout.men - 1,
      turnout.women,
      rules,
    );
  const femaleKeeper =
    turnout.women >= 1 &&
    countedLineupExists(
      countedSlots,
      turnout.men,
      turnout.women - 1,
      rules,
    );
  return maleKeeper || femaleKeeper;
}

function largestLegalSide(
  turnout: Turnout,
  rules: CompiledRules,
): number {
  const largestCandidate = Math.min(
    rules.fullSide,
    turnout.men + turnout.women,
  );
  for (let sideSize = largestCandidate; sideSize > 0; sideSize -= 1) {
    if (legalSideExists(sideSize, turnout, rules)) return sideSize;
  }
  return 0;
}

function shortfallTo(
  target: number,
  turnout: Turnout,
  rules: CompiledRules,
): { playersNeeded: number; womenNeeded: number } {
  for (let playersNeeded = 0; playersNeeded <= target; playersNeeded += 1) {
    for (let womenNeeded = 0; womenNeeded <= playersNeeded; womenNeeded += 1) {
      const augmented = {
        men: turnout.men + playersNeeded - womenNeeded,
        women: turnout.women + womenNeeded,
      };
      if (largestLegalSide(augmented, rules) >= target) {
        return { playersNeeded, womenNeeded };
      }
    }
  }

  // Stored rules are expected to describe a realizable side. Reaching here
  // means the configuration cannot produce its own target at any turnout.
  throw new Error(`Roster rules cannot produce a legal side of ${target}`);
}

/** Compute the largest legal side and the smallest attendance-only repair. */
export function rosterStatus(
  rules: RosterRules,
  turnout: Turnout,
): RosterStatus {
  const compiled = compile(rules);
  const largest = largestLegalSide(turnout, compiled);
  const canField = largest >= rules.minToPlay;
  const sideSize = canField ? largest : 0;
  const atFullStrength = canField && sideSize === rules.fullSide;
  const shortfall = atFullStrength
    ? { playersNeeded: 0, womenNeeded: 0 }
    : shortfallTo(canField ? rules.fullSide : rules.minToPlay, turnout, compiled);

  return {
    attendingTotal: turnout.men + turnout.women,
    attendingQuota: turnout.women,
    fullSide: rules.fullSide,
    canField,
    sideSize,
    atFullStrength,
    ...shortfall,
    hasGenderConstraint:
      rules.menCeiling !== null || rules.womenFloor !== null,
  };
}

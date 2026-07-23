import type { RosterStatus } from "./engine.js";

// The roster report is pure grammar over the rule engine's status object.
// Sentences are returned with **number/emphasis words** marked
// markdown-style, exactly as the original wrapped them in <strong>.

export interface QuotaNouns {
  quotaNounSingular: string; // e.g. "woman"
  quotaNounPlural: string; // e.g. "women"
}

const NUM_WORDS = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight",
  "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen",
  "sixteen", "seventeen", "eighteen", "nineteen", "twenty", "twenty-one",
  "twenty-two", "twenty-three", "twenty-four", "twenty-five", "twenty-six",
  "twenty-seven", "twenty-eight", "twenty-nine", "thirty",
];

export function numWord(n: number): string {
  return NUM_WORDS[n] ?? String(n);
}

function players(n: number): string {
  return n === 1 ? "player" : "players";
}

function indefiniteArticle(noun: string): string {
  return /^[aeiou]/i.test(noun) ? "an" : "a";
}

function initialCap(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// The report for a game already played: past tense, and no quota clause at
// all — the quota flag is only ever read for upcoming games (see DESIGN.md's
// Roster history section). "Confirmed" is doing deliberate work: the
// attendance lock means the sentence reports what was *recorded*, not who
// was there.
export function pastRosterReport(attendingTotal: number): string[] {
  const count =
    attendingTotal === 0 ? "No" : initialCap(numWord(attendingTotal));
  return [
    `**${count}** ${players(attendingTotal)} confirmed they were playing.`,
  ];
}

function need(
  playersNeeded: number,
  womenNeeded: number,
  nouns: QuotaNouns,
): string {
  if (womenNeeded === 0) {
    return `**${numWord(playersNeeded)}** more ${players(playersNeeded)}`;
  }

  if (playersNeeded === womenNeeded) {
    const noun =
      womenNeeded === 1 ? nouns.quotaNounSingular : nouns.quotaNounPlural;
    return `**${numWord(womenNeeded)}** more ${noun}`;
  }

  const quota =
    womenNeeded === 1
      ? `${indefiniteArticle(nouns.quotaNounSingular)} ${nouns.quotaNounSingular}`
      : nouns.quotaNounPlural;
  return (
    `**${numWord(playersNeeded)}** more ${players(playersNeeded)}, ` +
    `**${numWord(womenNeeded)}** of whom must be ${quota}`
  );
}

export function rosterReport(
  status: RosterStatus,
  nouns: QuotaNouns,
): string[] {
  const sentences: string[] = [];
  let have =
    `So far we have **${numWord(status.attendingTotal)}** ` +
    players(status.attendingTotal);

  if (status.hasGenderConstraint) {
    if (status.attendingQuota === 0) {
      have += `, **none** of whom are ${nouns.quotaNounPlural}`;
    } else if (status.attendingQuota === 1) {
      have +=
        `, **one** of whom is ${indefiniteArticle(nouns.quotaNounSingular)} ` +
        nouns.quotaNounSingular;
    } else if (status.attendingQuota === status.attendingTotal) {
      have += `, **all** of whom are ${nouns.quotaNounPlural}`;
    } else {
      have +=
        `, **${numWord(status.attendingQuota)}** of whom are ` +
        nouns.quotaNounPlural;
    }
  }
  sentences.push(`${have}.`);

  const shortfall = need(
    status.playersNeeded,
    status.womenNeeded,
    nouns,
  );
  const closesRelativeClause =
    status.playersNeeded > status.womenNeeded && status.womenNeeded > 0
      ? ","
      : "";
  if (!status.canField) {
    sentences.push(
      `You need ${shortfall}${closesRelativeClause} to avoid forfeit.`,
    );
  } else if (!status.atFullStrength) {
    sentences.push(
      `**${initialCap(numWord(status.sideSize))}** can play now; with ` +
        `${shortfall}${closesRelativeClause} it'll be a full ` +
        `**${numWord(status.fullSide)}**.`,
    );
  }

  return sentences;
}

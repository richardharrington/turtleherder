// The roster report: a faithful port of the grammar engine from
// legacy/bobcats/index.php (num_word, sing_plur, and the report-building
// block of printgame), generalized from hardcoded women/men to the team's
// configurable quota noun.
//
// One sentence is reworded out of necessity: the original counted both
// genders ("we have two women and five men, for a total of seven players"),
// which a quota flag can't reproduce. It becomes "So far we have **seven**
// players, **two** of whom are women."
//
// Sentences are returned with **number/emphasis words** marked
// markdown-style, exactly as the original wrapped them in <strong>.

export interface ReportInput {
  /** Players with status "yes" */
  attendingTotal: number;
  /** Players with status "yes" who count toward the minimum */
  attendingQuota: number;
  minPlayers: number;
  minQuotaPlayers: number;
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

// The report for a game already played: past tense, and no quota clause at
// all — the quota flag is only ever read for upcoming games (see DESIGN.md's
// Roster history section). "Confirmed" is doing deliberate work: the
// attendance lock means the sentence reports what was *recorded*, not who
// was there.
export function pastRosterReport(attendingTotal: number): string[] {
  const count =
    attendingTotal === 0
      ? "No"
      : numWord(attendingTotal).charAt(0).toUpperCase() +
        numWord(attendingTotal).slice(1);
  return [
    `**${count}** ${players(attendingTotal)} confirmed they were playing.`,
  ];
}

export function rosterReport(input: ReportInput): string[] {
  const {
    attendingTotal,
    attendingQuota,
    minPlayers,
    minQuotaPlayers,
    quotaNounSingular,
    quotaNounPlural,
  } = input;

  const quotaNeeded = minQuotaPlayers - attendingQuota;
  // As in the original: if the quota shortfall exceeds the roster
  // shortfall, the quota shortfall is how many players we still need.
  const playersNeeded = Math.max(minPlayers - attendingTotal, quotaNeeded);

  const sentences: string[] = [];

  // Sentence 1: what we have.
  let have = `So far we have **${numWord(attendingTotal)}** ${players(attendingTotal)}`;
  if (minQuotaPlayers > 0 && attendingTotal > 0) {
    if (attendingQuota === 0) {
      have += `, **none** of whom are ${quotaNounPlural}`;
    } else if (attendingQuota === 1) {
      have += `, **one** of whom is ${indefiniteArticle(quotaNounSingular)} ${quotaNounSingular}`;
    } else if (attendingQuota === attendingTotal) {
      have += `, **all** of whom are ${quotaNounPlural}`;
    } else {
      have += `, **${numWord(attendingQuota)}** of whom are ${quotaNounPlural}`;
    }
  }
  sentences.push(have + ".");

  // Sentence 2: what we still need.
  if (attendingTotal >= minPlayers && quotaNeeded > 0) {
    // Enough bodies, not enough quota players.
    const noun = quotaNeeded === 1 ? quotaNounSingular : quotaNounPlural;
    sentences.push(`We need **${numWord(quotaNeeded)}** more ${noun}.`);
  } else if (playersNeeded > 0) {
    let need = `At a minimum we need **${numWord(playersNeeded)}** more ${players(playersNeeded)}`;

    // Here's where it gets grammatically hairy (as the original put it).
    if (quotaNeeded > 0) {
      if (quotaNeeded === playersNeeded) {
        if (quotaNeeded === 1) {
          need += `, who must be ${indefiniteArticle(quotaNounSingular)} ${quotaNounSingular}`;
        } else if (quotaNeeded === 2) {
          need += `, **both** of whom must be ${quotaNounPlural}`;
        } else {
          need += `, **all** of whom must be ${quotaNounPlural}`;
        }
      } else {
        need += `, **${numWord(quotaNeeded)}** of whom must be ${quotaNounPlural}`;
      }
    }
    sentences.push(need + ".");
  }
  // If we have enough players and enough quota players, there is no
  // second sentence — same as the original.

  return sentences;
}

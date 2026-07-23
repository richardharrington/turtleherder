import {
  formatShortDate,
  isAttendanceLocked,
  isGamePast,
  pastRosterReport,
  rosterReport,
  rosterStatus,
  type AttendanceStatus,
  type GameWithAttendance,
  type PlayerGameStatus,
  type Team,
} from "@turtleherder/shared";
import { useRef, useState, type Dispatch, type SetStateAction } from "react";
import { useAttendanceMutation } from "./attendance.js";
import { Chevron, Expander, summaryProps } from "./components/disclosure.js";
import { SegmentedControl } from "./components/SegmentedControl.js";
import { formatGameTime } from "./format.js";
import styles from "./GameCard.module.css";

function Bold({ text }: { text: string }) {
  return <>{text.split("**").map((part, i) => i % 2 ? <strong key={i}>{part}</strong> : part)}</>;
}

// Short, semantically colored status words (milestone 5.8). The wording
// stands alone without the color; the color is reinforcement.
const STATUS_PHRASES: Record<AttendanceStatus | "none", string> = {
  yes: "Playing",
  no: "Not playing",
  not_sure: "Not sure",
  none: "No response",
};
const PAST_STATUS_PHRASES: Record<AttendanceStatus | "none", string> = {
  yes: "Confirmed",
  no: "Declined",
  not_sure: "Was unsure",
  none: "No response",
};

export function playerRowId(gameId: number, playerId: number) {
  return `game-${gameId}-player-${playerId}`;
}

// How many says the locked one-liner: honest to the attendance lock,
// singular-aware, "No players confirmed" at zero.
export function confirmedPhrase(count: number): string {
  if (count === 0) return "No players confirmed";
  return `${count} ${count === 1 ? "player" : "players"} confirmed`;
}

function PlayerRow({ player, game, team, meId, past, locked, open, onOpen, onCollapse }: {
  player: PlayerGameStatus;
  game: GameWithAttendance;
  team: Team;
  meId: number;
  past: boolean;
  locked: boolean;
  open: boolean;
  onOpen: () => void;
  onCollapse: () => void;
}) {
  const mutation = useAttendanceMutation(team.slug, game.id, player.playerId);
  // Only the latest tap's success may collapse the row.
  const tapSeq = useRef(0);
  const status = player.status ?? "none";
  const phrase = (past ? PAST_STATUS_PHRASES : STATUS_PHRASES)[status];
  const editable = !locked;

  function choose(next: AttendanceStatus) {
    const tap = ++tapSeq.current;
    // The row may collapse only when both the 500ms confirmation clock
    // (started at the tap) and the server's success have completed.
    const confirmationClock = new Promise((resolve) =>
      window.setTimeout(resolve, 500),
    );
    mutation.mutate(next, {
      onSuccess: async () => {
        await confirmationClock;
        if (tapSeq.current === tap) onCollapse();
      },
    });
  }

  return (
    <li id={playerRowId(game.id, player.playerId)} className={styles.playerRow} data-testid="player-row">
      <div
        className={editable ? `${styles.playerSummary} ${styles.editable}` : styles.playerSummary}
        {...(editable ? summaryProps(open, () => (open ? onCollapse() : onOpen())) : {})}
      >
        <span className={styles.playerName}>{player.name}</span>
        <span className={`${styles.status} ${styles[`status_${status}`]}`} data-testid="player-status">{phrase}</span>
        {editable && <Chevron open={open} />}
      </div>
      {editable && (
        <Expander open={open}>
          {open && (
            <div className={styles.editor} data-testid="attendance-editor">
              <p>{player.playerId === meId ? `${player.name}, will you be playing?` : `Will ${player.name} be playing?`}</p>
              <SegmentedControl
                name={`attendance-${game.id}-${player.playerId}`}
                value={player.status}
                onChange={choose}
              />
              {mutation.isError && (
                <span className="error">Error saving — your answer wasn’t recorded. Tap again to retry.</span>
              )}
            </div>
          )}
        </Expander>
      )}
    </li>
  );
}

function Report({ sentences }: { sentences: string[] }) {
  return <div className={styles.report}>{sentences.map((sentence) => <p key={sentence}><Bold text={sentence} /></p>)}</div>;
}

export function GameCard({ game, team, meId, openRow, onOpenRow }: {
  game: GameWithAttendance;
  team: Team;
  meId: number;
  openRow: string | null;
  onOpenRow: Dispatch<SetStateAction<string | null>>;
}) {
  const shortDate = formatShortDate(game.startsAt, team.timezone);
  const [pastExpanded, setPastExpanded] = useState(false);

  if (game.opponentName === null) {
    return (
      <section className={styles.card} data-testid="game-card">
        <div className={styles.heading}>
          <h3><span className={styles.headingWhen}>{shortDate}</span></h3>
        </div>
        <p className={styles.bye}>Bye week.</p>
      </section>
    );
  }

  const time = formatGameTime(game.startsAt, team.timezone);
  const past = isGamePast(game.startsAt);
  const locked = isAttendanceLocked(game.startsAt);
  const attending = game.players.filter((p) => p.status === "yes");
  const attendingWomen = attending.filter((p) => p.countsTowardMinimum).length;
  const status = rosterStatus(team, {
    men: attending.length - attendingWomen,
    women: attendingWomen,
  });
  const report = past
    ? pastRosterReport(attending.length)
    : rosterReport(status, {
        // The database ties nouns to a women floor. Genderless teams never
        // read these fallbacks; they keep the grammar call's type honest.
        quotaNounSingular: team.quotaNounSingular ?? "player",
        quotaNounPlural: team.quotaNounPlural ?? "players",
      });

  if (past && locked && !pastExpanded) {
    return (
      <section className={`${styles.card} ${styles.pastCard}`} data-testid="game-card">
        <button className={styles.pastSummary} onClick={() => setPastExpanded(true)} aria-expanded="false">
          <span>{shortDate} vs {game.opponentName} — {confirmedPhrase(attending.length)}</span>
          <Chevron open={false} />
        </button>
      </section>
    );
  }

  return (
    <section className={styles.card} data-testid="game-card" data-game-id={game.id}>
      <div className={styles.heading}>
        <h3>
          <span className={styles.headingWhen}>{shortDate} <span className={styles.headingDot}>·</span> {time}</span>
          <span className={styles.headingOpponent}>vs {game.opponentName}</span>
        </h3>
        {game.opponentColor && <p>the {game.opponentColor} team</p>}
        {past && locked && <button className={styles.collapsePast} onClick={() => setPastExpanded(false)}>Collapse</button>}
      </div>
      <Report sentences={report} />
      <ul className={styles.roster}>
        {game.players.map((player) => {
          const key = `${game.id}:${player.playerId}`;
          return <PlayerRow key={player.playerId} player={player} game={game} team={team} meId={meId} past={past} locked={locked} open={openRow === key} onOpen={() => onOpenRow(key)} onCollapse={() => onOpenRow((current) => current === key ? null : current)} />;
        })}
      </ul>
    </section>
  );
}

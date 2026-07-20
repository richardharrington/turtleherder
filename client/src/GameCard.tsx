import {
  isAttendanceLocked,
  isGamePast,
  pastRosterReport,
  rosterReport,
  type AttendanceStatus,
  type GameWithAttendance,
  type PlayerGameStatus,
  type Team,
} from "@turtleherder/shared";
import { ChevronDown, ChevronRight, Pencil } from "lucide-react";
import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { useAttendanceMutation } from "./attendance.js";
import { SegmentedControl } from "./components/SegmentedControl.js";
import { formatGameDate, formatGameTime } from "./format.js";
import styles from "./GameCard.module.css";

function Bold({ text }: { text: string }) {
  return <>{text.split("**").map((part, i) => i % 2 ? <strong key={i}>{part}</strong> : part)}</>;
}

const STATUS_PHRASES: Record<AttendanceStatus | "none", string> = {
  yes: "will be playing",
  no: "will not be playing",
  not_sure: "isn't sure",
  none: "hasn't responded",
};
const PAST_STATUS_PHRASES: Record<AttendanceStatus | "none", string> = {
  yes: "was playing",
  no: "was not playing",
  not_sure: "wasn't sure",
  none: "didn't respond",
};

export function playerRowId(gameId: number, playerId: number) {
  return `game-${gameId}-player-${playerId}`;
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
  const [selected, setSelected] = useState(player.status);
  useEffect(() => setSelected(player.status), [player.status]);
  const status = player.status ?? "none";
  const phrase = (past ? PAST_STATUS_PHRASES : STATUS_PHRASES)[status];
  const editable = !locked;

  function toggle() {
    if (editable) onOpen();
  }

  return (
    <li id={playerRowId(game.id, player.playerId)} className={`${styles.playerRow} ${open ? styles.open : ""}`} data-testid="player-row">
      <div
        className={`${styles.playerSummary} ${editable ? styles.editable : ""}`}
        role={editable ? "button" : undefined}
        tabIndex={editable ? 0 : undefined}
        aria-expanded={editable ? open : undefined}
        onClick={toggle}
        onKeyDown={(event) => {
          if (editable && (event.key === "Enter" || event.key === " ")) {
            event.preventDefault();
            toggle();
          }
        }}
      >
        <span className={`${styles.dot} ${styles[`dot_${status}`]}`} aria-label={status === "yes" ? "Playing" : status === "no" ? "Not playing" : status === "not_sure" ? "Not sure" : "No response"} />
        <span className={styles.playerName}>{player.name}</span>
        <span className={styles.phrase}>{phrase}</span>
        {editable && <span className={styles.edit}><Pencil size={14} aria-hidden /><span>Edit</span></span>}
        {editable && (open ? <ChevronDown className={styles.chevron} size={18} aria-hidden /> : <ChevronRight className={styles.chevron} size={18} aria-hidden />)}
      </div>
      {open && editable && (
        <div className={styles.editor} data-testid="attendance-editor">
          <p>{player.playerId === meId ? `${player.name}, will you be playing?` : `Will ${player.name} be playing?`}</p>
          <SegmentedControl
            name={`attendance-${game.id}-${player.playerId}`}
            value={selected}
            disabled={mutation.isPending}
            onChange={(next) => {
              setSelected(next);
              mutation.mutate(next, {
                onSuccess: () => window.setTimeout(onCollapse, 500),
                onError: () => setSelected(player.status),
              });
            }}
          />
          {mutation.isError && <span className="error">Error saving.</span>}
        </div>
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
  const date = formatGameDate(game.startsAt, team.timezone);
  const shortDate = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: team.timezone }).format(new Date(game.startsAt));
  const [pastExpanded, setPastExpanded] = useState(false);

  if (game.opponentName === null) {
    return <section className={styles.card}><h3 className={styles.heading}>{date}</h3><p className={styles.bye}>Bye week.</p></section>;
  }

  const time = formatGameTime(game.startsAt, team.timezone);
  const past = isGamePast(game.startsAt);
  const locked = isAttendanceLocked(game.startsAt);
  const attending = game.players.filter((p) => p.status === "yes");
  const report = past ? pastRosterReport(attending.length) : rosterReport({
    attendingTotal: attending.length,
    attendingQuota: attending.filter((p) => p.countsTowardMinimum).length,
    minPlayers: team.minPlayers,
    minQuotaPlayers: team.minQuotaPlayers,
    quotaNounSingular: team.quotaNounSingular,
    quotaNounPlural: team.quotaNounPlural,
  });

  if (past && locked && !pastExpanded) {
    return (
      <section className={`${styles.card} ${styles.pastCard}`}>
        <button className={styles.pastSummary} onClick={() => setPastExpanded(true)} aria-expanded="false">
          <span>{shortDate} vs {game.opponentName} — {attending.length} confirmed attendance</span>
          <ChevronRight size={18} aria-hidden />
        </button>
      </section>
    );
  }

  return (
    <section className={styles.card} data-game-id={game.id}>
      <div className={styles.heading}>
        <h3>{date} <span>·</span> {time} <span>·</span> {game.opponentName}</h3>
        {game.opponentColor && <p>the {game.opponentColor} team</p>}
        {past && locked && <button className={styles.collapsePast} onClick={() => setPastExpanded(false)}>Collapse</button>}
      </div>
      <Report sentences={report} />
      <ul className={styles.roster}>
        {game.players.map((player) => {
          const key = `${game.id}:${player.playerId}`;
          return <PlayerRow key={player.playerId} player={player} game={game} team={team} meId={meId} past={past} locked={locked} open={openRow === key} onOpen={() => onOpenRow((current) => current === key ? null : key)} onCollapse={() => onOpenRow((current) => current === key ? null : current)} />;
        })}
      </ul>
    </section>
  );
}

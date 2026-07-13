import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  rosterReport,
  type AttendanceStatus,
  type GameWithAttendance,
  type PlayerGameStatus,
  type Team,
} from "@turtleherder/shared";
import { putAttendance } from "./api.js";
import { formatGameDate, formatGameTime } from "./format.js";

// One game as rendered by the original's printgame(): header, a line per
// player, then the roster report. The original's per-player "Edit" link
// (which led to changeattendance.php) is replaced by inline controls.

// Renders the report's **emphasis** markers as <strong>, as the original did.
function Bold({ text }: { text: string }) {
  return (
    <>
      {text
        .split("**")
        .map((part, i) => (i % 2 === 1 ? <strong key={i}>{part}</strong> : part))}
    </>
  );
}

const STATUS_PHRASES: Record<AttendanceStatus | "none", [string, string]> = {
  yes: ["will be playing", "player-coming"],
  no: ["will not be playing", "player-not-coming"],
  not_sure: ["isn't sure", "player-maybe"],
  none: ["hasn't responded yet", "player-not-responded"],
};

const STATUS_CHOICES: Array<[AttendanceStatus, string]> = [
  ["yes", "Yes"],
  ["no", "No"],
  ["not_sure", "Not sure"],
];

function PlayerLine({
  player,
  game,
  team,
}: {
  player: PlayerGameStatus;
  game: GameWithAttendance;
  team: Team;
}) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (status: AttendanceStatus) =>
      putAttendance(team.slug, game.id, player.playerId, status),
    onSuccess: () => {
      // Refreshes both the schedule list and any single-game page.
      return queryClient.invalidateQueries({ queryKey: ["games", team.slug] });
    },
  });

  const [phrase, phraseClass] = STATUS_PHRASES[player.status ?? "none"];

  return (
    <p className="list1">
      {player.name} <span className={phraseClass}>{phrase}</span>.{" "}
      <span className="style2">
        {STATUS_CHOICES.map(([status, label]) => (
          <label key={status} style={{ marginRight: "0.75em" }}>
            <input
              type="radio"
              name={`attendance-${game.id}-${player.playerId}`}
              checked={player.status === status}
              disabled={mutation.isPending}
              onChange={() => mutation.mutate(status)}
            />
            {label}
          </label>
        ))}
        {mutation.isError && <span className="error"> Error saving.</span>}
      </span>
    </p>
  );
}

export function GameCard({
  game,
  team,
}: {
  game: GameWithAttendance;
  team: Team;
}) {
  const date = formatGameDate(game.startsAt, team.timezone);

  if (game.opponentName === null) {
    return (
      <>
        <p>
          <span className="style3">
            <strong>{date}. </strong>
          </span>
          <span className="style4">Bye week.</span>
        </p>
        <p>&nbsp;</p>
      </>
    );
  }

  const time = formatGameTime(game.startsAt, team.timezone);
  const attending = game.players.filter((p) => p.status === "yes");
  const report = rosterReport({
    attendingTotal: attending.length,
    attendingQuota: attending.filter((p) => p.countsTowardMinimum).length,
    minPlayers: team.minPlayers,
    minQuotaPlayers: team.minQuotaPlayers,
    quotaNounSingular: team.quotaNounSingular,
    quotaNounPlural: team.quotaNounPlural,
  });

  return (
    <>
      <p>
        <span className="style3">
          <strong>{date} </strong>
        </span>
        <span className="style4">
          at {time} against {game.opponentName}
          {game.opponentColor && <> (the {game.opponentColor} team)</>}:
        </span>
      </p>
      {game.players.map((player) => (
        <PlayerLine
          key={player.playerId}
          player={player}
          game={game}
          team={team}
        />
      ))}
      {report.map((sentence) => (
        <p key={sentence}>
          <Bold text={sentence} />
        </p>
      ))}
      <p>&nbsp;</p>
    </>
  );
}

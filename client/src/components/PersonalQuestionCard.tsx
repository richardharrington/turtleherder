import {
  isGamePast,
  type GameWithAttendance,
  type Me,
  type Team,
} from "@turtleherder/shared";
import { useAttendanceMutation } from "../attendance.js";
import { formatGameDate, formatGameTime } from "../format.js";
import { SegmentedControl } from "./SegmentedControl.js";
import styles from "./PersonalQuestionCard.module.css";

// The revived changeattendance.php greeting: the one place the UI uses
// the session's identity. Addressed to the signed-in player about one
// specific (non-bye) game, with their current status preselected.
// Callers decide which game and skip byes. "Will you be coming" is an
// anticipatory question, so it also skips games that have started; during
// the post-game grace window the GameCard's inline controls still work.
export function PersonalQuestionCard({
  team,
  me,
  game,
}: {
  team: Team;
  me: Me;
  game: GameWithAttendance;
}) {
  const mutation = useAttendanceMutation(team.slug, game.id, me.playerId);
  const mine = game.players.find((p) => p.playerId === me.playerId);
  if (!mine || game.opponentName === null || isGamePast(game.startsAt)) {
    return null;
  }

  const date = formatGameDate(game.startsAt, team.timezone);
  const time = formatGameTime(game.startsAt, team.timezone);

  return (
    <section className={styles.card} data-testid="personal-question">
      <h2 className={styles.heading}>Your status for {date}</h2>
      <p className={styles.question}>
        {me.name}, will you be coming to the game on {date} against{" "}
        {game.opponentName} at {time}?
      </p>
      <SegmentedControl
        name={`personal-question-${game.id}`}
        value={mine.status}
        disabled={mutation.isPending}
        onChange={(status) => mutation.mutate(status)}
      />
      {mutation.isError && <p className="error">Error saving.</p>}
    </section>
  );
}

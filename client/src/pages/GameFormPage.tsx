import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { GameInput } from "@turtleherder/shared";
import { useState } from "react";
import { Link, useOutletContext, useParams } from "react-router";
import { createGame, fetchGame, updateGame } from "../api.js";
import { Button } from "../components/Button.js";
import { instantToLocalInput, localInputToInstant } from "../format.js";
import type { TeamOutletContext } from "../TeamLayout.js";
import styles from "./FormPage.module.css";

// Add/edit a game, ported from legacy/bobcats/editgame.php. The six
// date/time dropdowns are one styled native datetime-local input
// (deliberately not a custom picker — REDESIGN.md set that ceiling),
// entered and displayed in the team's timezone. Leaving the opponent
// blank makes a bye week.
export function GameFormPage() {
  const { team } = useOutletContext<TeamOutletContext>();
  const { gameId } = useParams<"gameId">();
  const editing = gameId !== undefined;
  const queryClient = useQueryClient();

  const gameQuery = useQuery({
    queryKey: ["games", team.slug, gameId],
    queryFn: () => fetchGame(team.slug, gameId!),
    enabled: editing,
  });

  const [name, setName] = useState<string | null>(null);
  const [color, setColor] = useState<string | null>(null);
  const [when, setWhen] = useState<string | null>(null);
  const shownName = name ?? gameQuery.data?.opponentName ?? "";
  const shownColor = color ?? gameQuery.data?.opponentColor ?? "";
  const shownWhen =
    when ??
    (gameQuery.data
      ? instantToLocalInput(gameQuery.data.startsAt, team.timezone)
      : "");

  const mutation = useMutation({
    mutationFn: (input: GameInput) =>
      editing
        ? updateGame(team.slug, Number(gameId), input)
        : createGame(team.slug, input),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["games", team.slug] }),
  });

  if (editing && gameQuery.isPending) {
    return <p>Loading…</p>;
  }
  if (editing && gameQuery.isError) {
    return <p className="error">Game not found.</p>;
  }

  if (mutation.isSuccess) {
    return (
      <>
        <p>{editing ? "Game updated" : "Game added"}</p>
        <p>
          <a href={`/${team.slug}/games/new`}>Add another game</a>
        </p>
        <p>
          <Link to={`/${team.slug}/games`}>
            Return to games management page
          </Link>
        </p>
      </>
    );
  }

  return (
    <form
      className={styles.form}
      onSubmit={(e) => {
        e.preventDefault();
        mutation.mutate({
          opponentName: shownName.trim() === "" ? null : shownName.trim(),
          opponentColor: shownColor.trim() === "" ? null : shownColor.trim(),
          startsAt: localInputToInstant(shownWhen, team.timezone),
        });
      }}
    >
      <label className={styles.field}>
        Opposing team name (leave blank for a bye week)
        <input
          type="text"
          value={shownName}
          onChange={(e) => setName(e.target.value)}
        />
      </label>

      <label className={styles.field}>
        Opposing team color (optional)
        <input
          type="text"
          value={shownColor}
          onChange={(e) => setColor(e.target.value)}
        />
      </label>

      <label className={styles.field}>
        Date and time
        <input
          type="datetime-local"
          value={shownWhen}
          onChange={(e) => setWhen(e.target.value)}
          required
        />
      </label>

      <div className={styles.actions}>
        <Button type="submit" disabled={mutation.isPending}>
          Save
        </Button>
        <Link to={`/${team.slug}/games`}>Cancel</Link>
      </div>
      {mutation.isError && (
        <p className="error">Error {editing ? "updating" : "adding"} game</p>
      )}
    </form>
  );
}

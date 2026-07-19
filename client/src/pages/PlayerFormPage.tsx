import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PlayerInput } from "@turtleherder/shared";
import { useState } from "react";
import { Link, useNavigate, useOutletContext, useParams } from "react-router";
import {
  ApiError,
  createPlayer,
  fetchPlayers,
  purgePlayer,
  updatePlayer,
} from "../api.js";
import { Button } from "../components/Button.js";
import type { TeamOutletContext } from "../TeamLayout.js";
import styles from "./FormPage.module.css";

// Add/edit a player, ported from legacy/bobcats/editplayer.php. The
// original's gender radio buttons become the quota checkbox; after a
// successful submit it shows the same follow-up links the original did.
// Editing captains also get the permanent-delete escape hatch for a
// typo'd player who never played.
export function PlayerFormPage() {
  const { team, me } = useOutletContext<TeamOutletContext>();
  const { playerId } = useParams<"playerId">();
  const editing = playerId !== undefined;
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // There's no single-player endpoint; the roster list is tiny and
  // usually already cached.
  const playersQuery = useQuery({
    queryKey: ["players", team.slug],
    queryFn: () => fetchPlayers(team.slug),
    enabled: editing,
  });
  const player = editing
    ? playersQuery.data?.find((p) => p.id === Number(playerId))
    : undefined;

  const [name, setName] = useState<string | null>(null);
  const [counts, setCounts] = useState<boolean | null>(null);
  const shownName = name ?? player?.name ?? "";
  const shownCounts = counts ?? player?.countsTowardMinimum ?? false;

  const mutation = useMutation({
    mutationFn: (input: PlayerInput) =>
      editing
        ? updatePlayer(team.slug, Number(playerId), input)
        : createPlayer(team.slug, input),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ["players", team.slug] }),
        queryClient.invalidateQueries({ queryKey: ["games", team.slug] }),
      ]),
  });

  // Purge is the hard delete — captain-only, and the server refuses (409)
  // when the player has any attendance history.
  const purgeMutation = useMutation({
    mutationFn: () => purgePlayer(team.slug, Number(playerId)),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["players", team.slug] });
      await navigate(`/${team.slug}/players`);
    },
  });

  if (editing && playersQuery.isPending) {
    return <p>Loading…</p>;
  }
  if (editing && (playersQuery.isError || !player)) {
    return <p className="error">Player not found.</p>;
  }

  if (mutation.isSuccess) {
    return (
      <>
        <p>{editing ? "Player updated" : "Player added"}</p>
        <p>
          <a href={`/${team.slug}/players/new`}>Add another player</a>
        </p>
        <p>
          <Link to={`/${team.slug}/players`}>
            Return to roster management page
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
          name: shownName.trim(),
          countsTowardMinimum: shownCounts,
        });
      }}
    >
      <label className={styles.field}>
        Name
        <input
          type="text"
          value={shownName}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </label>

      <label className={styles.checkboxField}>
        <input
          type="checkbox"
          checked={shownCounts}
          onChange={(e) => setCounts(e.target.checked)}
        />
        Counts toward the {team.quotaNounPlural} minimum
      </label>

      <div className={styles.actions}>
        <Button type="submit" disabled={mutation.isPending}>
          Save
        </Button>
        <Link to={`/${team.slug}/players`}>Cancel</Link>
      </div>
      {mutation.isError && (
        <p className="error">
          Error {editing ? "updating" : "adding"} player
        </p>
      )}

      {editing && me.isCaptain && player && (
        <div className={styles.dangerZone}>
          <Button
            type="button"
            variant="danger"
            small
            disabled={purgeMutation.isPending}
            onClick={() => {
              if (
                window.confirm(
                  `Permanently delete ${player.name}? This erases the player ` +
                    `entirely and cannot be undone. (For someone leaving the ` +
                    `team, use Remove on the roster page instead.)`,
                )
              ) {
                purgeMutation.mutate();
              }
            }}
          >
            Delete permanently
          </Button>
          {purgeMutation.isError && (
            <p className="error">
              {purgeMutation.error instanceof ApiError &&
              purgeMutation.error.serverError === "player has history"
                ? `${player.name} has game history, so they can't be ` +
                  `permanently deleted — use Remove instead.`
                : purgeMutation.error instanceof ApiError &&
                    purgeMutation.error.serverError === "last captain"
                  ? `${player.name} is the team's only captain and can't be deleted.`
                  : "Error deleting player."}
            </p>
          )}
        </div>
      )}
    </form>
  );
}

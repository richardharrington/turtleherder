import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PlayerInput, Team } from "@turtleherder/shared";
import { useState } from "react";
import { Link, useOutletContext, useParams } from "react-router";
import { createPlayer, fetchPlayers, updatePlayer } from "../api.js";

// Add/edit a player, ported from legacy/bobcats/editplayer.php. The
// original's gender radio buttons become the quota checkbox; after a
// successful submit it shows the same follow-up links the original did.
export function PlayerFormPage() {
  const team = useOutletContext<Team>();
  const { playerId } = useParams<"playerId">();
  const editing = playerId !== undefined;
  const queryClient = useQueryClient();

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
      onSubmit={(e) => {
        e.preventDefault();
        mutation.mutate({
          name: shownName.trim(),
          countsTowardMinimum: shownCounts,
        });
      }}
    >
      <p>{editing ? "Update player info:" : "Enter new player:"}</p>

      <label>
        Name:{" "}
        <input
          type="text"
          value={shownName}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </label>
      <br />
      <br />

      <label>
        <input
          type="checkbox"
          checked={shownCounts}
          onChange={(e) => setCounts(e.target.checked)}
        />
        Counts toward the {team.quotaNounPlural} minimum
      </label>
      <br />
      <br />

      <input type="submit" value="SUBMIT" disabled={mutation.isPending} />
      {mutation.isError && (
        <p className="error">
          Error {editing ? "updating" : "adding"} player
        </p>
      )}
    </form>
  );
}

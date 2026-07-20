import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  formatShortDate,
  isGamePast,
  type GameWithAttendance,
  type Team,
} from "@turtleherder/shared";
import { useEffect, useState } from "react";
import { useOutletContext } from "react-router";
import { createGame, deleteGame, fetchGames, updateGame } from "../api.js";
import {
  Chevron,
  ConfirmAction,
  Expander,
  FormShell,
  summaryProps,
  useDisclosurePage,
  type DisclosurePage,
  type SavePhase,
} from "../components/disclosure.js";
import formStyles from "../components/disclosure.module.css";
import {
  formatGameDate,
  formatGameTime,
  instantToLocalInput,
  localInputToInstant,
} from "../format.js";
import type { TeamOutletContext } from "../TeamLayout.js";
import { useIsDesktop } from "../useIsDesktop.js";
import styles from "./ListPage.module.css";

// Manage games (milestone 5.8): date-first quiet rows, whole-row
// disclosure to the complete inline form, Add as the final row. The
// datetime-local input and timezone conversion are unchanged from the
// retired standalone form; delete keeps its consequences behind an
// inline confirmation.

function GameForm({
  team,
  game,
  page,
}: {
  team: Team;
  game?: GameWithAttendance;
  page: DisclosurePage;
}) {
  const queryClient = useQueryClient();
  const editing = game !== undefined;
  const key = editing ? `game-${game.id}` : "add";
  const initialWhen = game ? instantToLocalInput(game.startsAt, team.timezone) : "";
  const [name, setName] = useState(game?.opponentName ?? "");
  const [color, setColor] = useState(game?.opponentColor ?? "");
  const [when, setWhen] = useState(initialWhen);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const dirty =
    name !== (game?.opponentName ?? "") ||
    color !== (game?.opponentColor ?? "") ||
    when !== initialWhen;
  const { setDirty } = page;
  useEffect(() => setDirty(dirty), [dirty, setDirty]);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["games", team.slug] });

  const mutation = useMutation({
    mutationFn: () => {
      const input = {
        opponentName: name.trim() === "" ? null : name.trim(),
        opponentColor: color.trim() === "" ? null : color.trim(),
        startsAt: localInputToInstant(when, team.timezone),
      };
      return editing
        ? updateGame(team.slug, game.id, input)
        : createGame(team.slug, input);
    },
    onSuccess: () => {
      void invalidate();
      setDirty(false);
      setSaved(true);
      window.setTimeout(() => page.closeIfOpen(key), 500);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteGame(team.slug, game!.id),
    onSuccess: async () => {
      setDirty(false);
      await invalidate();
      page.close();
    },
  });

  const phase: SavePhase = saved ? "saved" : mutation.isPending ? "saving" : "idle";
  const deletePrompt = game
    ? game.opponentName === null
      ? `Delete the bye week on ${formatGameDate(game.startsAt, team.timezone)}? Its spot on the schedule goes away.`
      : `Delete the game against ${game.opponentName} on ${formatGameDate(game.startsAt, team.timezone)} at ${formatGameTime(game.startsAt, team.timezone)}? Everyone's responses for it are deleted too.`
    : "";

  return (
    <FormShell
      onSave={() => {
        if (when === "") {
          setValidationError("Date and time are required.");
          return;
        }
        setValidationError(null);
        mutation.mutate();
      }}
      onCancel={page.close}
      phase={phase}
      saveLabel={editing ? "Save" : "Add"}
      savingLabel={editing ? "Saving…" : "Adding…"}
      savedLabel={editing ? "Saved ✓" : "Added ✓"}
      saveDisabled={confirmingDelete || deleteMutation.isPending}
      error={
        validationError ??
        (mutation.isError
          ? `Error ${editing ? "saving" : "adding"} game — try again.`
          : null)
      }
      discard={{
        active: page.confirmingDiscard,
        onDiscard: page.discard,
        onKeep: page.keepEditing,
      }}
      destructive={
        editing ? (
          <ConfirmAction
            trigger="Delete game…"
            prompt={deletePrompt}
            confirmLabel="Delete"
            busyLabel="Deleting…"
            pending={deleteMutation.isPending}
            disabled={phase !== "idle"}
            error={deleteMutation.isError ? "Error deleting game — try again." : null}
            onConfirm={() => deleteMutation.mutate()}
            testId="delete-game-confirm"
          />
        ) : null
      }
    >
      <div className={styles.gameFields}>
        <label className={formStyles.field}>
          Opposing team name (leave blank for a bye week)
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className={formStyles.field}>
          Opposing team color (optional)
          <input
            type="text"
            value={color}
            onChange={(e) => setColor(e.target.value)}
          />
        </label>
        <label className={`${formStyles.field} ${styles.whenField}`}>
          Date and time
          <input
            type="datetime-local"
            value={when}
            onChange={(e) => setWhen(e.target.value)}
          />
        </label>
      </div>
    </FormShell>
  );
}

export function GamesPage() {
  const { team } = useOutletContext<TeamOutletContext>();
  const page = useDisclosurePage();
  const desktop = useIsDesktop();
  const storageKey = `pastGames:${team.slug}:manage`;
  const [showPast, setShowPast] = useState(
    () => localStorage.getItem(storageKey) === "showing",
  );

  const gamesQuery = useQuery({
    queryKey: ["games", team.slug],
    queryFn: () => fetchGames(team.slug),
  });

  function togglePast() {
    const next = !showPast;
    setShowPast(next);
    localStorage.setItem(storageKey, next ? "showing" : "hiding");
  }

  if (gamesQuery.isPending) {
    return <p>Loading…</p>;
  }
  if (gamesQuery.isError) {
    return <p className="error">Error loading games.</p>;
  }

  const now = Date.now();
  // Upcoming soonest-first (server order); past most-recent-first.
  const past = gamesQuery.data
    .filter((g) => isGamePast(g.startsAt, now))
    .reverse();
  const upcoming = gamesQuery.data.filter((g) => !isGamePast(g.startsAt, now));
  const addOpen = page.isOpen("add");

  const gameForm = (game?: GameWithAttendance) => (
    <GameForm key={game?.id ?? "add"} team={team} game={game} page={page} />
  );

  function summaryParts(game: GameWithAttendance) {
    return {
      when: `${formatShortDate(game.startsAt, team.timezone)} · ${formatGameTime(game.startsAt, team.timezone)}`,
      opponent: game.opponentName ?? "Bye week",
      color: game.opponentColor ?? "",
    };
  }

  const gameList = (games: GameWithAttendance[], withAdd: boolean) =>
    desktop ? (
      <table className={styles.table} data-testid="games-table">
        <thead>
          <tr>
            <th>Date &amp; time</th>
            <th>Opponent</th>
            <th>Color</th>
            <th className={styles.chevronHeader} aria-hidden />
          </tr>
        </thead>
        <tbody>
          {games.map((game) => {
            const key = `game-${game.id}`;
            const open = page.isOpen(key);
            const parts = summaryParts(game);
            return [
              <tr
                key={key}
                className={styles.summaryRow}
                data-testid="game-row"
                {...summaryProps(open, () => page.toggle(key), { asButton: false })}
              >
                <td className={styles.nameCell}>{parts.when}</td>
                <td>{parts.opponent}</td>
                <td className={styles.noteCell}>{parts.color}</td>
                <td className={styles.chevronCell}>
                  <Chevron open={open} />
                </td>
              </tr>,
              <tr key={`${key}-form`} className={styles.expansionRow}>
                <td colSpan={4} className={styles.expansionCell}>
                  <Expander open={open}>{open && gameForm(game)}</Expander>
                </td>
              </tr>,
            ];
          })}
          {withAdd && [
            <tr
              key="add"
              className={`${styles.summaryRow} ${styles.addRow}`}
              data-testid="add-game-row"
              {...summaryProps(addOpen, () => page.toggle("add"), { asButton: false })}
            >
              <td colSpan={3}>＋ Add game</td>
              <td className={styles.chevronCell}>
                <Chevron open={addOpen} />
              </td>
            </tr>,
            <tr key="add-form" className={styles.expansionRow}>
              <td colSpan={4} className={styles.expansionCell}>
                <Expander open={addOpen}>{addOpen && gameForm()}</Expander>
              </td>
            </tr>,
          ]}
        </tbody>
      </table>
    ) : (
      <ul className={styles.list}>
        {games.map((game) => {
          const key = `game-${game.id}`;
          const open = page.isOpen(key);
          const parts = summaryParts(game);
          return (
            <li key={game.id} className={styles.row} data-testid="game-row">
              <div
                className={styles.summary}
                {...summaryProps(open, () => page.toggle(key))}
              >
                <span className={styles.gameSummaryText}>
                  <span className={styles.name}>{parts.when}</span>
                  <span className={styles.note}>
                    {game.opponentName === null
                      ? "Bye week"
                      : `vs ${game.opponentName}`}
                  </span>
                </span>
                <Chevron open={open} />
              </div>
              <Expander open={open}>{open && gameForm(game)}</Expander>
            </li>
          );
        })}
        {withAdd && (
          <li className={styles.row} data-testid="add-game-row">
            <div
              className={`${styles.summary} ${styles.addSummary}`}
              {...summaryProps(addOpen, () => page.toggle("add"))}
            >
              <span className={styles.name}>＋ Add game</span>
              <Chevron open={addOpen} />
            </div>
            <Expander open={addOpen}>{addOpen && gameForm()}</Expander>
          </li>
        )}
      </ul>
    );

  return (
    <>
      {/* Always rendered: the Add row lives at the end of this list even
          when no upcoming games exist yet. */}
      <h2 className={styles.section}>Upcoming games</h2>
      {gameList(upcoming, true)}

      <section className={styles.subSection}>
        <button
          type="button"
          className={styles.sectionDisclosure}
          aria-expanded={showPast}
          onClick={togglePast}
        >
          <span>Past games ({past.length})</span>
          <Chevron open={showPast} />
        </button>
        <Expander open={showPast}>
          {past.length === 0 ? (
            <p className={styles.empty}>No past games.</p>
          ) : (
            gameList(past, false)
          )}
        </Expander>
      </section>
    </>
  );
}

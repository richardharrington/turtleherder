import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { FormerPlayer, Player, Team } from "@turtleherder/shared";
import { useEffect, useState } from "react";
import { useOutletContext } from "react-router";
import {
  addBackPlayer,
  ApiError,
  createPlayer,
  fetchFormerPlayers,
  fetchPlayers,
  purgePlayer,
  removePlayer,
  updatePlayer,
} from "../api.js";
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
import { formatPlainDate } from "../format.js";
import type { TeamOutletContext } from "../TeamLayout.js";
import { useIsDesktop } from "../useIsDesktop.js";
import styles from "./ListPage.module.css";

// Manage roster (milestone 5.8): the list/table is the whole workspace.
// A collapsed row shows Player and Category; the entire row opens the
// complete inline form, Add is the final row, and removal/permanent
// deletion use inline confirmations. Former players (captains only)
// expand to Add back and permanent purge.

function titleCaseQuotaNoun(team: Team): string {
  const noun = team.quotaNounSingular;
  return noun.charAt(0).toUpperCase() + noun.slice(1);
}

// Title-cased configured quota noun (e.g. "Woman"); non-quota players
// show an em dash — a truthful bridge until the deferred coed-rules
// model provides dominant-group nouns.
function categoryLabel(player: Player, team: Team): string {
  return player.countsTowardMinimum ? titleCaseQuotaNoun(team) : "—";
}

const MINIMUM_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];

function PlayerForm({
  team,
  player,
  page,
}: {
  team: Team;
  player?: Player;
  page: DisclosurePage;
}) {
  const queryClient = useQueryClient();
  const editing = player !== undefined;
  const key = editing ? `player-${player.id}` : "add";
  const [name, setName] = useState(player?.name ?? "");
  const [counts, setCounts] = useState(player?.countsTowardMinimum ?? false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [confirmingRemove, setConfirmingRemove] = useState(false);

  const dirty =
    name !== (player?.name ?? "") ||
    counts !== (player?.countsTowardMinimum ?? false);
  const { setDirty } = page;
  useEffect(() => setDirty(dirty), [dirty, setDirty]);

  const invalidateRoster = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["players", team.slug] }),
      // The roster change affects every game's attendance list.
      queryClient.invalidateQueries({ queryKey: ["games", team.slug] }),
    ]);

  const mutation = useMutation({
    mutationFn: () =>
      editing
        ? updatePlayer(team.slug, player.id, { name: name.trim(), countsTowardMinimum: counts })
        : createPlayer(team.slug, { name: name.trim(), countsTowardMinimum: counts }),
    onSuccess: () => {
      void invalidateRoster();
      setDirty(false);
      setSaved(true);
      window.setTimeout(() => page.closeIfOpen(key), 500);
    },
  });

  const removeMutation = useMutation({
    mutationFn: () => removePlayer(team.slug, player!.id),
    onSuccess: async () => {
      setDirty(false);
      await invalidateRoster();
      page.close();
    },
  });

  const phase: SavePhase = saved ? "saved" : mutation.isPending ? "saving" : "idle";
  const minimum = team.womenFloor === null
    ? null
    : MINIMUM_WORDS[team.womenFloor] ?? String(team.womenFloor);

  return (
    <FormShell
      onSave={() => {
        if (name.trim() === "") {
          setValidationError("Name is required.");
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
      saveDisabled={confirmingRemove || removeMutation.isPending}
      error={
        validationError ??
        (mutation.isError
          ? `Error ${editing ? "saving" : "adding"} player — try again.`
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
            trigger="Remove from roster…"
            prompt={`Remove ${player.name} from the roster? Their game history stays, and a captain can add them back later.`}
            confirmLabel="Remove"
            busyLabel="Removing…"
            pending={removeMutation.isPending}
            disabled={phase !== "idle"}
            error={
              removeMutation.isError
                ? removeMutation.error instanceof ApiError &&
                  removeMutation.error.serverError === "last captain"
                  ? "The team's only captain can't be removed from the roster."
                  : "Error removing player — try again."
                : null
            }
            onConfirm={() => removeMutation.mutate()}
            onOpenChange={setConfirmingRemove}
          />
        ) : null
      }
    >
      <div className={styles.playerFields}>
        <label className={formStyles.field}>
          Name
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className={formStyles.checkboxField}>
          <input
            type="checkbox"
            checked={counts}
            onChange={(e) => setCounts(e.target.checked)}
          />
          <span>
            <strong>{titleCaseQuotaNoun(team)}</strong>
            {minimum !== null && (
              <small>The league requires at least {minimum} on the field</small>
            )}
          </span>
        </label>
      </div>
    </FormShell>
  );
}

// A former player's expansion: not an editable form — only the two
// confirmed paths out of the Former list.
function FormerActions({
  team,
  player,
  page,
}: {
  team: Team;
  player: FormerPlayer;
  page: DisclosurePage;
}) {
  const queryClient = useQueryClient();
  const key = `former-${player.id}`;
  const [addedBack, setAddedBack] = useState(false);

  const invalidateAll = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["players", team.slug] }),
      queryClient.invalidateQueries({ queryKey: ["games", team.slug] }),
    ]);

  const addBackMutation = useMutation({
    mutationFn: () => addBackPlayer(team.slug, player.id),
    onSuccess: () => {
      // Success beat first, then the refetch moves the row to the
      // active list.
      setAddedBack(true);
      window.setTimeout(() => {
        void invalidateAll().then(() => page.closeIfOpen(key));
      }, 500);
    },
  });

  const purgeMutation = useMutation({
    mutationFn: () => purgePlayer(team.slug, player.id),
    onSuccess: async () => {
      await invalidateAll();
      page.close();
    },
  });

  return (
    <div className={styles.formerActions}>
      <ConfirmAction
        trigger="Add back to roster…"
        variant="neutral"
        prompt={`Add ${player.name} back to the roster? Their existing personal link will immediately work again.`}
        confirmLabel="Add back"
        busyLabel="Adding back…"
        doneLabel="Added back ✓"
        done={addedBack}
        pending={addBackMutation.isPending}
        disabled={purgeMutation.isPending}
        error={addBackMutation.isError ? "Error adding player back — try again." : null}
        onConfirm={() => addBackMutation.mutate()}
        testId="add-back-confirm"
      />
      <ConfirmAction
        trigger="Delete permanently…"
        prompt={`Permanently delete ${player.name}? This erases the player entirely and cannot be undone.`}
        confirmLabel="Delete permanently"
        busyLabel="Deleting…"
        pending={purgeMutation.isPending}
        disabled={addBackMutation.isPending || addedBack}
        error={
          purgeMutation.isError
            ? purgeMutation.error instanceof ApiError &&
              purgeMutation.error.serverError === "player has history"
              ? `${player.name} has game history, so they can't be permanently deleted.`
              : purgeMutation.error instanceof ApiError &&
                  purgeMutation.error.serverError === "last captain"
                ? `${player.name} is the team's only captain and can't be deleted.`
                : "Error deleting player — try again."
            : null
        }
        onConfirm={() => purgeMutation.mutate()}
        testId="purge-confirm"
      />
    </div>
  );
}

export function PlayersPage() {
  const { team, me } = useOutletContext<TeamOutletContext>();
  const page = useDisclosurePage();
  const desktop = useIsDesktop();
  const storageKey = `formerPlayers:${team.slug}`;
  const [showFormer, setShowFormer] = useState(
    () => localStorage.getItem(storageKey) === "showing",
  );

  const playersQuery = useQuery({
    queryKey: ["players", team.slug],
    queryFn: () => fetchPlayers(team.slug),
  });

  const formerQuery = useQuery({
    queryKey: ["players", team.slug, "former"],
    queryFn: () => fetchFormerPlayers(team.slug),
    enabled: me.isCaptain,
  });

  function toggleFormer() {
    const next = !showFormer;
    setShowFormer(next);
    localStorage.setItem(storageKey, next ? "showing" : "hiding");
  }

  if (playersQuery.isPending) {
    return <p>Loading…</p>;
  }
  if (playersQuery.isError) {
    return <p className="error">Error loading players.</p>;
  }

  const players = playersQuery.data;
  const addOpen = page.isOpen("add");

  const playerForm = (player?: Player) => (
    <PlayerForm key={player?.id ?? "add"} team={team} player={player} page={page} />
  );

  const activeRows = desktop ? (
    <table className={styles.table} data-testid="players-table">
      <thead>
        <tr>
          <th>Player</th>
          <th>Category</th>
          <th className={styles.chevronHeader} aria-hidden />
        </tr>
      </thead>
      <tbody>
        {players.map((player) => {
          const key = `player-${player.id}`;
          const open = page.isOpen(key);
          return [
            <tr
              key={key}
              className={styles.summaryRow}
              data-testid="player-row"
              {...summaryProps(open, () => page.toggle(key), { asButton: false })}
            >
              <td className={styles.nameCell}>{player.name}</td>
              <td className={styles.noteCell}>{categoryLabel(player, team)}</td>
              <td className={styles.chevronCell}>
                <Chevron open={open} />
              </td>
            </tr>,
            <tr key={`${key}-form`} className={styles.expansionRow}>
              <td colSpan={3} className={styles.expansionCell}>
                <Expander open={open}>{open && playerForm(player)}</Expander>
              </td>
            </tr>,
          ];
        })}
        <tr
          className={`${styles.summaryRow} ${styles.addRow}`}
          data-testid="add-player-row"
          {...summaryProps(addOpen, () => page.toggle("add"), { asButton: false })}
        >
          <td colSpan={2}>＋ Add player</td>
          <td className={styles.chevronCell}>
            <Chevron open={addOpen} />
          </td>
        </tr>
        <tr className={styles.expansionRow}>
          <td colSpan={3} className={styles.expansionCell}>
            <Expander open={addOpen}>{addOpen && playerForm()}</Expander>
          </td>
        </tr>
      </tbody>
    </table>
  ) : (
    <ul className={styles.list}>
      {players.map((player) => {
        const key = `player-${player.id}`;
        const open = page.isOpen(key);
        return (
          <li key={player.id} className={styles.row} data-testid="player-row">
            <div
              className={styles.summary}
              {...summaryProps(open, () => page.toggle(key))}
            >
              <span className={styles.name}>{player.name}</span>
              <span className={styles.note}>{categoryLabel(player, team)}</span>
              <Chevron open={open} />
            </div>
            <Expander open={open}>{open && playerForm(player)}</Expander>
          </li>
        );
      })}
      <li className={styles.row} data-testid="add-player-row">
        <div
          className={`${styles.summary} ${styles.addSummary}`}
          {...summaryProps(addOpen, () => page.toggle("add"))}
        >
          <span className={styles.name}>＋ Add player</span>
          <Chevron open={addOpen} />
        </div>
        <Expander open={addOpen}>{addOpen && playerForm()}</Expander>
      </li>
    </ul>
  );

  const former = formerQuery.data ?? [];
  const formerRows = (player: FormerPlayer) => {
    const key = `former-${player.id}`;
    const open = page.isOpen(key);
    const leftDate = formatPlainDate(player.leftAt, team.timezone);
    return { key, open, leftDate };
  };

  return (
    <>
      {activeRows}

      {me.isCaptain && (
        <section className={styles.subSection}>
          <button
            type="button"
            className={styles.sectionDisclosure}
            aria-expanded={showFormer}
            onClick={toggleFormer}
          >
            <span>
              Former players ({formerQuery.isSuccess ? former.length : "…"})
            </span>
            <Chevron open={showFormer} />
          </button>
          <Expander open={showFormer}>
            {formerQuery.isPending ? (
              <p>Loading…</p>
            ) : formerQuery.isError ? (
              <p className="error">Error loading former players.</p>
            ) : former.length === 0 ? (
              <p className={styles.empty}>No former players.</p>
            ) : desktop ? (
              <table className={styles.table} data-testid="former-table">
                <thead>
                  <tr>
                    <th>Player</th>
                    <th>Left</th>
                    <th className={styles.chevronHeader} aria-hidden />
                  </tr>
                </thead>
                <tbody>
                  {former.map((player) => {
                    const { key, open, leftDate } = formerRows(player);
                    return [
                      <tr
                        key={key}
                        className={styles.summaryRow}
                        data-testid="former-row"
                        {...summaryProps(open, () => page.toggle(key), { asButton: false })}
                      >
                        <td className={styles.nameCell}>{player.name}</td>
                        <td className={styles.noteCell}>{leftDate}</td>
                        <td className={styles.chevronCell}>
                          <Chevron open={open} />
                        </td>
                      </tr>,
                      <tr key={`${key}-actions`} className={styles.expansionRow}>
                        <td colSpan={3} className={styles.expansionCell}>
                          <Expander open={open}>
                            {open && (
                              <FormerActions team={team} player={player} page={page} />
                            )}
                          </Expander>
                        </td>
                      </tr>,
                    ];
                  })}
                </tbody>
              </table>
            ) : (
              <ul className={styles.list}>
                {former.map((player) => {
                  const { key, open, leftDate } = formerRows(player);
                  return (
                    <li key={player.id} className={styles.row} data-testid="former-row">
                      <div
                        className={styles.summary}
                        {...summaryProps(open, () => page.toggle(key))}
                      >
                        <span className={styles.name}>{player.name}</span>
                        <span className={styles.note}>Left {leftDate}</span>
                        <Chevron open={open} />
                      </div>
                      <Expander open={open}>
                        {open && (
                          <FormerActions team={team} player={player} page={page} />
                        )}
                      </Expander>
                    </li>
                  );
                })}
              </ul>
            )}
          </Expander>
        </section>
      )}
    </>
  );
}

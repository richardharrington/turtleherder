import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PlayerAccess, Team } from "@turtleherder/shared";
import { useState } from "react";
import { useOutletContext } from "react-router";
import {
  ApiError,
  demotePlayer,
  fetchAccess,
  promotePlayer,
  regenerateToken,
  revokeToken,
} from "../api.js";
import {
  Chevron,
  ConfirmAction,
  Expander,
  summaryProps,
  useDisclosurePage,
  type DisclosurePage,
} from "../components/disclosure.js";
import { formatPlainDate } from "../format.js";
import type { TeamOutletContext } from "../TeamLayout.js";
import { useIsDesktop } from "../useIsDesktop.js";
import styles from "./ManageAccessPage.module.css";

// Captains only (milestone 5.8): dense disclosure rows. Copy stays in the
// collapsed summary — the routine "text this player their link" flow never
// opens a row — while the rare regenerate/revoke live behind a nested
// Manage link disclosure inside the expansion. "Never opened / Opened"
// reflects the durable first use of the current token; nothing here is
// optimistic — every state change waits for the server.

function statusLabel(access: PlayerAccess): string {
  const opened = access.joinTokenUsedAt !== null;
  const linkStatus = access.joinToken === null
    ? opened ? "Revoked · opened" : "Revoked · never opened"
    : opened ? "Opened" : "Never opened";
  return access.isCaptain ? `Captain · ${linkStatus.toLowerCase()}` : linkStatus;
}

function CaptainToggle({
  access,
  team,
  currentPlayerId,
}: {
  access: PlayerAccess;
  team: Team;
  currentPlayerId: number;
}) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () =>
      access.isCaptain
        ? demotePlayer(team.slug, access.playerId)
        : promotePlayer(team.slug, access.playerId),
    onSuccess: async () => {
      if (access.isCaptain && access.playerId === currentPlayerId) {
        window.location.assign(`/${team.slug}`);
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["access", team.slug] });
    },
  });
  return (
    <div className={styles.captainControl}>
      <label>
        <input
          type="checkbox"
          role="switch"
          checked={access.isCaptain}
          disabled={mutation.isPending}
          onChange={() => mutation.mutate()}
        />
        <span>
          <strong>Captain</strong>
          <small>Captains can manage access and team settings.</small>
        </span>
      </label>
      {mutation.isError && (
        <p className={styles.actionError}>
          {mutation.error instanceof ApiError && mutation.error.serverError === "last captain"
            ? "Every team needs at least one captain. Promote someone else first."
            : "Couldn’t change captain access. Try again."}
        </p>
      )}
    </div>
  );
}

function CopyButton({ url, label = "Copy" }: { url: string; label?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setState("copied");
    } catch {
      setState("failed");
    }
    window.setTimeout(() => setState("idle"), 2000);
  }

  return (
    <button type="button" className={styles.copy} onClick={() => void copy()}>
      {state === "copied" ? "Copied!" : state === "failed" ? "Copy failed" : label}
    </button>
  );
}

// The expansion of an active row: selectable full URL, then the nested
// Manage link disclosure holding regenerate (neutral) and revoke (red).
// Mounted only while the row is open, so its state resets on collapse.
function ActiveExpansion({
  access,
  team,
  page,
  currentPlayerId,
}: {
  access: PlayerAccess;
  team: Team;
  page: DisclosurePage;
  currentPlayerId: number;
}) {
  const queryClient = useQueryClient();
  const key = `access-${access.playerId}`;
  const [manageOpen, setManageOpen] = useState(false);
  const [regenerated, setRegenerated] = useState(false);
  const [revoked, setRevoked] = useState(false);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["access", team.slug] });

  const regenerateMutation = useMutation({
    mutationFn: () => regenerateToken(team.slug, access.playerId),
    onSuccess: async () => {
      // The fresh URL must be on screen before the success state shows.
      await invalidate();
      setManageOpen(false);
      setRegenerated(true);
    },
  });

  const revokeMutation = useMutation({
    mutationFn: () => revokeToken(team.slug, access.playerId),
    onSuccess: () => {
      setRevoked(true);
      window.setTimeout(() => {
        void invalidate().then(() => page.closeIfOpen(key));
      }, 500);
    },
  });

  const joinUrl = `${window.location.origin}/join/${access.joinToken}`;

  return (
    <div className={styles.expansion}>
      <CaptainToggle access={access} team={team} currentPlayerId={currentPlayerId} />
      <div
        className={regenerated ? `${styles.urlBox} ${styles.urlBoxNew}` : styles.urlBox}
        data-testid="join-url"
      >
        <span className={styles.urlText}>{joinUrl}</span>
        {regenerated && (
          <span className={styles.newLink}>
            <span className={styles.newLinkLabel}>New link generated ✓</span>
            <CopyButton url={joinUrl} label="Copy new link" />
          </span>
        )}
      </div>

      <button
        type="button"
        className={styles.manageToggle}
        aria-expanded={manageOpen}
        onClick={() => setManageOpen(!manageOpen)}
      >
        Manage link
        <Chevron open={manageOpen} />
      </button>
      <Expander open={manageOpen}>
        {/* Mounted only while open, so half-finished confirmations don't
            linger into the next visit. */}
        {manageOpen && (
        <div className={styles.manageActions}>
          <ConfirmAction
            trigger="Generate a new link…"
            variant="neutral"
            prompt={`Generate a new link for ${access.name}? Their current link stops working immediately and they're signed out everywhere.`}
            confirmLabel="Generate new link"
            busyLabel="Generating…"
            pending={regenerateMutation.isPending}
            disabled={revokeMutation.isPending || revoked}
            error={
              regenerateMutation.isError
                ? "Error generating a new link — try again."
                : null
            }
            onConfirm={() => regenerateMutation.mutate()}
            testId="regenerate-confirm"
          />
          <ConfirmAction
            trigger="Revoke access…"
            prompt={`Revoke ${access.name}'s access? They're signed out everywhere and can't get back in until you generate a new link.`}
            confirmLabel="Revoke"
            busyLabel="Revoking…"
            doneLabel="Access revoked ✓"
            done={revoked}
            pending={revokeMutation.isPending}
            disabled={regenerateMutation.isPending}
            error={
              revokeMutation.isError ? "Error revoking access — try again." : null
            }
            onConfirm={() => revokeMutation.mutate()}
            testId="revoke-confirm"
          />
        </div>
        )}
      </Expander>
    </div>
  );
}

// A revoked row's expansion: when it happened, and the direct recovery
// action — deliberately not hidden under Manage link.
function RevokedExpansion({
  access,
  team,
  currentPlayerId,
}: {
  access: PlayerAccess;
  team: Team;
  currentPlayerId: number;
}) {
  const queryClient = useQueryClient();

  const regenerateMutation = useMutation({
    mutationFn: () => regenerateToken(team.slug, access.playerId),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["access", team.slug] }),
  });

  return (
    <div className={styles.expansion}>
      <CaptainToggle access={access} team={team} currentPlayerId={currentPlayerId} />
      {access.revokedAt !== null && (
        <p className={styles.revokedNote}>
          Revoked {formatPlainDate(access.revokedAt, team.timezone)}. Their old
          link no longer works.
        </p>
      )}
      <ConfirmAction
        trigger="Generate a new link…"
        variant="neutral"
        prompt={`Generate a new link for ${access.name}? The new link signs them back in; the revoked one stays dead.`}
        confirmLabel="Generate new link"
        busyLabel="Generating…"
        pending={regenerateMutation.isPending}
        error={
          regenerateMutation.isError
            ? "Error generating a new link — try again."
            : null
        }
        onConfirm={() => regenerateMutation.mutate()}
        testId="recover-confirm"
      />
    </div>
  );
}

function rowExpansion(
  access: PlayerAccess,
  team: Team,
  page: DisclosurePage,
  currentPlayerId: number,
) {
  return access.joinToken === null ? (
    <RevokedExpansion access={access} team={team} currentPlayerId={currentPlayerId} />
  ) : (
    <ActiveExpansion
      access={access}
      team={team}
      page={page}
      currentPlayerId={currentPlayerId}
    />
  );
}

export function ManageAccessPage() {
  const { team, me } = useOutletContext<TeamOutletContext>();
  const page = useDisclosurePage();
  const desktop = useIsDesktop();

  const accessQuery = useQuery({
    queryKey: ["access", team.slug],
    queryFn: () => fetchAccess(team.slug),
  });

  if (accessQuery.isPending) {
    return <p>Loading…</p>;
  }
  if (accessQuery.isError) {
    // A non-captain who navigated here directly.
    if (
      accessQuery.error instanceof ApiError &&
      accessQuery.error.status === 403
    ) {
      return <p>Only captains can manage team access.</p>;
    }
    return <p className="error">Error loading access list.</p>;
  }

  const rows = accessQuery.data;

  return (
    <>
      <p className={styles.hint}>
        Each player signs in with their personal join link — text it to
        them. Generating a new link or revoking one signs that player out
        everywhere.
      </p>

      {desktop ? (
        <table className={styles.table} data-testid="access-table">
          <thead>
            <tr>
              <th>Player</th>
              <th>Status</th>
              <th>Copy</th>
              <th className={styles.chevronHeader} aria-hidden />
            </tr>
          </thead>
          <tbody>
            {rows.map((access) => {
              const key = `access-${access.playerId}`;
              const open = page.isOpen(key);
              return [
                <tr
                  key={key}
                  className={styles.summaryRow}
                  data-testid="access-row"
                  {...summaryProps(open, () => page.toggle(key), { asButton: false })}
                >
                  <td className={styles.nameCell}>{access.name}</td>
                  <td className={styles.stateCell}>{statusLabel(access)}</td>
                  <td className={styles.copyCell}>
                    {access.joinToken !== null && (
                      <CopyButton
                        url={`${window.location.origin}/join/${access.joinToken}`}
                      />
                    )}
                  </td>
                  <td className={styles.chevronCell}>
                    <Chevron open={open} />
                  </td>
                </tr>,
                <tr key={`${key}-details`} className={styles.expansionRow}>
                  <td colSpan={4} className={styles.expansionCell}>
                    <Expander open={open}>
                      {open && rowExpansion(access, team, page, me.playerId)}
                    </Expander>
                  </td>
                </tr>,
              ];
            })}
          </tbody>
        </table>
      ) : (
        <ul className={styles.list}>
          {rows.map((access) => {
            const key = `access-${access.playerId}`;
            const open = page.isOpen(key);
            return (
              <li key={access.playerId} className={styles.row} data-testid="access-row">
                <div
                  className={styles.summary}
                  {...summaryProps(open, () => page.toggle(key))}
                >
                  <span className={styles.summaryText}>
                    <span className={styles.name}>{access.name}</span>
                    <span className={styles.state}>{statusLabel(access)}</span>
                  </span>
                  {access.joinToken !== null && (
                    <CopyButton
                      url={`${window.location.origin}/join/${access.joinToken}`}
                    />
                  )}
                  <Chevron open={open} />
                </div>
                <Expander open={open}>
                  {open && rowExpansion(access, team, page, me.playerId)}
                </Expander>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

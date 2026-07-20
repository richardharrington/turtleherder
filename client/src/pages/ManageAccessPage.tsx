import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PlayerAccess, Team } from "@turtleherder/shared";
import { useState } from "react";
import { useOutletContext } from "react-router";
import {
  ApiError,
  fetchAccess,
  regenerateToken,
  revokeToken,
} from "../api.js";
import { Button } from "../components/Button.js";
import type { TeamOutletContext } from "../TeamLayout.js";
import styles from "./ManageAccessPage.module.css";

// Captains only: each player's join link, copyable for re-texting, plus
// regenerate and revoke. Mobile/tablet reveal links on tap; desktop
// (≥1024px, via CSS) shows them all. The nav link is already gated on
// /me, but a non-captain navigating here directly gets the API's 403 —
// shown as a plain message, not a crash.

function formatRevokedAt(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone,
  }).format(new Date(iso));
}

function PlayerAccessRow({
  access,
  team,
  desktop = false,
}: {
  access: PlayerAccess;
  team: Team;
  desktop?: boolean;
}) {
  const queryClient = useQueryClient();
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["access", team.slug] });
  const regenerateMutation = useMutation({
    mutationFn: () => regenerateToken(team.slug, access.playerId),
    onSuccess: invalidate,
  });
  const revokeMutation = useMutation({
    mutationFn: () => revokeToken(team.slug, access.playerId),
    onSuccess: invalidate,
  });
  const pending = regenerateMutation.isPending || revokeMutation.isPending;

  const joinUrl =
    access.joinToken === null
      ? null
      : `${window.location.origin}/join/${access.joinToken}`;

  async function copy() {
    if (joinUrl === null) return;
    await navigator.clipboard.writeText(joinUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (desktop) {
    return (
      <tr data-testid="access-row">
        <td className={styles.name}>{access.name}</td>
        <td>{joinUrl !== null ? <span className={styles.desktopLink}><span className={styles.linkText}>{joinUrl}</span><Button variant="secondary" small onClick={copy}>{copied ? "Copied!" : "Copy"}</Button></span> : <span className={styles.revoked}>Link revoked {access.revokedAt !== null && formatRevokedAt(access.revokedAt, team.timezone)}</span>}</td>
        <td><span className={styles.actions}>
          <Button variant="secondary" small disabled={pending} onClick={() => { if (window.confirm(`Regenerate ${access.name}'s link? Their old link will stop working and they will be signed out.`)) regenerateMutation.mutate(); }}>Regenerate</Button>
          {joinUrl !== null && <Button variant="danger" small disabled={pending} onClick={() => { if (window.confirm(`Revoke ${access.name}'s link? They will be signed out and can't get back in until you regenerate a link for them.`)) revokeMutation.mutate(); }}>Revoke</Button>}
        </span></td>
      </tr>
    );
  }

  return (
    <li className={styles.row} data-testid="access-row">
      <span className={styles.name}>{access.name}</span>

      {joinUrl !== null ? (
        <span
          className={
            revealed ? `${styles.linkBox} ${styles.revealed}` : styles.linkBox
          }
        >
          <span className={styles.linkText}>{joinUrl}</span>
          <Button variant="secondary" small onClick={copy}>
            {copied ? "Copied!" : "Copy"}
          </Button>
        </span>
      ) : (
        <span className={styles.revoked}>
          Link revoked{" "}
          {access.revokedAt !== null &&
            formatRevokedAt(access.revokedAt, team.timezone)}
        </span>
      )}

      <span className={styles.actions}>
        {joinUrl !== null && (
          <Button
            variant="secondary"
            small
            className={styles.showLink}
            onClick={() => setRevealed(!revealed)}
          >
            {revealed ? "Hide link" : "Show link"}
          </Button>
        )}
        <Button
          variant="secondary"
          small
          disabled={pending}
          onClick={() => {
            if (
              window.confirm(
                `Regenerate ${access.name}'s link? Their old link will stop working and they will be signed out.`,
              )
            ) {
              regenerateMutation.mutate();
            }
          }}
        >
          Regenerate
        </Button>
        {joinUrl !== null && (
          <Button
            variant="danger"
            small
            disabled={pending}
            onClick={() => {
              if (
                window.confirm(
                  `Revoke ${access.name}'s link? They will be signed out and can't get back in until you regenerate a link for them.`,
                )
              ) {
                revokeMutation.mutate();
              }
            }}
          >
            Revoke
          </Button>
        )}
      </span>
      {(regenerateMutation.isError || revokeMutation.isError) && (
        <span className="error">Error updating access.</span>
      )}
    </li>
  );
}

export function ManageAccessPage() {
  const { team } = useOutletContext<TeamOutletContext>();

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

  return (
    <>
      <p className={styles.hint}>
        Each player signs in with their personal join link — text it to
        them. Regenerating or revoking a link signs that player out
        everywhere.
      </p>
      <ul className={`${styles.list} ${styles.mobileList}`}>
        {accessQuery.data.map((access) => (
          <PlayerAccessRow key={access.playerId} access={access} team={team} />
        ))}
      </ul>
      <div className={styles.desktopTable}>
        <table className={styles.table}>
          <thead><tr><th>Player</th><th>Join link</th><th>Actions</th></tr></thead>
          <tbody>{accessQuery.data.map((access) => <PlayerAccessRow desktop key={access.playerId} access={access} team={team} />)}</tbody>
        </table>
      </div>
    </>
  );
}

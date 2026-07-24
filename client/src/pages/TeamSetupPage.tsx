import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Navigate, useParams } from "react-router";
import { fetchAccess, fetchMe, fetchTeam } from "../api.js";
import { Button } from "../components/Button.js";
import { CoedRulesForm } from "../components/CoedRulesForm.js";
import styles from "./TeamSetupPage.module.css";

export function TeamSetupPage() {
  const { teamSlug } = useParams<"teamSlug">();
  const [copied, setCopied] = useState(false);
  const teamQuery = useQuery({
    queryKey: ["team", teamSlug],
    queryFn: () => fetchTeam(teamSlug!),
    enabled: teamSlug !== undefined,
  });
  const meQuery = useQuery({
    queryKey: ["me", teamSlug],
    queryFn: () => fetchMe(teamSlug!),
    enabled: teamSlug !== undefined,
  });
  const accessQuery = useQuery({
    queryKey: ["access", teamSlug],
    queryFn: () => fetchAccess(teamSlug!),
    enabled: teamSlug !== undefined,
  });

  if (teamQuery.isPending || meQuery.isPending || accessQuery.isPending) {
    return <p className={styles.message}>Loading…</p>;
  }
  if (teamQuery.isError || meQuery.isError || accessQuery.isError) {
    return <p className={styles.message}>Something went wrong.</p>;
  }

  const team = teamQuery.data;
  if (team.setupCompletedAt !== null) return <Navigate to={`/${team.slug}`} replace />;
  if (!meQuery.data.isCaptain) return <Navigate to={`/${team.slug}`} replace />;

  const captainAccess = accessQuery.data.find((entry) => entry.playerId === meQuery.data.playerId);
  const captainLink = captainAccess?.joinToken
    ? `${window.location.origin}/join/${captainAccess.joinToken}`
    : null;

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <p className={styles.wordmark}>Turtleherder</p>
        <h1>Set up {team.name}</h1>
        <div className={styles.saveCallout}>
          <h2>Save your link</h2>
          <p>
            This link is how you get back into {team.name} on a new phone or browser.
            Save it now — bookmark it, or email it to yourself.
          </p>
          {captainLink && (
            <div className={styles.linkRow}>
              <code>{captainLink}</code>
              <Button
                variant="secondary"
                onClick={() => {
                  void navigator.clipboard.writeText(captainLink).then(() => {
                    setCopied(true);
                    window.setTimeout(() => setCopied(false), 2000);
                  });
                }}
              >
                {copied ? "Copied!" : "Copy"}
              </Button>
            </div>
          )}
        </div>
        <CoedRulesForm team={team} setup />
      </section>
    </main>
  );
}

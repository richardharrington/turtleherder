import { useQuery } from "@tanstack/react-query";
import { Link, Navigate, useSearchParams } from "react-router";
import { fetchSessionTeams } from "../api.js";
import styles from "./WallPage.module.css";

// The friendly wall: what a signed-out visitor sees — bounced here on any
// team-scoped 401, or sent here by the server after an invalid/revoked join
// link. A slug-less session endpoint can safely list the teams already held
// by this browser for cross-team guidance and the PWA landing chooser.
export function WallPage() {
  const [params] = useSearchParams();
  const invalidJoin = params.get("join") === "invalid";
  // A valid link whose player was removed from the roster. Only the link's
  // rightful holder can ever land here (the token is a 128-bit secret), so
  // naming the team leaks nothing they don't know.
  const departedJoin = params.get("join") === "departed";
  const departedTeam = params.get("team");
  const from = params.get("from");

  const sessionQuery = useQuery({
    queryKey: ["sessionTeams"],
    queryFn: fetchSessionTeams,
    // Dead/departed join links always show their specific message, even if
    // the browser happens to retain keys for other teams.
    enabled: !invalidJoin && !departedJoin,
    retry: false,
  });

  if (!invalidJoin && !departedJoin && !from && sessionQuery.isSuccess) {
    const teams = sessionQuery.data;
    const chooserSeen = localStorage.getItem("keyringChooserSeen") === "true";
    if (teams.length > 1 && !chooserSeen) {
      return (
        <main className={styles.page}>
          <div className={styles.banner}>
            <p className={styles.wordmark}>Turtleherder</p>
            <h1 className={styles.heading}>Choose a team</h1>
            <p className={styles.subtext}>Where would you like to start?</p>
            <div className={styles.teamChoices}>
              {teams.map((team) => (
                <Link
                  key={team.teamId}
                  to={`/${team.slug}`}
                  className={styles.teamChoice}
                  onClick={() => {
                    localStorage.setItem("keyringChooserSeen", "true");
                    localStorage.setItem("lastTeamSlug", team.slug);
                  }}
                >
                  <span>{team.name}</span>
                  <small>{team.playerName}</small>
                </Link>
              ))}
            </div>
          </div>
        </main>
      );
    }

    if (teams.length > 0) {
      const lastSlug = localStorage.getItem("lastTeamSlug");
      const destination =
        teams.find((team) => team.slug === lastSlug) ?? teams[0]!;
      return <Navigate to={`/${destination.slug}`} replace />;
    }
  }
  if (
    !invalidJoin &&
    !departedJoin &&
    !from &&
    sessionQuery.isPending &&
    sessionQuery.fetchStatus !== "idle"
  ) {
    return null; // brief blank while checking; avoids flashing the wall
  }

  const keyringTeams = sessionQuery.data ?? [];

  return (
    <main className={styles.page}>
      <div className={styles.banner}>
        <p className={styles.wordmark}>Turtleherder</p>
        {departedJoin ? (
          <>
            <h1 className={styles.heading}>
              You’re no longer on the{" "}
              {departedTeam ? `${departedTeam} roster` : "roster"}
            </h1>
            <p className={styles.subtext}>
              If that’s a mistake, ask your captain to add you back.
            </p>
          </>
        ) : invalidJoin ? (
          <>
            <h1 className={styles.heading}>That link didn’t work</h1>
            <p className={styles.subtext}>
              Ask your captain for a fresh one.
            </p>
          </>
        ) : (
          <>
            <h1 className={styles.heading}>
              Ask your captain for your link.
            </h1>
            <p className={styles.subtext}>
              The schedule is only visible to team members.
            </p>
          </>
        )}
        {from !== null && keyringTeams.length > 0 && (
          <div className={styles.crossTeam}>
            <p className={styles.note}>
              You’re not signed into “{from}” on this device. Use the join
              link that team’s captain sent you.
            </p>
            <div className={styles.teamLinks}>
              {keyringTeams.map((team) => (
                <Link key={team.teamId} to={`/${team.slug}`}>
                  Go to {team.name} →
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

import { useQuery } from "@tanstack/react-query";
import { Link, Navigate, useSearchParams } from "react-router";
import { fetchTeam } from "../api.js";
import styles from "./WallPage.module.css";

// The friendly wall: what a signed-out visitor sees — bounced here on
// any 401, or sent here by the server after an invalid/revoked join link
// (/?join=invalid). Nothing about any team leaks, and the page renders
// identically no matter why the visitor is signed out.
//
// Two refinements for visitors who aren't simply signed out:
//
// - A *signed-in* visitor landing on "/" directly — a PWA launch, a
//   typed URL — is forwarded to their team (REDESIGN.md's PWA section:
//   "start URL: root, redirects to team"). The last-visited slug lives
//   in localStorage; if the session for it still holds, we forward.
// - A visitor *bounced* here (?from=slug) asked for a specific team and
//   was refused. Silently substituting another team they're signed into
//   would paper over the failed request, so instead the wall explains
//   the one-team-at-a-time rule and offers that team as a visible link.
export function WallPage() {
  const [params] = useSearchParams();
  const invalidJoin = params.get("join") === "invalid";
  // A valid link whose player was removed from the roster. Only the link's
  // rightful holder can ever land here (the token is a 128-bit secret), so
  // naming the team leaks nothing they don't know — see DESIGN.md's Roster
  // history section for why this is a deliberate uniform-401 exception.
  const departedJoin = params.get("join") === "departed";
  const departedTeam = params.get("team");
  const from = params.get("from");

  const lastSlug = localStorage.getItem("lastTeamSlug");
  const sessionQuery = useQuery({
    queryKey: ["team", lastSlug],
    queryFn: () => fetchTeam(lastSlug!),
    // A dead join link means "show the message", never "forward away
    // from it" — even if the visitor also has a valid session.
    enabled: !invalidJoin && !departedJoin && lastSlug !== null,
    retry: false,
  });

  // Auto-forward only on a direct landing; a 401 here is not bounced
  // (we're already at "/"), so on failure the wall simply shows.
  if (!from && sessionQuery.isSuccess) {
    return <Navigate to={`/${lastSlug}`} replace />;
  }
  if (!from && sessionQuery.isPending && sessionQuery.fetchStatus !== "idle") {
    return null; // brief blank while checking; avoids flashing the wall
  }

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
        {from !== null && sessionQuery.isSuccess && (
          <>
            <p className={styles.note}>
              You can only be signed into one team at a time. If you’re
              trying to get to “{from}”, use the join link that team’s
              captain sent you, or ask them for a new one.
            </p>
            <p className={styles.goLink}>
              <Link to={`/${lastSlug}`}>
                Go to {sessionQuery.data.name} →
              </Link>
            </p>
          </>
        )}
      </div>
    </main>
  );
}

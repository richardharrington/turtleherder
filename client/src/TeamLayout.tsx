import { useQuery } from "@tanstack/react-query";
import { Link, Outlet, useLocation, useParams } from "react-router";
import { fetchTeam } from "./api.js";

// The original gave each page its own <h1>; the schedule page's was
// "Bobcats Game Schedule".
function pageTitle(pathname: string, slug: string, teamName: string): string {
  const rest = pathname.replace(`/${slug}`, "").replace(/\/$/, "");
  if (rest === "") return `${teamName} Game Schedule`;
  if (rest === "/players") return "Manage Player Roster";
  if (rest === "/players/new") return "Add New Player";
  if (/^\/players\/\d+\/edit$/.test(rest)) return "Edit Player";
  if (rest === "/games") return "Manage Games";
  if (rest === "/games/new") return "Add New Game";
  if (/^\/games\/\d+\/edit$/.test(rest)) return "Edit Game";
  return `${teamName} Game Schedule`; // single-game page
}

// Shell shared by every team page: the white card, the heading,
// and the home | manage roster | manage games link row.
export function TeamLayout() {
  const { teamSlug } = useParams<"teamSlug">();
  const location = useLocation();
  const teamQuery = useQuery({
    queryKey: ["team", teamSlug],
    queryFn: () => fetchTeam(teamSlug!),
    enabled: teamSlug !== undefined,
  });

  return (
    <div className="oneColElsCtr">
      <div id="container">
        <div id="mainContent">
          <div className="style1">
            {teamQuery.isPending && <p>Loading…</p>}
            {teamQuery.isError && <p className="error">Team not found.</p>}
            {teamQuery.isSuccess && (
              <>
                <h1>
                  {pageTitle(
                    location.pathname,
                    teamSlug!,
                    teamQuery.data.name,
                  )}
                </h1>
                <p className="link-row">
                  <span className="style1">
                    <Link to={`/${teamSlug}`}>home</Link> |{" "}
                    <Link to={`/${teamSlug}/players`}>manage roster</Link> |{" "}
                    <Link to={`/${teamSlug}/games`}>manage games</Link>
                  </span>
                </p>
                <Outlet context={teamQuery.data} />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

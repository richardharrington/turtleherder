import { useQuery } from "@tanstack/react-query";
import { Link, Outlet, useParams } from "react-router";
import { fetchTeam } from "./api.js";

// Shell shared by every team page: the white card, the heading,
// and the home | manage roster | manage games link row.
export function TeamLayout() {
  const { teamSlug } = useParams<"teamSlug">();
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
                <h1>{teamQuery.data.name}</h1>
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

import type { Team } from "@turtleherder/shared";
import { useOutletContext } from "react-router";

// Home page: game schedule with inline attendance editing and the
// roster report. Placeholder until the games endpoint exists.
export function SchedulePage() {
  const team = useOutletContext<Team>();

  return (
    <p>
      Schedule for the {team.name} goes here (need {team.minPlayers} players,
      {" "}{team.minQuotaPlayers} of whom must be {team.quotaLabel}).
    </p>
  );
}

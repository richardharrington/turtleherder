import type { RouteObject } from "react-router";
import { CreateTeamPage } from "./pages/CreateTeamPage.js";
import { GamePage } from "./pages/GamePage.js";
import { GamesPage } from "./pages/GamesPage.js";
import { ManageAccessPage } from "./pages/ManageAccessPage.js";
import { PlayersPage } from "./pages/PlayersPage.js";
import { SchedulePage } from "./pages/SchedulePage.js";
import { TeamSettingsPage } from "./pages/TeamSettingsPage.js";
import { WallPage } from "./pages/WallPage.js";
import { TeamLayout } from "./TeamLayout.js";

// Add and edit live inline on the Players/Games pages (milestone 5.8) —
// there are no dedicated form routes. The shareable single-game route
// stays. A route-object tree (data router) so dirty inline drafts can
// block in-app navigation via useBlocker.
export const routes: RouteObject[] = [
  {
    // The friendly wall: signed-out visitors land here (401 bounce or an
    // invalid join link's /?join=invalid redirect). Signed-in visitors
    // are forwarded to their team.
    path: "/",
    element: <WallPage />,
  },
  {
    path: "/create",
    element: <CreateTeamPage />,
  },
  {
    path: "/:teamSlug",
    element: <TeamLayout />,
    children: [
      { index: true, element: <SchedulePage /> },
      { path: "games", element: <GamesPage /> },
      { path: "games/:gameId", element: <GamePage /> },
      { path: "players", element: <PlayersPage /> },
      { path: "access", element: <ManageAccessPage /> },
      { path: "settings", element: <TeamSettingsPage /> },
    ],
  },
  {
    // Anything unmatched — including the retired /players/new and
    // /games/:id/edit form routes — lands on the wall, which forwards
    // signed-in visitors back to their team.
    path: "*",
    element: <WallPage />,
  },
];

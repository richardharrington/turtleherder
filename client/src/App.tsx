import { Route, Routes } from "react-router";
import { GameFormPage } from "./pages/GameFormPage.js";
import { GamePage } from "./pages/GamePage.js";
import { GamesPage } from "./pages/GamesPage.js";
import { ManageAccessPage } from "./pages/ManageAccessPage.js";
import { PlayerFormPage } from "./pages/PlayerFormPage.js";
import { PlayersPage } from "./pages/PlayersPage.js";
import { SchedulePage } from "./pages/SchedulePage.js";
import { WallPage } from "./pages/WallPage.js";
import { TeamLayout } from "./TeamLayout.js";

export function App() {
  return (
    <Routes>
      {/* The friendly wall: signed-out visitors land here (401 bounce or
          an invalid join link's /?join=invalid redirect). Signed-in
          visitors are forwarded to their team. */}
      <Route path="/" element={<WallPage />} />
      <Route path="/:teamSlug" element={<TeamLayout />}>
        <Route index element={<SchedulePage />} />
        <Route path="games" element={<GamesPage />} />
        <Route path="games/new" element={<GameFormPage />} />
        <Route path="games/:gameId" element={<GamePage />} />
        <Route path="games/:gameId/edit" element={<GameFormPage />} />
        <Route path="players" element={<PlayersPage />} />
        <Route path="players/new" element={<PlayerFormPage />} />
        <Route path="players/:playerId/edit" element={<PlayerFormPage />} />
        <Route path="access" element={<ManageAccessPage />} />
      </Route>
    </Routes>
  );
}

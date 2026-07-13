import { Route, Routes } from "react-router";
import { TeamLayout } from "./TeamLayout.js";
import { GameFormPage } from "./pages/GameFormPage.js";
import { GamePage } from "./pages/GamePage.js";
import { GamesPage } from "./pages/GamesPage.js";
import { PlayerFormPage } from "./pages/PlayerFormPage.js";
import { PlayersPage } from "./pages/PlayersPage.js";
import { SchedulePage } from "./pages/SchedulePage.js";

export function App() {
  return (
    <Routes>
      <Route path="/:teamSlug" element={<TeamLayout />}>
        <Route index element={<SchedulePage />} />
        <Route path="games" element={<GamesPage />} />
        <Route path="games/new" element={<GameFormPage />} />
        <Route path="games/:gameId" element={<GamePage />} />
        <Route path="games/:gameId/edit" element={<GameFormPage />} />
        <Route path="players" element={<PlayersPage />} />
        <Route path="players/new" element={<PlayerFormPage />} />
        <Route path="players/:playerId/edit" element={<PlayerFormPage />} />
      </Route>
    </Routes>
  );
}

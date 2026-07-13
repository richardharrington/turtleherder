import { Route, Routes } from "react-router";
import { TeamLayout } from "./TeamLayout.js";
import { GamePage } from "./pages/GamePage.js";
import { GamesPage } from "./pages/GamesPage.js";
import { PlayersPage } from "./pages/PlayersPage.js";
import { SchedulePage } from "./pages/SchedulePage.js";

export function App() {
  return (
    <Routes>
      <Route path="/:teamSlug" element={<TeamLayout />}>
        <Route index element={<SchedulePage />} />
        <Route path="games" element={<GamesPage />} />
        <Route path="games/:gameId" element={<GamePage />} />
        <Route path="players" element={<PlayersPage />} />
      </Route>
    </Routes>
  );
}

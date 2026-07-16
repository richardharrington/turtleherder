import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { AttendanceStatus } from "@turtleherder/shared";
import { putAttendance } from "./api.js";

// Shared by every attendance control (roster rows and the personal
// question card): upsert one player's status for one game, then refetch
// the schedule list and any single-game page.
export function useAttendanceMutation(
  slug: string,
  gameId: number,
  playerId: number,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (status: AttendanceStatus) =>
      putAttendance(slug, gameId, playerId, status),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["games", slug] }),
  });
}

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { AttendanceStatus } from "@turtleherder/shared";
import { putAttendance } from "./api.js";

// Shared by the expandable roster-row controls: upsert one player's
// status for one game, then refetch
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

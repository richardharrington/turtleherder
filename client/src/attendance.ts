import { useMutation, useQueryClient } from "@tanstack/react-query";
import { applyAttendance, type AttendanceStatus } from "@turtleherder/shared";
import { putAttendance } from "./api.js";

// Attendance is fully optimistic (milestone 5.8): a small, frequent,
// reversible enum edit. On mutate, every games cache — the schedule list
// and any single-game page — is rewritten immediately, so the selected
// control, colored phrase, roster report, and personal chip all update
// together. Failure restores the snapshots wholesale (all surfaces roll
// back together); success revalidates against the server.
export function useAttendanceMutation(
  slug: string,
  gameId: number,
  playerId: number,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (status: AttendanceStatus) =>
      putAttendance(slug, gameId, playerId, status),
    onMutate: async (status) => {
      await queryClient.cancelQueries({ queryKey: ["games", slug] });
      const snapshots = queryClient.getQueriesData({
        queryKey: ["games", slug],
      });
      queryClient.setQueriesData(
        { queryKey: ["games", slug] },
        (data: Parameters<typeof applyAttendance>[0]) =>
          applyAttendance(data, gameId, playerId, status),
      );
      return { snapshots };
    },
    onError: (_error, _status, context) => {
      for (const [key, data] of context?.snapshots ?? []) {
        queryClient.setQueryData(key, data);
      }
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["games", slug] }),
  });
}

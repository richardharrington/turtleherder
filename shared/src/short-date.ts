// Compact, unambiguous date rendering for dense rows (milestone 5.8):
// "Wed, Jul 22", adding the year only when the date falls outside the
// current calendar year — "Wed, Jul 22, 2027". Years are compared as
// wall-clock years in the team's timezone, so a game on New Year's Eve
// belongs to the year the team experiences it in.

function wallClockYear(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", { year: "numeric", timeZone }).format(
    date,
  );
}

export function formatShortDate(
  iso: string,
  timeZone: string,
  now: Date = new Date(),
): string {
  const date = new Date(iso);
  const sameYear = wallClockYear(date, timeZone) === wallClockYear(now, timeZone);
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
    timeZone,
  }).format(date);
}

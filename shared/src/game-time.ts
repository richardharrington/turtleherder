// Past/locked determination for a game, shared so the server (which
// enforces the lock) and the client (which renders from it) agree on the
// numbers. See DESIGN.md's Roster history section.

// Attendance writes are rejected once a game started this long ago. A grace
// period rather than starts_at itself, so someone who marked "not sure" and
// then played can still fix it; uniform 24h rather than end-of-day in the
// team's timezone, which would hand a 10am game fourteen hours and a 9pm
// game three.
export const ATTENDANCE_LOCK_HOURS = 24;

const HOUR_MS = 60 * 60 * 1000;

// Past games render in past tense (the report's anticipatory voice is wrong
// the moment the game starts), independent of the lock below.
export function isGamePast(startsAt: string, now = Date.now()): boolean {
  return Date.parse(startsAt) <= now;
}

// Between starts_at and the lock, the tense flips but the controls stay
// live — that window is exactly what the grace period is for.
export function isAttendanceLocked(startsAt: string, now = Date.now()): boolean {
  return now > Date.parse(startsAt) + ATTENDANCE_LOCK_HOURS * HOUR_MS;
}

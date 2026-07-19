// Date/time display in the team's timezone, matching the original's
// PHP formats: date('l, F j, Y') and date('g:i a').

export function formatGameDate(iso: string, timeZone: string): string {
  // e.g. "Sunday, January 5, 2010"
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone,
  }).format(new Date(iso));
}

// e.g. "January 5, 2026" — the Former players list's "Left …" date.
export function formatPlainDate(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone,
  }).format(new Date(iso));
}

function wallClockParts(date: Date, timeZone: string): Record<string, string> {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  return Object.fromEntries(
    parts.filter((p) => p.type !== "literal").map((p) => [p.type, p.value]),
  );
}

// Milliseconds the zone is ahead of UTC at the given instant.
function zoneOffsetMs(epochMs: number, timeZone: string): number {
  const p = wallClockParts(new Date(epochMs), timeZone);
  const asUtc = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour),
    Number(p.minute),
    Number(p.second),
  );
  return asUtc - Math.floor(epochMs / 1000) * 1000;
}

// ISO instant -> value for <input type="datetime-local">, in the team's zone.
export function instantToLocalInput(iso: string, timeZone: string): string {
  const p = wallClockParts(new Date(iso), timeZone);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

// <input type="datetime-local"> value, interpreted in the team's zone -> ISO
// instant. The second pass fixes guesses that land across a DST transition.
export function localInputToInstant(value: string, timeZone: string): string {
  const target = Date.parse(`${value}:00Z`);
  let epoch = target - zoneOffsetMs(target, timeZone);
  epoch = target - zoneOffsetMs(epoch, timeZone);
  return new Date(epoch).toISOString();
}

export function formatGameTime(iso: string, timeZone: string): string {
  // e.g. "6:07 pm" (Intl produces "6:07 PM", possibly with a narrow
  // no-break space before the lowercased am/pm)
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone,
  })
    .format(new Date(iso))
    .toLowerCase();
}

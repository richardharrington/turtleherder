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

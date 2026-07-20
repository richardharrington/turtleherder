import { describe, expect, it } from "vitest";
import { formatShortDate } from "./short-date.js";

const TZ = "America/New_York";
const NOW = new Date("2026-07-20T12:00:00-04:00");

describe("formatShortDate", () => {
  it("renders an abbreviated date without the year inside the current year", () => {
    expect(formatShortDate("2026-07-22T18:06:00-04:00", TZ, NOW)).toBe(
      "Wed, Jul 22",
    );
  });

  it("adds the year outside the current calendar year", () => {
    expect(formatShortDate("2027-09-01T18:30:00-04:00", TZ, NOW)).toBe(
      "Wed, Sep 1, 2027",
    );
    expect(formatShortDate("2025-03-07T14:00:00-05:00", TZ, NOW)).toBe(
      "Fri, Mar 7, 2025",
    );
  });

  it("compares wall-clock years in the team's timezone, not UTC", () => {
    // 11pm New Year's Eve in New York is already January 1 UTC; the team
    // experiences it in the old year, so no year is shown.
    const nye = "2026-12-31T23:00:00-05:00"; // 2027-01-01T04:00Z
    expect(formatShortDate(nye, TZ, new Date("2026-12-30T12:00:00-05:00"))).toBe(
      "Thu, Dec 31",
    );
    // And the mirror: midnight January 1 New York time viewed from
    // December 31 gets its year, because the team is in a new year.
    const jan1 = "2027-01-01T00:30:00-05:00";
    expect(
      formatShortDate(jan1, TZ, new Date("2026-12-31T12:00:00-05:00")),
    ).toBe("Fri, Jan 1, 2027");
  });
});

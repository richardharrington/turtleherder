/* Roster history: membership stints. See ai-specs/DESIGN.md's Roster history section.
 *
 * A game's roster is derived from the stints covering its starts_at, so past
 * games stop rendering against today's roster. No team_id here — player.team_id
 * stays the single source of truth for team scoping.
 */

exports.up = (pgm) => {
  pgm.createTable("roster_membership", {
    id: "id",
    player_id: {
      type: "integer",
      notNull: true,
      references: "player",
      onDelete: "CASCADE",
    },
    joined_at: { type: "timestamptz", notNull: true },
    // NULL = currently on the team.
    left_at: { type: "timestamptz" },
  });
  pgm.createIndex("roster_membership", "player_id");
  // At most one open stint per player. Overlapping *closed* stints aren't
  // reachable (nothing writes stint dates but now()), so this partial index
  // is the whole overlap guard — see the decision log.
  pgm.createIndex("roster_membership", "player_id", {
    name: "roster_membership_one_open_stint",
    unique: true,
    where: "left_at IS NULL",
  });

  // Backfill: one open stint per existing player. Join dates were never
  // recorded; '-infinity' says "unknown, effectively always" and keeps every
  // existing player on every existing game.
  pgm.sql(
    `INSERT INTO roster_membership (player_id, joined_at)
     SELECT id, '-infinity' FROM player`,
  );
};

exports.down = (pgm) => {
  pgm.dropTable("roster_membership");
};

/* Coed rule engine: split full strength from the forfeit line and store the
 * flat gender/keeper knobs designed in ai-specs/DESIGN.md. Legacy teams backfill to
 * their exact no-shorthanded behavior before the old columns are removed.
 */

exports.up = (pgm) => {
  pgm.addColumns("team", {
    full_side: { type: "integer" },
    min_to_play: { type: "integer" },
    men_ceiling: { type: "integer" },
    women_floor: { type: "integer" },
    floor_type: { type: "text" },
    keeper_scoping: {
      type: "text",
      notNull: true,
      default: "included",
    },
  });

  pgm.sql(
    `UPDATE team
     SET full_side = min_players,
         min_to_play = min_players,
         women_floor = NULLIF(min_quota_players, 0),
         floor_type = CASE
           WHEN min_quota_players > 0 THEN 'play_down'
           ELSE NULL
         END`,
  );

  pgm.alterColumn("team", "full_side", { notNull: true });
  pgm.alterColumn("team", "min_to_play", { notNull: true });
  pgm.sql(
    `ALTER TABLE team
       ADD CONSTRAINT team_floor_type_check
         CHECK (floor_type IN ('play_down', 'forfeit')),
       ADD CONSTRAINT team_keeper_scoping_check
         CHECK (keeper_scoping IN ('included', 'excluded')),
       ADD CONSTRAINT team_women_floor_type_check
         CHECK ((women_floor IS NULL) = (floor_type IS NULL))`,
  );

  pgm.dropColumns("team", ["min_players", "min_quota_players"]);
};

exports.down = (pgm) => {
  pgm.addColumns("team", {
    min_players: { type: "integer" },
    min_quota_players: { type: "integer" },
  });
  pgm.sql(
    `UPDATE team
     SET min_players = full_side,
         min_quota_players = COALESCE(women_floor, 0)`,
  );
  pgm.alterColumn("team", "min_players", { notNull: true });
  pgm.alterColumn("team", "min_quota_players", { notNull: true });
  pgm.dropColumns("team", [
    "full_side",
    "min_to_play",
    "men_ceiling",
    "women_floor",
    "floor_type",
    "keeper_scoping",
  ]);
};

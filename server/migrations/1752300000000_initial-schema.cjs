/* Initial schema: team, player, game, attendance. See ai-specs/DESIGN.md. */

exports.up = (pgm) => {
  pgm.createType("attendance_status", ["yes", "no", "not_sure"]);

  pgm.createTable("team", {
    id: "id",
    name: { type: "text", notNull: true },
    slug: { type: "text", notNull: true, unique: true },
    min_players: { type: "integer", notNull: true },
    min_quota_players: { type: "integer", notNull: true },
    quota_label: { type: "text", notNull: true },
    timezone: { type: "text", notNull: true },
  });

  pgm.createTable("player", {
    id: "id",
    team_id: {
      type: "integer",
      notNull: true,
      references: "team",
      onDelete: "CASCADE",
    },
    name: { type: "text", notNull: true },
    counts_toward_minimum: { type: "boolean", notNull: true },
  });
  pgm.createIndex("player", "team_id");

  pgm.createTable("game", {
    id: "id",
    team_id: {
      type: "integer",
      notNull: true,
      references: "team",
      onDelete: "CASCADE",
    },
    // null opponent_name means a bye week
    opponent_name: { type: "text" },
    opponent_color: { type: "text" },
    starts_at: { type: "timestamptz", notNull: true },
  });
  pgm.createIndex("game", "team_id");

  // A row is a response; a missing row means the player hasn't responded.
  pgm.createTable("attendance", {
    id: "id",
    player_id: {
      type: "integer",
      notNull: true,
      references: "player",
      onDelete: "CASCADE",
    },
    game_id: {
      type: "integer",
      notNull: true,
      references: "game",
      onDelete: "CASCADE",
    },
    status: { type: "attendance_status", notNull: true },
  });
  pgm.addConstraint("attendance", "attendance_player_game_unique", {
    unique: ["player_id", "game_id"],
  });
  pgm.createIndex("attendance", "game_id");
};

exports.down = (pgm) => {
  pgm.dropTable("attendance");
  pgm.dropTable("game");
  pgm.dropTable("player");
  pgm.dropTable("team");
  pgm.dropType("attendance_status");
};

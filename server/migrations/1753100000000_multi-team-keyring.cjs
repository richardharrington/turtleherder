/* Multi-team keyring: a session holds one player key per team. See ai-specs/DESIGN.md. */

exports.up = (pgm) => {
  // The redundant pair is the target of session_player's composite foreign
  // key, which guarantees its denormalized team_id agrees with player.team_id.
  pgm.addConstraint("player", "player_id_team_unique", {
    unique: ["id", "team_id"],
  });

  pgm.createTable("session_player", {
    session_id: {
      type: "text",
      notNull: true,
      references: "session",
      onDelete: "CASCADE",
    },
    player_id: { type: "integer", notNull: true },
    team_id: {
      type: "integer",
      notNull: true,
      references: "team",
      onDelete: "CASCADE",
    },
  });
  pgm.addConstraint("session_player", "session_player_player_team_fkey", {
    foreignKeys: {
      columns: ["player_id", "team_id"],
      references: "player(id, team_id)",
      onDelete: "CASCADE",
    },
  });
  pgm.addConstraint("session_player", "session_player_session_player_unique", {
    unique: ["session_id", "player_id"],
  });
  // This is the keyring invariant: one unambiguous player identity per team.
  pgm.addConstraint("session_player", "session_player_session_team_unique", {
    unique: ["session_id", "team_id"],
  });
  pgm.createIndex("session_player", "player_id");
  pgm.createIndex("session_player", "team_id");

  // Every pre-keyring session starts with its existing single player key.
  pgm.sql(
    `INSERT INTO session_player (session_id, player_id, team_id)
     SELECT s.id, p.id, p.team_id
     FROM session s JOIN player p ON p.id = s.player_id`,
  );

  pgm.dropColumn("session", "player_id");
};

exports.down = (pgm) => {
  pgm.addColumns("session", {
    player_id: { type: "integer" },
  });
  pgm.sql(
    `UPDATE session s
     SET player_id = (
       SELECT sp.player_id FROM session_player sp
       WHERE sp.session_id = s.id ORDER BY sp.team_id LIMIT 1
     )`,
  );
  // The old model cannot represent an empty keyring.
  pgm.sql(`DELETE FROM session WHERE player_id IS NULL`);
  pgm.alterColumn("session", "player_id", { notNull: true });
  pgm.addConstraint("session", "session_player_id_fkey", {
    foreignKeys: {
      columns: "player_id",
      references: "player(id)",
      onDelete: "CASCADE",
    },
  });
  pgm.createIndex("session", "player_id");

  pgm.dropTable("session_player");
  pgm.dropConstraint("player", "player_id_team_unique");
};

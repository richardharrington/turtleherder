/* Auth: join token + captain flag on player, session table. See DESIGN.md. */

exports.up = (pgm) => {
  // Only used to backfill tokens for pre-auth rows; the app generates
  // tokens with crypto.randomBytes.
  pgm.createExtension("pgcrypto", { ifNotExists: true });

  pgm.addColumns("player", {
    join_token: { type: "text" },
    // Set = the token is revoked and /join rejects it. Cleared on regenerate.
    join_token_revoked_at: { type: "timestamptz" },
    is_captain: { type: "boolean", notNull: true, default: false },
  });
  pgm.sql(
    `UPDATE player SET join_token =
       replace(replace(rtrim(encode(gen_random_bytes(16), 'base64'), '='), '+', '-'), '/', '_')`,
  );
  pgm.alterColumn("player", "join_token", { notNull: true });
  pgm.addConstraint("player", "player_join_token_unique", {
    unique: ["join_token"],
  });

  pgm.createTable("session", {
    id: { type: "text", primaryKey: true },
    player_id: {
      type: "integer",
      notNull: true,
      references: "player",
      onDelete: "CASCADE",
    },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    last_seen_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.createIndex("session", "player_id");
};

exports.down = (pgm) => {
  pgm.dropTable("session");
  pgm.dropConstraint("player", "player_join_token_unique");
  pgm.dropColumns("player", ["join_token", "join_token_revoked_at", "is_captain"]);
};

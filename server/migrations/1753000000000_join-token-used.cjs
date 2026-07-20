/* Design refinement: durable first-use tracking for the current join token.
 *
 * Means "the first successful redemption of the current token" — not recent
 * activity. Set once by a valid active-token exchange (COALESCE semantics),
 * reset to NULL by regeneration, preserved by revocation. Existing rows get
 * no backfill: their usage genuinely isn't known.
 */

exports.up = (pgm) => {
  pgm.addColumns("player", {
    join_token_used_at: { type: "timestamptz" },
  });
};

exports.down = (pgm) => {
  pgm.dropColumns("player", ["join_token_used_at"]);
};

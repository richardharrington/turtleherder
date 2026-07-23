/* A team with no gender rule has no protected-category nouns. Keep both noun
 * forms present exactly when either gender constraint is configured.
 */

exports.up = (pgm) => {
  pgm.alterColumn("team", "quota_noun_singular", { notNull: false });
  pgm.alterColumn("team", "quota_noun_plural", { notNull: false });
  pgm.sql(
    `UPDATE team
     SET quota_noun_singular = NULL, quota_noun_plural = NULL
     WHERE women_floor IS NULL AND men_ceiling IS NULL`,
  );
  pgm.sql(
    `ALTER TABLE team
       ADD CONSTRAINT team_quota_nouns_check
       CHECK (
         (women_floor IS NULL AND men_ceiling IS NULL) =
         (quota_noun_singular IS NULL AND quota_noun_plural IS NULL)
         AND (quota_noun_singular IS NULL) = (quota_noun_plural IS NULL)
       )`,
  );
};

exports.down = (pgm) => {
  pgm.dropConstraint("team", "team_quota_nouns_check");
  pgm.sql(
    `UPDATE team
     SET quota_noun_singular = 'player', quota_noun_plural = 'players'
     WHERE quota_noun_singular IS NULL`,
  );
  pgm.alterColumn("team", "quota_noun_singular", { notNull: true });
  pgm.alterColumn("team", "quota_noun_plural", { notNull: true });
};

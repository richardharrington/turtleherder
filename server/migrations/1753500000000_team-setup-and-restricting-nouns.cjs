/* Coed-rules setup lifecycle: web-created teams start without a chosen format
 * or gender-rule answer. Existing/operator-created teams remain complete.
 */

exports.up = (pgm) => {
  pgm.alterColumn("team", "full_side", { notNull: false });
  pgm.alterColumn("team", "min_to_play", { notNull: false });
  pgm.addColumns("team", {
    setup_completed_at: { type: "timestamptz" },
    restricting_noun_singular: { type: "text" },
    restricting_noun_plural: { type: "text" },
  });

  pgm.sql(
    `UPDATE team
     SET setup_completed_at = now(),
         restricting_noun_singular = CASE WHEN men_ceiling IS NOT NULL THEN 'man' ELSE NULL END,
         restricting_noun_plural = CASE WHEN men_ceiling IS NOT NULL THEN 'men' ELSE NULL END`,
  );

  pgm.dropConstraint("team", "team_quota_nouns_check");
  pgm.sql(
    `ALTER TABLE team
       ADD CONSTRAINT team_quota_nouns_check
       CHECK (
         (women_floor IS NULL AND men_ceiling IS NULL) =
         (quota_noun_singular IS NULL AND quota_noun_plural IS NULL)
         AND (quota_noun_singular IS NULL) = (quota_noun_plural IS NULL)
       ),
       ADD CONSTRAINT team_restricting_nouns_check
       CHECK (
         (men_ceiling IS NULL) =
         (restricting_noun_singular IS NULL AND restricting_noun_plural IS NULL)
         AND (restricting_noun_singular IS NULL) = (restricting_noun_plural IS NULL)
       ),
       ADD CONSTRAINT team_setup_format_check
       CHECK (
         (full_side IS NULL) = (min_to_play IS NULL)
         AND (setup_completed_at IS NULL OR full_side IS NOT NULL)
       )`,
  );
};

exports.down = (pgm) => {
  pgm.dropConstraint("team", "team_setup_format_check");
  pgm.dropConstraint("team", "team_restricting_nouns_check");
  pgm.dropConstraint("team", "team_quota_nouns_check");
  pgm.sql(
    `ALTER TABLE team
       ADD CONSTRAINT team_quota_nouns_check
       CHECK (
         (women_floor IS NULL AND men_ceiling IS NULL) =
         (quota_noun_singular IS NULL AND quota_noun_plural IS NULL)
         AND (quota_noun_singular IS NULL) = (quota_noun_plural IS NULL)
       )`,
  );
  // A down migration has no representation for an unfinished team. Give any
  // such rows the old signup defaults before restoring the old NOT NULLs.
  pgm.sql(
    `UPDATE team SET full_side = 7, min_to_play = 5
     WHERE full_side IS NULL OR min_to_play IS NULL`,
  );
  pgm.dropColumns("team", [
    "setup_completed_at",
    "restricting_noun_singular",
    "restricting_noun_plural",
  ]);
  pgm.alterColumn("team", "full_side", { notNull: true });
  pgm.alterColumn("team", "min_to_play", { notNull: true });
};

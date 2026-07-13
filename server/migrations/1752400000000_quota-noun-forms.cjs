/* The roster report needs both singular and plural forms of the quota
   noun ("one more woman" / "two more women"), and the plural isn't
   derivable from one string. Replace quota_label with explicit forms. */

exports.up = (pgm) => {
  pgm.renameColumn("team", "quota_label", "quota_noun_plural");
  pgm.addColumn("team", {
    quota_noun_singular: { type: "text", notNull: true, default: "" },
  });
  pgm.sql(
    "UPDATE team SET quota_noun_singular = 'woman' WHERE quota_noun_plural = 'women'",
  );
  pgm.alterColumn("team", "quota_noun_singular", { default: null });
};

exports.down = (pgm) => {
  pgm.dropColumn("team", "quota_noun_singular");
  pgm.renameColumn("team", "quota_noun_plural", "quota_label");
};

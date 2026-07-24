/* Preserve the first keeper question on re-edit: no goalkeeper is distinct
 * from a goalkeeper that counts, while both remain mathematically bound.
 */

exports.up = (pgm) => {
  pgm.dropConstraint("team", "team_keeper_scoping_check");
  pgm.sql(
    `ALTER TABLE team
       ADD CONSTRAINT team_keeper_scoping_check
       CHECK (keeper_scoping IN ('none', 'included', 'excluded'))`,
  );
};

exports.down = (pgm) => {
  pgm.dropConstraint("team", "team_keeper_scoping_check");
  pgm.sql(
    `UPDATE team SET keeper_scoping = 'included'
     WHERE keeper_scoping = 'none'`,
  );
  pgm.sql(
    `ALTER TABLE team
       ADD CONSTRAINT team_keeper_scoping_check
       CHECK (keeper_scoping IN ('included', 'excluded'))`,
  );
};

import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  teamRulesInputSchema,
  type Team,
  type TeamRulesInput,
} from "@turtleherder/shared";
import { useState } from "react";
import { useNavigate } from "react-router";
import { updateTeamRules } from "../api.js";
import { Button } from "./Button.js";
import { Expander } from "./disclosure.js";
import styles from "./CoedRulesForm.module.css";

type GenderChoice = "yes" | "no" | null;
type RuleShape = "play_down" | "forfeit" | "cap" | "cap_and_floor" | null;

export function singularizeNoun(plural: string): string {
  const value = plural.trim();
  const lower = value.toLowerCase();
  if (lower === "women") return "woman";
  if (lower === "men") return "man";
  if (lower === "people") return "person";
  if (lower === "players") return "player";
  return value.endsWith("s") ? value.slice(0, -1) : value;
}

function initialShape(team: Team): RuleShape {
  if (team.menCeiling !== null && team.womenFloor !== null) return "cap_and_floor";
  if (team.menCeiling !== null) return "cap";
  if (team.womenFloor !== null) return team.floorType === "forfeit" ? "forfeit" : "play_down";
  return null;
}

function numberValue(value: string): number {
  return value.trim() === "" ? Number.NaN : Number(value);
}

function Radio({
  name,
  value,
  checked,
  onChange,
  children,
}: {
  name: string;
  value: string;
  checked: boolean;
  onChange: () => void;
  children: React.ReactNode;
}) {
  return (
    <label className={styles.radio}>
      <input type="radio" name={name} value={value} checked={checked} onChange={onChange} />
      <span>{children}</span>
    </label>
  );
}

export function CoedRulesForm({
  team,
  setup = false,
  onSaved,
}: {
  team: Team;
  setup?: boolean;
  onSaved?: (team: Team) => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const existingShape = initialShape(team);
  const [fullSide, setFullSide] = useState(team.fullSide?.toString() ?? "");
  const [minToPlay, setMinToPlay] = useState(team.minToPlay?.toString() ?? "");
  const [gender, setGender] = useState<GenderChoice>(
    team.setupCompletedAt === null ? null : existingShape === null ? "no" : "yes",
  );
  const [shape, setShape] = useState<RuleShape>(existingShape);
  const [womenFloor, setWomenFloor] = useState(team.womenFloor?.toString() ?? "");
  const [menCeiling, setMenCeiling] = useState(team.menCeiling?.toString() ?? "");
  const [protectedPlural, setProtectedPlural] = useState(team.quotaNounPlural ?? "women");
  const [protectedSingular, setProtectedSingular] = useState(team.quotaNounSingular ?? "woman");
  // These stay in state when a captain switches from a cap to a floor shape.
  const [restrictingPlural, setRestrictingPlural] = useState(team.restrictingNounPlural ?? "men");
  const [restrictingSingular, setRestrictingSingular] = useState(team.restrictingNounSingular ?? "man");
  const [hasGoalkeeper, setHasGoalkeeper] = useState<boolean | null>(
    team.keeperScoping === "excluded" ? true : team.setupCompletedAt === null ? null : false,
  );
  const [keeperCounts, setKeeperCounts] = useState<boolean | null>(
    team.keeperScoping === "excluded" ? false : team.setupCompletedAt === null ? null : true,
  );
  const [errors, setErrors] = useState<Record<string, string>>({});

  const capShape = shape === "cap" || shape === "cap_and_floor";
  const mutation = useMutation({
    mutationFn: (input: TeamRulesInput) => updateTeamRules(team.slug, input),
    onSuccess: (updated) => {
      queryClient.setQueryData(["team", team.slug], updated);
      onSaved?.(updated);
      if (setup) navigate(`/${team.slug}`, { replace: true });
    },
  });

  function setPlural(
    next: string,
    currentPlural: string,
    currentSingular: string,
    setPluralValue: (value: string) => void,
    setSingularValue: (value: string) => void,
  ) {
    setPluralValue(next);
    if (currentSingular === singularizeNoun(currentPlural)) {
      setSingularValue(singularizeNoun(next));
    }
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};
    if (gender === null) nextErrors.gender = "Choose Yes or No.";
    if (gender === "yes" && shape === null) nextErrors.shape = "Choose the rule that matches your league.";
    if (gender === "yes" && capShape && hasGoalkeeper === null) {
      nextErrors.hasGoalkeeper = "Choose Yes or No.";
    }
    if (gender === "yes" && capShape && hasGoalkeeper === true && keeperCounts === null) {
      nextErrors.keeperCounts = "Choose Yes or No.";
    }

    const hasGenderRule = gender === "yes" && shape !== null;
    const input: TeamRulesInput = {
      fullSide: numberValue(fullSide),
      minToPlay: numberValue(minToPlay),
      menCeiling: hasGenderRule && capShape ? numberValue(menCeiling) : null,
      womenFloor:
        hasGenderRule && (shape === "play_down" || shape === "forfeit" || shape === "cap_and_floor")
          ? numberValue(womenFloor)
          : null,
      floorType:
        !hasGenderRule || shape === "cap"
          ? null
          : shape === "play_down"
            ? "play_down"
            : "forfeit",
      keeperScoping:
        hasGenderRule && capShape && hasGoalkeeper === true && keeperCounts === false
          ? "excluded"
          : "included",
      quotaNounSingular: hasGenderRule ? protectedSingular : null,
      quotaNounPlural: hasGenderRule ? protectedPlural : null,
      restrictingNounSingular: hasGenderRule && capShape ? restrictingSingular : null,
      restrictingNounPlural: hasGenderRule && capShape ? restrictingPlural : null,
    };
    const parsed = teamRulesInputSchema.safeParse(input);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = String(issue.path[0] ?? "form");
        nextErrors[field] ??= issue.message;
      }
    }
    if (Object.keys(nextErrors).length > 0 || !parsed.success) {
      setErrors(nextErrors);
      return;
    }
    setErrors({});
    mutation.mutate(parsed.data);
  }

  const noun = protectedPlural || "women";
  const restrictingNoun = restrictingPlural || "men";

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <section className={styles.section}>
        <h2>How many play?</h2>
        <div className={styles.formatFields}>
          <label>
            Players per side
            <input
              type="number"
              min="0"
              inputMode="numeric"
              placeholder="7"
              value={fullSide}
              onChange={(event) => setFullSide(event.target.value)}
            />
            <small>a full side at full strength</small>
            {errors.fullSide && <small className={styles.error}>{errors.fullSide}</small>}
          </label>
          <label>
            Fewest to play
            <input
              type="number"
              min="0"
              inputMode="numeric"
              placeholder="5"
              value={minToPlay}
              onChange={(event) => setMinToPlay(event.target.value)}
            />
            <small>any fewer and it’s a forfeit</small>
            {errors.minToPlay && <small className={styles.error}>{errors.minToPlay}</small>}
          </label>
        </div>
      </section>

      <section className={styles.section}>
        <h2>Does your league have a gender rule?</h2>
        <div className={styles.yesNo}>
          <Radio name="gender-rule" value="yes" checked={gender === "yes"} onChange={() => setGender("yes")}>Yes</Radio>
          <Radio name="gender-rule" value="no" checked={gender === "no"} onChange={() => setGender("no")}>No</Radio>
        </div>
        {errors.gender && <p className={styles.error}>{errors.gender}</p>}

        <Expander open={gender === "yes"}>
          <div className={styles.revealed}>
            <h3>Which describes it?</h3>
            <div className={styles.shapes}>
              <Radio name="rule-shape" value="play-down" checked={shape === "play_down"} onChange={() => setShape("play_down")}>
                A minimum of <input aria-label="Minimum protected players" type="number" min="0" inputMode="numeric" value={shape === "play_down" ? womenFloor : ""} onFocus={() => setShape("play_down")} onChange={(event) => setWomenFloor(event.target.value)} onClick={(event) => event.stopPropagation()} /> {noun}, otherwise we play a person short.
              </Radio>
              <Radio name="rule-shape" value="forfeit" checked={shape === "forfeit"} onChange={() => setShape("forfeit")}>
                A minimum of <input aria-label="Minimum protected players for forfeit rule" type="number" min="0" inputMode="numeric" value={shape === "forfeit" ? womenFloor : ""} onFocus={() => setShape("forfeit")} onChange={(event) => setWomenFloor(event.target.value)} onClick={(event) => event.stopPropagation()} /> {noun}, otherwise we forfeit.
              </Radio>
              <Radio name="rule-shape" value="cap" checked={shape === "cap"} onChange={() => setShape("cap")}>
                A maximum of <input aria-label="Maximum restricted players" type="number" min="0" inputMode="numeric" value={shape === "cap" ? menCeiling : ""} onFocus={() => setShape("cap")} onChange={(event) => setMenCeiling(event.target.value)} onClick={(event) => event.stopPropagation()} /> {restrictingNoun}.
              </Radio>
              <Radio name="rule-shape" value="cap-and-floor" checked={shape === "cap_and_floor"} onChange={() => setShape("cap_and_floor")}>
                A maximum of <input aria-label="Maximum restricted players for combined rule" type="number" min="0" inputMode="numeric" value={shape === "cap_and_floor" ? menCeiling : ""} onFocus={() => setShape("cap_and_floor")} onChange={(event) => setMenCeiling(event.target.value)} onClick={(event) => event.stopPropagation()} /> {restrictingNoun}, and a minimum of <input aria-label="Minimum protected players for combined rule" type="number" min="0" inputMode="numeric" value={shape === "cap_and_floor" ? womenFloor : ""} onFocus={() => setShape("cap_and_floor")} onChange={(event) => setWomenFloor(event.target.value)} onClick={(event) => event.stopPropagation()} /> {noun}, or we forfeit.
              </Radio>
            </div>
            {(errors.shape || errors.womenFloor || errors.menCeiling) && (
              <p className={styles.error}>{errors.shape ?? errors.womenFloor ?? errors.menCeiling}</p>
            )}

            <Expander open={capShape}>
              <div className={styles.nestedQuestion}>
                <h3>Does your sport have a goalkeeper?</h3>
                <div className={styles.yesNo}>
                  <Radio name="has-goalkeeper" value="yes" checked={hasGoalkeeper === true} onChange={() => setHasGoalkeeper(true)}>Yes</Radio>
                  <Radio name="has-goalkeeper" value="no" checked={hasGoalkeeper === false} onChange={() => setHasGoalkeeper(false)}>No</Radio>
                </div>
                {errors.hasGoalkeeper && <p className={styles.error}>{errors.hasGoalkeeper}</p>}
                <Expander open={hasGoalkeeper === true}>
                  <div className={styles.keeperCounts}>
                    <h3>Does the keeper count toward the men limit?</h3>
                    <div className={styles.yesNo}>
                      <Radio name="keeper-counts" value="yes" checked={keeperCounts === true} onChange={() => setKeeperCounts(true)}>Yes</Radio>
                      <Radio name="keeper-counts" value="no" checked={keeperCounts === false} onChange={() => setKeeperCounts(false)}>No</Radio>
                    </div>
                    {errors.keeperCounts && <p className={styles.error}>{errors.keeperCounts}</p>}
                  </div>
                </Expander>
              </div>
            </Expander>

            <div className={styles.nouns}>
              <label>
                Category we’re protecting
                <input
                  type="text"
                  value={protectedPlural}
                  onChange={(event) => setPlural(event.target.value, protectedPlural, protectedSingular, setProtectedPlural, setProtectedSingular)}
                />
                <small>e.g. women, women/non-binary, females</small>
              </label>
              <label>
                Singular
                <input type="text" value={protectedSingular} onChange={(event) => setProtectedSingular(event.target.value)} />
              </label>
              {(errors.quotaNounSingular || errors.quotaNounPlural) && (
                <p className={styles.error}>{errors.quotaNounSingular ?? errors.quotaNounPlural}</p>
              )}

              <Expander open={capShape}>
                <div className={styles.restrictingFields}>
                  <label>
                    Category we’re restricting
                    <input
                      type="text"
                      value={restrictingPlural}
                      onChange={(event) => setPlural(event.target.value, restrictingPlural, restrictingSingular, setRestrictingPlural, setRestrictingSingular)}
                    />
                    <small>e.g. men, cis-men</small>
                  </label>
                  <label>
                    Singular
                    <input type="text" value={restrictingSingular} onChange={(event) => setRestrictingSingular(event.target.value)} />
                  </label>
                  {(errors.restrictingNounSingular || errors.restrictingNounPlural) && (
                    <p className={styles.error}>
                      {errors.restrictingNounSingular ?? errors.restrictingNounPlural}
                    </p>
                  )}
                </div>
              </Expander>
            </div>
          </div>
        </Expander>
      </section>

      {mutation.isError && <p className={styles.error}>Couldn’t save these rules. Please try again.</p>}
      <Button type="submit" disabled={mutation.isPending} className={styles.submit}>
        {mutation.isPending ? "Saving…" : setup ? "Finish setup" : "Save rules"}
      </Button>
    </form>
  );
}

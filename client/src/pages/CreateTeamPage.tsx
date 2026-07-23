import { useMutation } from "@tanstack/react-query";
import { createTeamInputSchema, slugifyTeamName } from "@turtleherder/shared";
import { useState } from "react";
import { Link } from "react-router";
import { ApiError, createTeam } from "../api.js";
import { Button } from "../components/Button.js";
import styles from "./CreateTeamPage.module.css";

function detectedTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

function numberValue(value: string): number {
  return value.trim() === "" ? Number.NaN : Number(value);
}

export function CreateTeamPage() {
  const [name, setName] = useState("");
  const [captain, setCaptain] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [fullSide, setFullSide] = useState("7");
  const [minToPlay, setMinToPlay] = useState("5");
  const [timezone, setTimezone] = useState(detectedTimezone);
  const [website, setWebsite] = useState("");
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState(false);

  const mutation = useMutation({ mutationFn: createTeam });

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const parsed = createTeamInputSchema.safeParse({
      name,
      captain,
      slug,
      fullSide: numberValue(fullSide),
      minToPlay: numberValue(minToPlay),
      timezone,
      menCeiling: null,
      womenFloor: null,
      floorType: null,
      keeperScoping: "included",
      quotaNounSingular: null,
      quotaNounPlural: null,
      website,
    });
    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const field = String(issue.path[0] ?? "form");
        errors[field] ??= issue.message;
      }
      setValidationErrors(errors);
      return;
    }
    setValidationErrors({});
    mutation.mutate(parsed.data);
  }

  if (mutation.isSuccess) {
    const result = mutation.data;
    return (
      <main className={styles.page}>
        <section className={styles.card}>
          <p className={styles.wordmark}>Turtleherder</p>
          <h1>Your team is ready</h1>
          <div className={styles.saveCallout}>
            <h2>Save this link</h2>
            <p>
              Bookmark it or email it to yourself. It’s your personal captain
              link and the way back in if this browser is ever signed out.
            </p>
            <code>{result.captainJoinUrl}</code>
            <Button
              variant="secondary"
              onClick={() => {
                void navigator.clipboard.writeText(result.captainJoinUrl).then(() => {
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 2000);
                });
              }}
            >
              {copied ? "Copied!" : "Copy captain link"}
            </Button>
          </div>
          <Link className={styles.enterLink} to={`/${result.slug}`}>
            Go to your team →
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <Link to="/" className={styles.wordmark}>Turtleherder</Link>
        <h1>Create a team</h1>
        <p className={styles.intro}>Start with the basics. You can change these later.</p>
        <form onSubmit={submit} noValidate>
          <label>
            Team name
            <input
              type="text"
              autoComplete="organization"
              value={name}
              onChange={(event) => {
                const next = event.target.value;
                setName(next);
                if (!slugEdited) setSlug(slugifyTeamName(next));
              }}
            />
            {validationErrors.name && <small className={styles.error}>{validationErrors.name}</small>}
          </label>
          <label>
            Your name
            <input
              type="text"
              autoComplete="name"
              value={captain}
              onChange={(event) => setCaptain(event.target.value)}
            />
            {validationErrors.captain && <small className={styles.error}>{validationErrors.captain}</small>}
          </label>
          <label>
            Team URL
            <span className={styles.slugInput}>
              <span>{window.location.origin}/</span>
              <input
                type="text"
                autoCapitalize="none"
                spellCheck={false}
                value={slug}
                onChange={(event) => {
                  setSlugEdited(true);
                  setSlug(event.target.value.toLowerCase());
                }}
              />
            </span>
            {validationErrors.slug && <small className={styles.error}>{validationErrors.slug}</small>}
          </label>
          <div className={styles.numberFields}>
            <label>
              Full side
              <input
                type="number"
                min="0"
                inputMode="numeric"
                value={fullSide}
                onChange={(event) => setFullSide(event.target.value)}
              />
              {validationErrors.fullSide && <small className={styles.error}>{validationErrors.fullSide}</small>}
            </label>
            <label>
              Minimum to play
              <input
                type="number"
                min="0"
                inputMode="numeric"
                value={minToPlay}
                onChange={(event) => setMinToPlay(event.target.value)}
              />
              {validationErrors.minToPlay && <small className={styles.error}>{validationErrors.minToPlay}</small>}
            </label>
          </div>
          <p className={styles.note}>These are editable defaults — change them to fit your sport.</p>
          <label>
            Timezone
            <input
              type="text"
              value={timezone}
              autoComplete="off"
              onChange={(event) => setTimezone(event.target.value)}
            />
            {validationErrors.timezone && <small className={styles.error}>{validationErrors.timezone}</small>}
          </label>
          <label className={styles.honeypot} aria-hidden="true">
            Website
            <input
              type="text"
              name="website"
              tabIndex={-1}
              autoComplete="off"
              value={website}
              onChange={(event) => setWebsite(event.target.value)}
            />
          </label>
          {mutation.isError && (
            <p className={styles.submitError}>
              {mutation.error instanceof ApiError && mutation.error.status === 409
                ? "That URL’s taken. Try another one."
                : "Couldn’t create the team. Please try again."}
            </p>
          )}
          <Button type="submit" disabled={mutation.isPending} className={styles.submit}>
            {mutation.isPending ? "Creating…" : "Create team"}
          </Button>
        </form>
      </section>
    </main>
  );
}

import { useMutation } from "@tanstack/react-query";
import { publicCreateTeamInputSchema, slugifyTeamName } from "@turtleherder/shared";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { ApiError, createTeam } from "../api.js";
import { Button } from "../components/Button.js";
import styles from "./CreateTeamPage.module.css";

function detectedTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

export function CreateTeamPage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [captain, setCaptain] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [timezone, setTimezone] = useState(detectedTimezone);
  const [website, setWebsite] = useState("");
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  const mutation = useMutation({
    mutationFn: createTeam,
    onSuccess: (result) => navigate(`/${result.slug}/setup`, { replace: true }),
  });

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const parsed = publicCreateTeamInputSchema.safeParse({
      name,
      captain,
      slug,
      timezone,
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

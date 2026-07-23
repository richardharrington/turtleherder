import { useMutation, useQueryClient } from "@tanstack/react-query";
import { teamSettingsInputSchema } from "@turtleherder/shared";
import { useState } from "react";
import { useOutletContext } from "react-router";
import { ApiError, updateTeamSettings } from "../api.js";
import { Button } from "../components/Button.js";
import type { TeamOutletContext } from "../TeamLayout.js";
import styles from "./TeamSettingsPage.module.css";

export function TeamSettingsPage() {
  const { team } = useOutletContext<TeamOutletContext>();
  const queryClient = useQueryClient();
  const [name, setName] = useState(team.name);
  const [timezone, setTimezone] = useState(team.timezone);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const mutation = useMutation({
    mutationFn: updateTeamSettings.bind(null, team.slug),
    onSuccess: (updated) => {
      queryClient.setQueryData(["team", team.slug], updated);
      void queryClient.invalidateQueries({ queryKey: ["sessionTeams"] });
    },
  });

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const parsed = teamSettingsInputSchema.safeParse({ name, timezone });
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        next[String(issue.path[0] ?? "form")] ??= issue.message;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    mutation.mutate(parsed.data);
  }

  if (mutation.isError && mutation.error instanceof ApiError && mutation.error.status === 403) {
    return <p>Only captains can change team settings.</p>;
  }

  const dirty = name !== team.name || timezone !== team.timezone;
  return (
    <section className={styles.card}>
      <form onSubmit={submit} noValidate>
        <label>
          Team name
          <input type="text" value={name} onChange={(event) => setName(event.target.value)} />
          {errors.name && <small className={styles.error}>{errors.name}</small>}
        </label>
        <label>
          Timezone
          <input type="text" value={timezone} onChange={(event) => setTimezone(event.target.value)} />
          {errors.timezone && <small className={styles.error}>{errors.timezone}</small>}
        </label>
        <div className={styles.slugNote}>
          <strong>Team URL</strong>
          <code>{window.location.origin}/{team.slug}</code>
          <small>The team URL can’t be changed after creation.</small>
        </div>
        {mutation.isError && <p className={styles.error}>Couldn’t save settings. Try again.</p>}
        <div className={styles.actions}>
          <Button type="submit" disabled={!dirty || mutation.isPending}>
            {mutation.isPending ? "Saving…" : mutation.isSuccess && !dirty ? "Saved ✓" : "Save changes"}
          </Button>
        </div>
      </form>
    </section>
  );
}

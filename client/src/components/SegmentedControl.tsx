import type { AttendanceStatus } from "@turtleherder/shared";
import styles from "./SegmentedControl.module.css";

// The attendance control: three pill buttons in one visual group
// ("pick one of these"), 44px tall for thumbs. Semantically a radio
// group — the real inputs are visually hidden, the labels are the pills.

const CHOICES: Array<[AttendanceStatus, string]> = [
  ["yes", "Yes"],
  ["no", "No"],
  ["not_sure", "Not sure"],
];

export function SegmentedControl({
  name,
  value,
  disabled,
  onChange,
}: {
  name: string;
  value: AttendanceStatus | null;
  disabled?: boolean;
  onChange: (status: AttendanceStatus) => void;
}) {
  return (
    <div className={styles.group} role="radiogroup">
      {CHOICES.map(([status, label]) => (
        <label
          key={status}
          className={[
            styles.option,
            value === status ? styles.selected : "",
            disabled ? styles.disabled : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <input
            type="radio"
            className={styles.radio}
            name={name}
            checked={value === status}
            disabled={disabled}
            onChange={() => onChange(status)}
          />
          {label}
        </label>
      ))}
    </div>
  );
}

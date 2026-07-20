import {
  useEffect,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import { useBlocker } from "react-router";
import { Button } from "./Button.js";
import styles from "./disclosure.module.css";

// The expandable-row language of milestone 5.8, shared by the management
// and access pages: data stays visible and actions stay quiet until the
// row that owns them is opened. One row or Add draft is open per page; a
// dirty draft intercepts row switches, collapses, and navigation with an
// inline discard confirmation (never a modal or native dialog), plus the
// browser's standard unsaved-changes warning on refresh/close.

// What stopped the user when the open draft was dirty: another row
// (string), a plain collapse (null), or an in-app navigation.
type Pending = { target: string | null } | "navigation";

export interface DisclosurePage {
  openKey: string | null;
  /** True when the open draft is showing its discard confirmation. */
  confirmingDiscard: boolean;
  isOpen(key: string): boolean;
  /** Summary-row activation: open this row, or collapse it if open. */
  toggle(key: string): void;
  /** Collapse without any dirty check — Cancel and post-save both use it. */
  close(): void;
  setDirty(dirty: boolean): void;
  discard(): void;
  keepEditing(): void;
}

export function useDisclosurePage(): DisclosurePage {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);

  // In-app navigation away from a dirty draft is held while the open form
  // shows the discard confirmation.
  const blocker = useBlocker(dirty);
  const blocked = blocker.state === "blocked";
  useEffect(() => {
    if (blocked) setPending("navigation");
  }, [blocked]);

  // Refresh/tab close gets the browser's own unsaved-changes warning.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function open(target: string | null) {
    setOpenKey(target);
    setPending(null);
    setDirty(false);
  }

  return {
    openKey,
    confirmingDiscard: pending !== null,
    isOpen: (key) => openKey === key,
    toggle(key) {
      const target = openKey === key ? null : key;
      if (openKey !== null && dirty) {
        setPending({ target });
        return;
      }
      open(target);
    },
    close: () => open(null),
    setDirty,
    discard() {
      if (pending === "navigation") {
        open(null);
        blocker.proceed?.();
        return;
      }
      open(pending ? pending.target : null);
    },
    keepEditing() {
      if (pending === "navigation") blocker.reset?.();
      setPending(null);
    },
  };
}

// A click or keypress on an interactive element nested in the summary
// (the access page's Copy button) belongs to that element, not the row.
function fromInteractiveChild(event: {
  target: EventTarget | null;
  currentTarget: EventTarget | null;
}): boolean {
  const target = event.target;
  return (
    target instanceof HTMLElement &&
    target !== event.currentTarget &&
    target.closest("button, a, input, select, textarea") !== null
  );
}

// Interaction contract for a collapsed summary: whole-row activation,
// Enter/Space, aria-expanded. `role: "button"` suits a list-item summary;
// table rows keep their row role (aria-expanded is valid there too).
export function summaryProps(
  open: boolean,
  onToggle: () => void,
  { asButton = true } = {},
) {
  return {
    ...(asButton ? { role: "button" as const } : {}),
    tabIndex: 0,
    "aria-expanded": open,
    onClick: (event: MouseEvent) => {
      if (!fromInteractiveChild(event)) onToggle();
    },
    onKeyDown: (event: KeyboardEvent) => {
      if (fromInteractiveChild(event)) return;
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onToggle();
      }
    },
  };
}

// Animated disclosure container: ~170ms ease-out height + fade to open, a
// touch faster ease-in to close, instant under prefers-reduced-motion (the
// transition is dropped in CSS). Content stays mounted briefly after close
// so the collapse has something to animate.
export function Expander({
  open,
  children,
}: {
  open: boolean;
  children: ReactNode;
}) {
  const [rendered, setRendered] = useState(open);
  useEffect(() => {
    if (open) {
      setRendered(true);
      return;
    }
    const timer = window.setTimeout(() => setRendered(false), 200);
    return () => window.clearTimeout(timer);
  }, [open]);

  return (
    <div
      className={open ? `${styles.expander} ${styles.expanderOpen}` : styles.expander}
      aria-hidden={!open}
    >
      <div className={styles.expanderInner}>{rendered ? children : null}</div>
    </div>
  );
}

export function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      className={open ? `${styles.chevron} ${styles.chevronOpen}` : styles.chevron}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

// A restrained text action guarded by an inline confirmation that names
// the record and explains consequences. Used for remove/delete/add-back
// here and regenerate/revoke on the access page.
export function ConfirmAction({
  trigger,
  variant = "danger",
  prompt,
  confirmLabel,
  busyLabel,
  doneLabel,
  done = false,
  pending = false,
  disabled = false,
  error,
  onConfirm,
  onOpenChange,
  testId,
}: {
  trigger: string;
  variant?: "danger" | "neutral";
  prompt: ReactNode;
  confirmLabel: string;
  busyLabel: string;
  /** Shown in place of the actions during the ~500ms success beat. */
  doneLabel?: string;
  done?: boolean;
  pending?: boolean;
  disabled?: boolean;
  error?: ReactNode;
  onConfirm: () => void;
  onOpenChange?: (open: boolean) => void;
  testId?: string;
}) {
  const [open, setOpen] = useState(false);

  function setOpenAndNotify(next: boolean) {
    setOpen(next);
    onOpenChange?.(next);
  }

  if (!open) {
    return (
      <button
        type="button"
        className={variant === "danger" ? styles.dangerText : styles.neutralText}
        disabled={disabled}
        onClick={() => setOpenAndNotify(true)}
      >
        {trigger}
      </button>
    );
  }

  return (
    <div className={styles.confirm} data-testid={testId ?? "inline-confirm"}>
      <p className={styles.confirmPrompt}>{prompt}</p>
      {error != null && <p className={`error ${styles.confirmError}`}>{error}</p>}
      {done ? (
        <p className={styles.doneBeat}>{doneLabel}</p>
      ) : (
        <div className={styles.confirmActions}>
          <button
            type="button"
            className={styles.cancelText}
            disabled={pending}
            onClick={() => setOpenAndNotify(false)}
          >
            Never mind
          </button>
          <Button
            small
            variant={variant === "danger" ? "danger" : "secondary"}
            disabled={pending}
            onClick={onConfirm}
          >
            {pending ? busyLabel : confirmLabel}
          </Button>
        </div>
      )}
    </div>
  );
}

export type SavePhase = "idle" | "saving" | "saved";

// The shared expanded-form shell: fields, validation/request errors
// immediately above the footer, separated Cancel / compact Save footer
// (44px targets), and the destructive zone below — never as Save's peer.
// While the page holds a discard confirmation for this draft, that
// confirmation replaces the action area.
export function FormShell({
  onSave,
  onCancel,
  phase,
  saveLabel,
  savingLabel,
  savedLabel,
  saveDisabled = false,
  error,
  discard,
  destructive,
  children,
}: {
  onSave: () => void;
  onCancel: () => void;
  phase: SavePhase;
  saveLabel: string;
  savingLabel: string;
  savedLabel: string;
  saveDisabled?: boolean;
  /** Validation or request error, rendered just above the footer. */
  error?: ReactNode;
  /** Set while the page is asking whether to discard this dirty draft. */
  discard: { active: boolean; onDiscard: () => void; onKeep: () => void };
  destructive?: ReactNode;
  children: ReactNode;
}) {
  return (
    <form
      className={styles.form}
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        onSave();
      }}
    >
      <div className={styles.fields}>{children}</div>
      {error != null && <p className={`error ${styles.formError}`}>{error}</p>}
      {discard.active ? (
        <div className={styles.discardBar} data-testid="discard-confirm">
          <span className={styles.discardPrompt}>Discard unsaved changes?</span>
          <button
            type="button"
            className={styles.cancelText}
            onClick={discard.onKeep}
          >
            Keep editing
          </button>
          <Button small variant="danger" onClick={discard.onDiscard}>
            Discard
          </Button>
        </div>
      ) : (
        <div className={styles.footer}>
          <button
            type="button"
            className={styles.cancelText}
            disabled={phase !== "idle"}
            onClick={onCancel}
          >
            Cancel
          </button>
          <Button
            type="submit"
            small
            disabled={saveDisabled || phase !== "idle"}
          >
            {phase === "saving"
              ? savingLabel
              : phase === "saved"
                ? savedLabel
                : saveLabel}
          </Button>
        </div>
      )}
      {destructive != null && (
        <div className={styles.destructiveZone}>{destructive}</div>
      )}
    </form>
  );
}

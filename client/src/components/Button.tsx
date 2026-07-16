import type { ComponentProps } from "react";
import { Link } from "react-router";
import styles from "./Button.module.css";

// The design system's three button variants (REDESIGN.md). Button renders
// a real <button>; ButtonLink is the same look on a router <Link> for
// button-shaped navigation ("Add new player").

type Variant = "primary" | "secondary" | "danger";

function classes(variant: Variant, small?: boolean, extra?: string): string {
  return [styles.button, styles[variant], small ? styles.small : "", extra]
    .filter(Boolean)
    .join(" ");
}

export function Button({
  variant = "primary",
  small,
  className,
  ...props
}: ComponentProps<"button"> & { variant?: Variant; small?: boolean }) {
  return (
    <button
      type="button"
      {...props}
      className={classes(variant, small, className)}
    />
  );
}

export function ButtonLink({
  variant = "primary",
  small,
  className,
  ...props
}: Omit<ComponentProps<typeof Link>, "className"> & {
  variant?: Variant;
  small?: boolean;
  className?: string;
}) {
  return <Link {...props} className={classes(variant, small, className)} />;
}

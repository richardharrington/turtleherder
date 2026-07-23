import { useMutation, useQuery } from "@tanstack/react-query";
import type { Me, SessionTeam, Team } from "@turtleherder/shared";
import {
  CalendarDays,
  ChevronDown,
  House,
  KeyRound,
  LogOut,
  Settings,
  Users,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useParams } from "react-router";
import {
  fetchMe,
  fetchSessionTeams,
  fetchTeam,
  signOut,
} from "./api.js";
import styles from "./TeamLayout.module.css";

// What every team page receives from the layout.
export interface TeamOutletContext {
  team: Team;
  me: Me;
}

// Calm one-word titles (milestone 5.8); the schedule page carries the
// team name.
function pageTitle(pathname: string, slug: string, teamName: string): string {
  const rest = pathname.replace(`/${slug}`, "").replace(/\/$/, "");
  if (rest === "/players") return "Players";
  if (rest === "/games") return "Games";
  if (rest === "/access") return "Access";
  if (rest === "/settings") return "Settings";
  return `${teamName} Schedule`; // schedule + single-game page
}

// Nav destinations: bottom bar on mobile, sidebar on tablet/desktop.
// The Access link is captains-only (the route still guards itself).
function NavItems({
  team,
  me,
  itemClass,
}: {
  team: Team;
  me: Me;
  itemClass: string;
}) {
  const items = [
    { to: `/${team.slug}`, label: "Home", Icon: House, end: true },
    { to: `/${team.slug}/players`, label: "Players", Icon: Users, end: false },
    { to: `/${team.slug}/games`, label: "Games", Icon: CalendarDays, end: false },
    ...(me.isCaptain
      ? [
          { to: `/${team.slug}/access`, label: "Access", Icon: KeyRound, end: false },
          { to: `/${team.slug}/settings`, label: "Settings", Icon: Settings, end: false },
        ]
      : []),
  ];
  return (
    <>
      {items.map(({ to, label, Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            isActive ? `${itemClass} ${styles.active}` : itemClass
          }
        >
          <Icon size={20} aria-hidden />
          <span>{label}</span>
        </NavLink>
      ))}
    </>
  );
}

function TeamSwitcher({
  currentTeam,
  teams,
  className,
}: {
  currentTeam: Team;
  teams: SessionTeam[];
  className: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const signOutMutation = useMutation({
    mutationFn: signOut,
    onSuccess: () => {
      localStorage.removeItem("lastTeamSlug");
      localStorage.removeItem("keyringChooserSeen");
      window.location.assign("/");
    },
  });

  useEffect(() => {
    if (!open) return;
    function dismiss(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  return (
    <div className={`${styles.switcher} ${className}`} ref={rootRef}>
      <button
        type="button"
        className={styles.switcherButton}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((value) => !value)}
      >
        <span>{currentTeam.name}</span>
        <ChevronDown
          size={18}
          aria-hidden
          className={open ? styles.switcherChevronOpen : undefined}
        />
      </button>
      {open && (
        <div className={styles.switcherMenu} role="menu">
          <p className={styles.switcherLabel}>Your teams</p>
          {teams.map((team) => (
            <Link
              key={team.teamId}
              to={`/${team.slug}`}
              role="menuitem"
              aria-current={team.slug === currentTeam.slug ? "page" : undefined}
              className={`${styles.switcherTeam} ${
                team.slug === currentTeam.slug ? styles.switcherCurrent : ""
              }`}
              onClick={() => setOpen(false)}
            >
              <span>{team.name}</span>
              <small>{team.playerName}</small>
            </Link>
          ))}
          <div className={styles.switcherDivider} />
          <button
            type="button"
            role="menuitem"
            className={styles.signOut}
            disabled={signOutMutation.isPending}
            onClick={() => signOutMutation.mutate()}
          >
            <LogOut size={17} aria-hidden />
            {signOutMutation.isPending ? "Signing out…" : "Sign out"}
          </button>
          {signOutMutation.isError && (
            <p className={styles.switcherError}>Couldn’t sign out. Try again.</p>
          )}
        </div>
      )}
    </div>
  );
}

// Shell shared by every team page: sidebar (tablet/desktop) or bottom
// nav (mobile), the page heading, and the team/me context for pages.
export function TeamLayout() {
  const { teamSlug } = useParams<"teamSlug">();
  const location = useLocation();
  const teamQuery = useQuery({
    queryKey: ["team", teamSlug],
    queryFn: () => fetchTeam(teamSlug!),
    enabled: teamSlug !== undefined,
  });
  const meQuery = useQuery({
    queryKey: ["me", teamSlug],
    queryFn: () => fetchMe(teamSlug!),
    enabled: teamSlug !== undefined,
  });
  const sessionTeamsQuery = useQuery({
    queryKey: ["sessionTeams"],
    queryFn: fetchSessionTeams,
  });

  // Lets the wall page forward a signed-in visitor (e.g. a PWA launch
  // at "/") back to the most recently visited team.
  const loadedSlug = teamQuery.isSuccess ? teamQuery.data.slug : null;
  useEffect(() => {
    if (loadedSlug !== null) {
      localStorage.setItem("lastTeamSlug", loadedSlug);
    }
  }, [loadedSlug]);

  if (teamQuery.isPending || meQuery.isPending) {
    return <p className={styles.message}>Loading…</p>;
  }
  // 401s never get here (the global listener bounces to the wall);
  // this is for genuine failures.
  if (teamQuery.isError || meQuery.isError) {
    return <p className={styles.message}>Something went wrong.</p>;
  }

  const team = teamQuery.data;
  const me = meQuery.data;
  const sessionTeams =
    sessionTeamsQuery.data && sessionTeamsQuery.data.length > 0
      ? sessionTeamsQuery.data
      : [
          {
            teamId: team.id,
            slug: team.slug,
            name: team.name,
            playerId: me.playerId,
            playerName: me.name,
          },
        ];

  const relativePath = location.pathname.replace(`/${teamSlug}`, "");
  const widePage =
    relativePath.startsWith("/players") ||
    relativePath === "/games" ||
    relativePath === "/access" ||
    relativePath === "/settings";

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <TeamSwitcher
          currentTeam={team}
          teams={sessionTeams}
          className={styles.desktopSwitcher!}
        />
        <NavItems team={team} me={me} itemClass={styles.sidebarItem!} />
      </aside>
      <main
        className={`${styles.main} ${
          widePage ? styles.wideMain : styles.scheduleMain
        }`}
      >
        <TeamSwitcher
          currentTeam={team}
          teams={sessionTeams}
          className={styles.mobileSwitcher!}
        />
        <h1>{pageTitle(location.pathname, teamSlug!, team.name)}</h1>
        <Outlet context={{ team, me } satisfies TeamOutletContext} />
      </main>
      <nav className={styles.bottomNav}>
        <NavItems team={team} me={me} itemClass={styles.bottomNavItem!} />
      </nav>
    </div>
  );
}

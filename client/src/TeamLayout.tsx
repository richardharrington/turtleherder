import { useQuery } from "@tanstack/react-query";
import type { Me, Team } from "@turtleherder/shared";
import { CalendarDays, House, KeyRound, Users } from "lucide-react";
import { useEffect } from "react";
import { NavLink, Outlet, useLocation, useParams } from "react-router";
import { fetchMe, fetchTeam } from "./api.js";
import styles from "./TeamLayout.module.css";

// What every team page receives from the layout.
export interface TeamOutletContext {
  team: Team;
  me: Me;
}

// The original gave each page its own <h1>; the schedule page's was
// "Bobcats Game Schedule".
function pageTitle(pathname: string, slug: string, teamName: string): string {
  const rest = pathname.replace(`/${slug}`, "").replace(/\/$/, "");
  if (rest === "") return `${teamName} Game Schedule`;
  if (rest === "/players") return "Manage Player Roster";
  if (rest === "/players/new") return "Add New Player";
  if (/^\/players\/\d+\/edit$/.test(rest)) return "Edit Player";
  if (rest === "/games") return "Manage Games";
  if (rest === "/games/new") return "Add New Game";
  if (/^\/games\/\d+\/edit$/.test(rest)) return "Edit Game";
  if (rest === "/access") return "Manage Team Access";
  return `${teamName} Game Schedule`; // single-game page
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
      ? [{ to: `/${team.slug}/access`, label: "Access", Icon: KeyRound, end: false }]
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

  // Lets the wall page forward a signed-in visitor (e.g. a PWA launch
  // at "/") back to their team.
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

  const relativePath = location.pathname.replace(`/${teamSlug}`, "");
  const widePage = relativePath.startsWith("/players") || relativePath === "/games" || relativePath === "/access";

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.teamName}>{team.name}</div>
        <NavItems team={team} me={me} itemClass={styles.sidebarItem!} />
      </aside>
      <main className={`${styles.main} ${widePage ? styles.wideMain : styles.scheduleMain}`}>
        <h1>{pageTitle(location.pathname, teamSlug!, team.name)}</h1>
        <Outlet context={{ team, me } satisfies TeamOutletContext} />
      </main>
      <nav className={styles.bottomNav}>
        <NavItems team={team} me={me} itemClass={styles.bottomNavItem!} />
      </nav>
    </div>
  );
}

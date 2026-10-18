"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Icon, type IconName } from "./icons";
import { initials } from "./kit";
import { ToastProvider, useToast } from "./toast";

interface NavItem {
  href: string;
  label: string;
  short?: string;
  icon: IconName;
  match: string; // path prefix that marks this item active
  exclude?: string; // a more specific item that owns this sub-path
  needs?: string; // permission required to see this item
}

const PRIMARY: NavItem[] = [
  { href: "/dashboard", match: "/dashboard", label: "Overview", short: "Home", icon: "home" },
  { href: "/leads", match: "/leads", exclude: "/leads/recovery", label: "Leads", icon: "filter" },
  { href: "/leads/recovery", match: "/leads/recovery", label: "Recovery queue", short: "Recovery", icon: "life" },
  { href: "/pipelines/default", match: "/pipelines", label: "Sales pipeline", short: "Pipeline", icon: "trend" },
  { href: "/contacts", match: "/contacts", label: "Customers", icon: "people" },
  { href: "/inbox", match: "/inbox", label: "Conversations", short: "Inbox", icon: "chat" },
  { href: "/appointments", match: "/appointments", label: "Appointments", icon: "calendar" },
];
const SECONDARY: NavItem[] = [
  { href: "/team", match: "/team", label: "Team", icon: "people" },
  { href: "/settings/assignment", match: "/settings/assignment", label: "Assignment rules", icon: "settings" },
  { href: "/settings/pipelines", match: "/settings/pipelines", label: "Pipelines & fields", icon: "settings", needs: "crm.view" },
  { href: "/settings/profile", match: "/settings/profile", label: "Profile", icon: "settings" },
  { href: "/settings/integrations", match: "/settings/integrations", label: "Integrations", icon: "plug" },
  { href: "/audit", match: "/audit", label: "Audit log", icon: "check", needs: "audit.view" },
];
const BOTTOM = [PRIMARY[0], PRIMARY[1], PRIMARY[2], PRIMARY[4]];

export interface ShellProps {
  workspaceName: string;
  userName: string;
  roleLabel: string;
  recoveryCount?: number;
  permissions?: string[];
  statusControl?: React.ReactNode;
  signOut: React.ReactNode;
  children: React.ReactNode;
}

function SearchBox() {
  const toast = useToast();
  return (
    <button type="button" className="global-search" onClick={() => toast("Global search arrives with the CRM records.")}>
      <Icon name="search" />
      <span>Search anything...</span>
      <span className="kbd">⌘ K</span>
    </button>
  );
}

function Frame({ workspaceName, userName, roleLabel, recoveryCount = 0, permissions, statusControl, signOut, children }: ShellProps) {
  const pathname = usePathname();
  // The drawer is open only for the page it was opened on, so navigating closes it.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const setOpen = (value: boolean) => setOpenOn(value ? pathname : null);
  const toast = useToast();
  const isActive = (n: NavItem) =>
    (pathname === n.match || pathname.startsWith(n.match + "/")) && !(n.exclude && (pathname === n.exclude || pathname.startsWith(n.exclude + "/")));

  const link = (n: NavItem) => (
    <Link key={n.href} href={n.href} className={`nav-link${isActive(n) ? " active" : ""}`} aria-current={isActive(n) ? "page" : undefined}>
      <Icon name={n.icon} />
      <span className="nav-label">{n.label}</span>
      {n.href === "/leads/recovery" && recoveryCount > 0 && <span className="mini-count urgent">{recoveryCount}</span>}
    </Link>
  );
  const crumb = [...PRIMARY, ...SECONDARY].find((n) => isActive(n))?.label ?? "Overview";

  return (
    <>
      <div className="app">
        <aside className={`sidebar${open ? " open" : ""}`} id="sidebar" aria-label="Primary">
          <div className="brand">
            <div className="brand-symbol">R</div>
            <div className="brand-name">
              relay<b>hq</b>
            </div>
          </div>
          <div className="brand-version">Operations workspace</div>
          <div className="workspace-switch">
            <div className="workspace-avatar">{initials(workspaceName)}</div>
            <div className="workspace-meta">
              <b>{workspaceName}</b>
              <small>Growth workspace</small>
            </div>
            <span aria-hidden="true">⌄</span>
          </div>
          <nav className="nav-group" aria-label="Command center">
            <div className="nav-title">COMMAND CENTER</div>
            {PRIMARY.map(link)}
          </nav>
          <div className="nav-divider" />
          <nav className="nav-group" aria-label="Workspace">
            <div className="nav-title">WORKSPACE</div>
            {SECONDARY.filter((n) => !n.needs || permissions?.includes(n.needs)).map(link)}
          </nav>
          <div className="sidebar-footer">
            <div className="help-card">
              <div className="help-head">Never miss the moment.</div>
              <p>Every lead, owned. Every follow-up, visible. Every opportunity, connected.</p>
              <Link href="/settings/assignment">Explore workflows →</Link>
            </div>
            <div className="person-profile">
              <span className="avatar" aria-hidden="true">
                {initials(userName)}
              </span>
              <div className="who">
                <b>{userName}</b>
                <small>{roleLabel}</small>
              </div>
              {signOut}
            </div>
          </div>
        </aside>
        <div className={`mobile-shade${open ? " show" : ""}`} onClick={() => setOpen(false)} aria-hidden="true" />
        <main className="main">
          <header className="topbar">
            <div className="topbar-left">
              <button type="button" className="icon-button mobile-menu" aria-label="Open navigation" aria-expanded={open} onClick={() => setOpen(true)}>
                <Icon name="menu" />
              </button>
              <span className="topbar-small">{workspaceName}</span>
              <span className="breadcrumb-sep topbar-small">/</span>
              <b>{crumb}</b>
            </div>
            <div className="topbar-right">
              {statusControl}
              <SearchBox />
              <button type="button" className="icon-button notif" aria-label="Notifications" onClick={() => toast("Notifications arrive with realtime events.")}>
                <Icon name="bell" />
              </button>
              <button type="button" className="icon-button" aria-label="Help" onClick={() => toast("Help center is not set up yet.")}>
                <Icon name="help" />
              </button>
              <div className="top-avatar" aria-hidden="true">
                {initials(userName)}
              </div>
            </div>
          </header>
          <div className="content">{children}</div>
        </main>
      </div>
      <nav className="mobile-bottom" aria-label="Quick navigation">
        {BOTTOM.map((n) => (
          <Link key={n.href} href={n.href} className={isActive(n) ? "active" : ""} style={{ display: "flex", alignItems: "center", flexDirection: "column", gap: 5, minWidth: 65 }}>
            <Icon name={n.icon} />
            {n.short ?? n.label}
          </Link>
        ))}
      </nav>
    </>
  );
}

export function AppShell(props: ShellProps) {
  return (
    <ToastProvider>
      <Frame {...props} />
    </ToastProvider>
  );
}

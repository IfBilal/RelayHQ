"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon, type IconName } from "./icons";
import { useToast } from "./toast";

export type Tone = "green" | "amber" | "rose" | "slate" | "navy";

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

export function Avatar({
  name,
  tone = "",
  className = "",
  style,
}: {
  name: string;
  tone?: "" | "warm" | "blue" | "pink";
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <span className={`avatar ${tone} ${className}`.trim()} style={style} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

/** Status is always text; colour only reinforces it. */
export function Chip({ tone = "green", children }: { tone?: Tone; children: React.ReactNode }) {
  return <span className={`chip ${tone}`}>{children}</span>;
}

type BtnStyle = "primary" | "small" | "small primary" | "hero-action" | "";

export function LinkButton({ href, style = "", children }: { href: string; style?: BtnStyle; children: React.ReactNode }) {
  return (
    <Link href={href} className={`btn ${style}`.trim()}>
      {children}
    </Link>
  );
}

/** For actions whose backend isn't built yet: tells the user instead of pretending to work. */
export function PendingButton({ style = "", note, children }: { style?: BtnStyle; note: string; children: React.ReactNode }) {
  const toast = useToast();
  return (
    <button type="button" className={`btn ${style}`.trim()} onClick={() => toast(note)}>
      {children}
    </button>
  );
}

export function PageHeader({
  workspace,
  title,
  subtitle,
  actions,
}: {
  workspace: string;
  title: string;
  subtitle: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="section-top">
      <div>
        <div className="eyebrow">
          <span className="tiny-dot" /> {workspace.toUpperCase()} / WORKSPACE
        </div>
        <h1>{title}</h1>
        <p className="subline">{subtitle}</p>
      </div>
      {actions && <div className="actions">{actions}</div>}
    </div>
  );
}

export function Metric({
  title,
  value,
  sub,
  icon,
  href,
}: {
  title: string;
  value: string;
  sub: React.ReactNode;
  icon: IconName;
  href?: string;
}) {
  const body = (
    <>
      <div className="metric-top">
        {title}
        <span className="metric-icon">
          <Icon name={icon} />
        </span>
      </div>
      <div className="metric-number cash">{value}</div>
      <div className="metric-sub">{sub}</div>
    </>
  );
  return href ? (
    <Link href={href} className="card metric" style={{ display: "block" }}>
      {body}
    </Link>
  ) : (
    <div className="card metric">{body}</div>
  );
}

export function Notice({
  icon = "alert",
  tone = "amber",
  title,
  children,
  action,
}: {
  icon?: IconName;
  tone?: "amber" | "green";
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  const green = tone === "green";
  return (
    <div className="notice-bar" style={green ? { background: "#eff7f2", borderColor: "#dcece2" } : undefined}>
      <div className="alert-icon" style={green ? { background: "#d8eee0", color: "#277f65" } : undefined}>
        <Icon name={icon} large />
      </div>
      <div className="notice-main">
        <b>{title}</b>
        <p>{children}</p>
      </div>
      {action}
    </div>
  );
}

export function Timeline({ entries }: { entries: { title: string; body: string; meta: string; urgent?: boolean }[] }) {
  return (
    <div className="timeline">
      {entries.map((e) => (
        <div key={e.title + e.meta} className={`timeline-entry${e.urgent ? " urgent" : ""}`}>
          <b>{e.title}</b>
          <p>{e.body}</p>
          <time>{e.meta}</time>
        </div>
      ))}
    </div>
  );
}

/** Button group with one selected value (period toggles, filter tabs). */
export function Segmented({ options, initial = 0, tabs = false }: { options: string[]; initial?: number; tabs?: boolean }) {
  const [selected, setSelected] = useState(initial);
  return (
    <div className={tabs ? "filter-tabs" : "segmented"} role="group">
      {options.map((label, i) => (
        <button
          key={label}
          type="button"
          aria-pressed={i === selected}
          className={`${tabs ? "filter-tab" : "segment"}${i === selected ? (tabs ? " active" : " selected") : ""}`}
          onClick={() => setSelected(i)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

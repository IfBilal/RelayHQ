"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PERMISSIONS } from "@/contracts/permissions";
import type { InvitationRow, MemberRow, RoleRow } from "../server/team";

type ApiJson = { error?: { message?: string }; inviteUrl?: string };
type Result = { ok: boolean; text: string } | null;

async function send(method: string, url: string, body: unknown): Promise<{ ok: boolean; json: ApiJson }> {
  try {
    const res = await fetch(url, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { ok: res.ok, json: (await res.json().catch(() => ({}))) as ApiJson };
  } catch {
    return { ok: false, json: { error: { message: "We couldn't reach the server." } } };
  }
}
const errText = (json: ApiJson, fallback: string) => json?.error?.message ?? fallback;

function Status({ result }: { result: Result }) {
  if (!result) return null;
  return (
    <p role={result.ok ? "status" : "alert"} style={{ marginTop: 10, fontSize: 12, color: result.ok ? "var(--green, #2f7d5b)" : "var(--coral)" }}>
      {result.text}
    </p>
  );
}

export function InviteForm({ roles, isOwner }: { roles: RoleRow[]; isOwner: boolean }) {
  const router = useRouter();
  const userRole = roles.find((r) => r.name === "User") ?? roles[0];
  const [email, setEmail] = useState("");
  const [baseRole, setBaseRole] = useState<"user" | "admin">("user");
  const [roleId, setRoleId] = useState(userRole?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result>(null);
  const [link, setLink] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setResult(null);
    setLink(null);
    const { ok, json } = await send("POST", "/api/v1/team/invitations", { email, baseRole, roleId });
    setBusy(false);
    if (!ok) return setResult({ ok: false, text: errText(json, "Couldn't create the invitation.") });
    setLink(json.inviteUrl ?? null);
    setEmail("");
    setResult({ ok: true, text: "Invitation created. Copy the link now: it is shown once and valid for 7 days." });
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="card panel" aria-label="Invite a member">
      <h2>Invite a teammate</h2>
      <div className="formrow" style={{ marginTop: 14 }}>
        <div>
          <label className="formlabel" htmlFor="inv-email">Email</label>
          <input id="inv-email" type="email" required maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} className="cal-input" style={{ width: "100%", margin: 0 }} />
        </div>
        <div>
          <label className="formlabel" htmlFor="inv-role">Permission role</label>
          <select id="inv-role" value={roleId} onChange={(e) => setRoleId(e.target.value)} className="cal-input" style={{ width: "100%", margin: 0 }}>
            {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>
      </div>
      <div style={{ marginBottom: 14 }}>
        <label className="formlabel" htmlFor="inv-base">Access level</label>
        <select id="inv-base" value={baseRole} onChange={(e) => setBaseRole(e.target.value as "user" | "admin")} className="cal-input" style={{ width: "100%", margin: 0 }}>
          <option value="user">Team member</option>
          {isOwner && <option value="admin">Admin</option>}
        </select>
      </div>
      <button type="submit" className="btn primary" disabled={busy || !roleId}>{busy ? "Creating…" : "Create invitation"}</button>
      <Status result={result} />
      {link && (
        <div style={{ marginTop: 10 }}>
          <label className="formlabel" htmlFor="inv-link">Invitation link</label>
          <input id="inv-link" readOnly value={link} onFocus={(e) => e.currentTarget.select()} className="cal-input" style={{ width: "100%", margin: 0 }} />
        </div>
      )}
    </form>
  );
}

export function MemberAccess({ member, roles, isSelf, canEdit, isOwner }: { member: MemberRow; roles: RoleRow[]; isSelf: boolean; canEdit: boolean; isOwner: boolean }) {
  const router = useRouter();
  const [baseRole, setBaseRole] = useState(member.base_role === "admin" ? "admin" : "user");
  const [roleId, setRoleId] = useState(member.permission_role_id ?? roles[0]?.id ?? "");
  const [enabled, setEnabled] = useState(member.enabled);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result>(null);
  const dirty = baseRole !== member.base_role || roleId !== member.permission_role_id || enabled !== member.enabled;

  async function save() {
    setBusy(true);
    setResult(null);
    const { ok, json } = await send("PATCH", `/api/v1/team/${member.user_id}/access`, { baseRole, roleId, enabled });
    setBusy(false);
    setResult(ok ? { ok: true, text: "Saved." } : { ok: false, text: errText(json, "Couldn't save.") });
    router.refresh();
  }

  if (member.base_role === "owner" || !canEdit || isSelf) return <span className="member-secondary">{member.base_role === "owner" ? "Owner · full access" : (roles.find((r) => r.id === member.permission_role_id)?.name ?? "—")}</span>;
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      <select aria-label={`Access level for ${member.name}`} value={baseRole} onChange={(e) => setBaseRole(e.target.value as "admin" | "user")} className="cal-input" style={{ margin: 0, height: 32, fontSize: 11 }} disabled={!isOwner && member.base_role === "admin"}>
        <option value="user">Team member</option>
        {(isOwner || member.base_role === "admin") && <option value="admin">Admin</option>}
      </select>
      <select aria-label={`Permission role for ${member.name}`} value={roleId} onChange={(e) => setRoleId(e.target.value)} className="cal-input" style={{ margin: 0, height: 32, fontSize: 11 }}>
        {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
      </select>
      <label style={{ fontSize: 11, display: "inline-flex", gap: 4, alignItems: "center" }}>
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> Active
      </label>
      <button type="button" className="btn" onClick={save} disabled={busy || !dirty}>{busy ? "Saving…" : "Save"}</button>
      <Status result={result} />
    </div>
  );
}

export function RoleMatrix({ roles, catalog, canEdit }: { roles: RoleRow[]; catalog: { key: string; description: string }[]; canEdit: boolean }) {
  const router = useRouter();
  const [state, setState] = useState<Record<string, Set<string>>>(() => Object.fromEntries(roles.map((r) => [r.id, new Set(r.permissions)])));
  const [busy, setBusy] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, Result>>({});

  const toggle = (roleId: string, key: string) =>
    setState((s) => {
      const next = new Set(s[roleId]);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return { ...s, [roleId]: next };
    });

  async function save(role: RoleRow) {
    setBusy(role.id);
    const { ok, json } = await send("PUT", `/api/v1/team/roles/${role.id}`, { permissions: [...state[role.id]].filter((k) => (PERMISSIONS as readonly string[]).includes(k)) });
    setBusy(null);
    setResults((r) => ({ ...r, [role.id]: ok ? { ok: true, text: "Saved. Applies on the member's next request." } : { ok: false, text: errText(json, "Couldn't save.") } }));
    router.refresh();
  }

  return (
    <div className="card table-panel">
      <div className="table-viewport">
        <table className="data-table">
          <caption className="sr-only">Permissions granted to each role</caption>
          <thead>
            <tr>
              <th scope="col">Permission</th>
              {roles.map((r) => <th scope="col" key={r.id}>{r.name}</th>)}
            </tr>
          </thead>
          <tbody>
            {catalog.map((p) => (
              <tr key={p.key}>
                <th scope="row" style={{ fontWeight: 500 }}>{p.description}<br /><span className="event-id">{p.key}</span></th>
                {roles.map((r) => (
                  <td key={r.id} style={{ textAlign: "center" }}>
                    <input type="checkbox" checked={state[r.id].has(p.key)} disabled={!canEdit} onChange={() => toggle(r.id, p.key)} aria-label={`${r.name}: ${p.description}`} />
                  </td>
                ))}
              </tr>
            ))}
            {canEdit && (
              <tr>
                <th scope="row">Save changes</th>
                {roles.map((r) => (
                  <td key={r.id} style={{ textAlign: "center" }}>
                    <button type="button" className="btn" disabled={busy === r.id} onClick={() => save(r)}>{busy === r.id ? "Saving…" : "Save"}</button>
                    <Status result={results[r.id] ?? null} />
                  </td>
                ))}
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function InvitationList({ items }: { items: InvitationRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!items.length) return <p className="subline">No pending invitations.</p>;

  async function revoke(i: InvitationRow) {
    if (!window.confirm(`Revoke the invitation for ${i.email}?`)) return;
    setBusy(i.id);
    setError(null);
    const { ok, json } = await send("DELETE", `/api/v1/team/invitations/${i.id}`, undefined);
    setBusy(null);
    if (!ok) setError(errText(json, "Couldn't revoke the invitation."));
    router.refresh();
  }

  return (
    <>
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {items.map((i) => (
          <li key={i.id} className="member" style={{ marginBottom: 12 }}>
            <div className="member-main">
              <div className="member-name">{i.email}</div>
              <div className="member-secondary">{i.base_role === "admin" ? "Admin" : "Team member"} · {i.role_name} · expires {new Date(i.expires_at).toISOString().slice(0, 10)}</div>
            </div>
            <button type="button" className="btn" disabled={busy === i.id} aria-label={`Revoke invitation for ${i.email}`} onClick={() => revoke(i)}>Revoke</button>
          </li>
        ))}
      </ul>
      {error && <p role="alert" style={{ marginTop: 8, fontSize: 12, color: "var(--coral)" }}>{error}</p>}
    </>
  );
}

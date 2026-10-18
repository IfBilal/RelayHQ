import Link from "next/link";
import { Avatar, Chip, LinkButton, PageHeader } from "@/components/relay/kit";
import { Icon } from "@/components/relay/icons";
import { getSessionContext, can } from "@/features/identity/server/session";
import { contactListQuerySchema } from "@/features/crm/schemas";
import { listContacts } from "@/features/crm/server/contacts";
import { formatWhen } from "@/features/crm/format";

export const metadata = { title: "Customers · RelayHQ" };

export default async function ContactsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = (await getSessionContext())!;
  const sp = await searchParams;
  const parsed = contactListQuerySchema.safeParse({ q: sp.q, cursor: sp.cursor, limit: 25 });
  const query = parsed.success ? parsed.data : { limit: 25 };
  const allowed = can(ctx, "crm.view");
  const result = allowed ? await listContacts(ctx, query) : null;

  return (
    <>
      <PageHeader
        workspace={ctx.workspace.name}
        title="Customers"
        subtitle="Every contact, with the owner and company behind it."
        actions={
          can(ctx, "crm.create") && (
            <LinkButton href="/contacts/new" style="primary">
              <Icon name="plus" /> New contact
            </LinkButton>
          )
        }
      />

      {!allowed ? (
        <div className="card panel" role="alert">
          <h2>You don&apos;t have access to customer records</h2>
          <p className="subline" style={{ marginTop: 8 }}>Ask a workspace admin to grant you the CRM view permission.</p>
        </div>
      ) : (
        <>
          <form className="controls" role="search" action="/contacts">
            <div className="inline-actions">
              <label className="search-input" style={{ width: 320 }}>
                <Icon name="search" />
                <span className="sr-only">Search customers</span>
                <input name="q" defaultValue={query.q ?? ""} placeholder="Search by name, email or phone" style={{ border: 0, outline: 0, flex: 1, background: "transparent", fontSize: 12 }} />
              </label>
              <button type="submit" className="btn">Search</button>
              {query.q && <LinkButton href="/contacts">Clear</LinkButton>}
            </div>
          </form>

          {result && result.error ? (
            <div className="card panel" role="alert">
              <h2>We couldn&apos;t load your customers</h2>
              <p className="subline" style={{ marginTop: 8 }}>Please refresh the page to try again.</p>
            </div>
          ) : result && !result.items.length ? (
            <div className="card panel">
              <h2>{query.q ? "No customers match your search" : "No customers yet"}</h2>
              <p className="subline" style={{ margin: "8px 0 14px" }}>
                {query.q ? "Try a different name, email or phone number." : "Add your first contact to start tracking opportunities and appointments."}
              </p>
              {query.q ? <LinkButton href="/contacts">Clear search</LinkButton> : can(ctx, "crm.create") && <LinkButton href="/contacts/new" style="primary">New contact</LinkButton>}
            </div>
          ) : (
            result && (
              <div className="card table-panel">
                <div className="table-viewport">
                  <table className="data-table">
                    <thead>
                      <tr><th>Name</th><th>Company</th><th>Phone</th><th>Email</th><th>Added</th></tr>
                    </thead>
                    <tbody>
                      {result.items.map((c) => (
                        <tr key={c.id}>
                          <td>
                            <Link href={`/contacts/${c.id}`} className="row-person">
                              <Avatar name={c.name} />
                              <b>{c.name}</b>
                              {c.opted_out && <Chip tone="slate">Opted out</Chip>}
                            </Link>
                          </td>
                          <td>{c.company?.name ?? "—"}</td>
                          <td>{c.phone_e164 ?? "—"}</td>
                          <td>{c.email ?? "—"}</td>
                          <td>{formatWhen(c.created_at, ctx.workspace.timezone)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {result.nextCursor && (
                  <div style={{ padding: "14px 0", textAlign: "center" }}>
                    <LinkButton href={`/contacts?${new URLSearchParams({ ...(query.q ? { q: query.q } : {}), cursor: result.nextCursor }).toString()}`}>
                      Next page <Icon name="arrow" />
                    </LinkButton>
                  </div>
                )}
              </div>
            )
          )}
        </>
      )}
    </>
  );
}

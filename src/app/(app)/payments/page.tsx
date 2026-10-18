import { Chip, Notice, PageHeader } from "@/components/relay/kit";
import { can, getSessionContext } from "@/features/identity/server/session";
import { formatMoney, formatWhen } from "@/features/crm/format";
import { listPayments, openOpportunities } from "@/features/payments/server/payments";
import { PaymentForm } from "@/features/payments/components/payment-form";

export const metadata = { title: "Payments · RelayHQ" };

const STATUS: Record<string, { label: string; tone: "green" | "amber" | "rose" | "slate" }> = {
  pending: { label: "Awaiting payment", tone: "amber" },
  paid: { label: "Paid", tone: "green" },
  failed: { label: "Failed", tone: "rose" },
  expired: { label: "Expired", tone: "slate" },
  refunded: { label: "Refunded", tone: "slate" },
  partially_refunded: { label: "Partly refunded", tone: "amber" },
};

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<{ result?: string }> }) {
  const { result } = await searchParams;
  const ctx = (await getSessionContext())!;
  const allowed = can(ctx, "payment.create") || can(ctx, "opportunity.value.view");

  if (!allowed) {
    return (
      <>
        <PageHeader workspace={ctx.workspace.name} title="Payments" subtitle="Stripe Checkout payments and refunds." />
        <div className="card panel" role="alert"><h2>You don&apos;t have access to payments</h2><p className="subline" style={{ marginTop: 8 }}>Ask a workspace admin for the payment permission.</p></div>
      </>
    );
  }

  const [list, opportunities] = await Promise.all([listPayments(ctx), can(ctx, "payment.create") ? openOpportunities(ctx) : Promise.resolve([])]);
  const tz = ctx.workspace.timezone;

  return (
    <>
      <PageHeader workspace={ctx.workspace.name} title="Payments" subtitle="Hosted Stripe Checkout (test mode). A payment is marked paid only by Stripe's signed confirmation." />
      {result === "success" && <Notice icon="check" tone="green" title="Back from Stripe">The status below updates when Stripe&apos;s confirmation arrives; this page does not trust the redirect.</Notice>}
      {result === "cancelled" && <Notice icon="alert" tone="amber" title="Checkout cancelled">No payment was taken. The request stays pending until it expires.</Notice>}
      {can(ctx, "payment.create") && <div style={{ marginBottom: 18 }}><PaymentForm opportunities={opportunities} defaultCurrency={ctx.workspace.currency} /></div>}

      {"error" in list ? (
        <div className="card panel" role="alert"><h2>We couldn&apos;t load payments</h2><p className="subline" style={{ marginTop: 8 }}>Please refresh the page to try again.</p></div>
      ) : list.items.length === 0 ? (
        <div className="card panel"><h2>No payments yet</h2><p className="subline" style={{ marginTop: 8 }}>Requests you create appear here with their live status.</p></div>
      ) : (
        <div className="card table-panel">
          <div className="table-viewport">
            <table className="data-table">
              <caption className="sr-only">Payment requests</caption>
              <thead><tr><th scope="col">Created</th><th scope="col">Opportunity</th><th scope="col">Amount</th><th scope="col">Status</th><th scope="col">Detail</th></tr></thead>
              <tbody>
                {list.items.map((p) => (
                  <tr key={p.id}>
                    <td>{formatWhen(p.created_at, tz)}</td>
                    <td><b>{p.opportunity_title}</b><br /><span className="member-secondary">{p.contact_name}</span></td>
                    <td>{formatMoney(p.amount_minor, p.currency)}{p.refunded_minor > 0 && <><br /><span className="member-secondary">refunded {formatMoney(p.refunded_minor, p.currency)}</span></>}</td>
                    <td><Chip tone={STATUS[p.status]?.tone ?? "slate"}>{STATUS[p.status]?.label ?? p.status}</Chip></td>
                    <td>
                      {p.status === "pending" && p.checkout_url ? <a href={p.checkout_url} className="btn" rel="noopener noreferrer">Open checkout</a>
                        : p.status === "paid" && p.paid_at ? <span className="member-secondary">Confirmed {formatWhen(p.paid_at, tz)}</span>
                        : p.failure_reason ? <span className="member-secondary">{p.failure_reason}</span> : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

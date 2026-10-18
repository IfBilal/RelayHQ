"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CURRENCIES } from "../schemas";

export function PaymentForm({ opportunities, defaultCurrency }: { opportunities: { id: string; title: string }[]; defaultCurrency: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/payments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ opportunityId: f.get("opportunityId"), amount: Number(f.get("amount")), currency: f.get("currency") }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json?.error?.message ?? "Couldn't create the payment request.");
        setBusy(false);
        router.refresh();
        return;
      }
      window.location.href = json.checkoutUrl; // hosted Stripe Checkout; the result page never marks anything paid. Stay busy while navigating.
      return;
    } catch {
      setError("We couldn't reach the server.");
    }
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="card panel" aria-label="New payment request">
      <h2>Request a payment</h2>
      <p className="subline" style={{ marginTop: 6 }}>Opens Stripe Checkout (test mode). The record updates only when Stripe confirms it.</p>
      <div className="formrow" style={{ marginTop: 14 }}>
        <div>
          <label className="formlabel" htmlFor="pay-opp">Opportunity</label>
          <select id="pay-opp" name="opportunityId" required className="cal-input" style={{ width: "100%", margin: 0 }} defaultValue="">
            <option value="" disabled>Select…</option>
            {opportunities.map((o) => <option key={o.id} value={o.id}>{o.title}</option>)}
          </select>
        </div>
        <div>
          <label className="formlabel" htmlFor="pay-amount">Amount</label>
          <input id="pay-amount" name="amount" type="number" min="0.5" max="999999.99" step="0.01" required className="cal-input" style={{ width: "100%", margin: 0 }} />
        </div>
      </div>
      <div style={{ marginBottom: 14 }}>
        <label className="formlabel" htmlFor="pay-cur">Currency</label>
        <select id="pay-cur" name="currency" defaultValue={CURRENCIES.includes(defaultCurrency as (typeof CURRENCIES)[number]) ? defaultCurrency : "USD"} className="cal-input" style={{ width: "100%", margin: 0 }}>
          {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <button type="submit" className="btn primary" disabled={busy || opportunities.length === 0}>{busy ? "Creating…" : "Continue to Stripe Checkout"}</button>
      {opportunities.length === 0 && <p className="subline" style={{ marginTop: 8 }}>Create an opportunity first.</p>}
      {error && <p role="alert" style={{ marginTop: 10, fontSize: 12, color: "var(--coral)" }}>{error}</p>}
    </form>
  );
}

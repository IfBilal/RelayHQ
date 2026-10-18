import { chromium } from "@playwright/test";
const out = process.argv[2];
const pw = process.env.E2E_PASSWORD;
const check = (name, ok, extra = "") => console.log(ok ? "PASS" : "FAIL", name, extra);
const b = await chromium.launch({ channel: "chrome", headless: true });

async function login(email) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  await p.goto("http://localhost:3000/login");
  await p.fill('input[name="email"]', email);
  await p.fill('input[name="password"]', pw);
  await p.click('button[type="submit"]');
  await p.waitForURL("**/dashboard", { timeout: 20000 });
  return { ctx, p };
}
const owner = await login("relayhq.devtest@example.com");
const p = owner.p;

// 1. owner makes timers demo-fast through the UI
await p.goto("http://localhost:3000/settings/assignment");
await p.waitForSelector("#win-0");
await p.fill("#alternates", "1");
for (let i = 0; i < 5; i++) { if (await p.locator(`#win-${i}`).count()) await p.fill(`#win-${i}`, "10"); }
await p.click('button:has-text("Save changes")');
await p.getByText("Rules saved").waitFor({ timeout: 10000 });
check("owner saves 10-second windows", true);
await p.goto("http://localhost:3000/settings/assignment");
check("rules persist after reload", (await p.inputValue("#win-0")) === "10");

// make sure both members are available
for (const sel of await p.locator("select[aria-label^='Status for']").all()) await sel.selectOption("available");
await p.waitForTimeout(1500);

// 2. anonymous visitor submits the public form
const anon = await b.newContext({ viewport: { width: 390, height: 844 } });
const ap = await anon.newPage();
await ap.goto("http://localhost:3000/f/dev-test-co");
await ap.waitForSelector("#name");
const suffix = String(Date.now()).slice(-6);
await ap.fill("#name", "Web Visitor " + suffix);
await ap.fill("#email", `visitor${suffix}@example.com`);
await ap.fill("#summary", "Need a solar quote");
const t0 = Date.now();
await ap.click('button[type="submit"]');
await ap.getByText("we've got your request").waitFor({ timeout: 15000 });
check("public form accepted", true);
await ap.screenshot({ path: `${out}/shots/public_form_done.png` });

// 3. lead appears with one owner; nobody acknowledges; cron escalates
const api = (path) => p.evaluate(async (u) => (await fetch(u)).json(), path);
let lead;
for (let i = 0; i < 10 && !lead; i++) { lead = (await api("/api/v1/leads")).items.find((l) => l.contact_name === "Web Visitor " + suffix); if (!lead) await p.waitForTimeout(500); }
check("lead exists with exactly one owner", !!lead && !!lead.owner_user_id, `owner=${lead?.owner_name}`);
const firstOwner = lead.owner_user_id;
let escalated = null;
for (let i = 0; i < 40 && !escalated; i++) {
  const cur = (await api("/api/v1/leads")).items.find((l) => l.id === lead.id);
  if (cur.escalation_count >= 1) escalated = cur; else await p.waitForTimeout(1000);
}
const seconds = ((Date.now() - t0) / 1000).toFixed(1);
check("cron escalated the unacknowledged lead on its own", !!escalated, `after ${seconds}s (window 10s + scheduler)`);
check("ownership moved to a different person", escalated && escalated.owner_user_id !== firstOwner, `new owner=${escalated?.owner_name}`);

// 4. detail page shows history; new owner acknowledges
await p.goto(`http://localhost:3000/leads/${lead.id}`);
const body = await p.textContent("body");
check("history shows the automatic escalation", body.includes("Escalated: acknowledgement window expired") && body.includes("Assigned on capture"));
await p.screenshot({ path: `${out}/shots/lead_detail.png` });
await p.goto("http://localhost:3000/leads/recovery");
await p.screenshot({ path: `${out}/shots/lead_recovery.png` });

const ownerIsDevtest = escalated.owner_name !== "Restricted User";
const acker = ownerIsDevtest ? owner : await login("relayhq.user2@example.com");
await acker.p.goto(`http://localhost:3000/leads/${lead.id}`);
await acker.p.click('button:has-text("Acknowledge")');
await acker.p.getByText("Acknowledged").first().waitFor({ timeout: 10000 });
check("new owner acknowledges in the UI", true);
await acker.p.waitForTimeout(12000);
const after = (await acker.p.evaluate(async (u) => (await fetch(u)).json(), `/api/v1/leads/${lead.id}`));
check("no further escalation after acknowledgement", after.lead.escalation_count === 1 && after.lead.deadline_at === null, `count=${after.lead.escalation_count}`);

// stale owner cannot take it back
const stale = await acker.p.evaluate(async ([u, v]) => (await fetch(u, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ expectedVersion: v }) })).status, [`/api/v1/leads/${lead.id}/acknowledge`, 1]);
console.log("INFO re-ack with stale version status", stale);
await b.close();

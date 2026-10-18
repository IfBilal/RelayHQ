import { chromium } from "@playwright/test";
const out = process.argv[2];
const pw = process.env.E2E_PASSWORD;
const check = (name, ok, extra = "") => console.log(ok ? "PASS" : "FAIL", name, extra);
const b = await chromium.launch({ channel: "chrome", headless: true });
async function login(email, size = { width: 1440, height: 900 }) {
  const ctx = await b.newContext({ viewport: size });
  const p = await ctx.newPage();
  await p.goto("http://localhost:3000/login");
  await p.fill('input[name="email"]', email);
  await p.fill('input[name="password"]', pw);
  await p.click('button[type="submit"]');
  await p.waitForURL("**/dashboard", { timeout: 20000 });
  await p.waitForSelector(".hero", { timeout: 20000 });
  return p;
}
const p = await login("relayhq.devtest@example.com");
const txt = async () => (await p.locator("main").textContent());
let t = await txt();
check("manager dashboard shows company scope", t.includes("New leads today"));
check("escalations 24h metric present", t.includes("Escalations (24h)"));
check("audit log is in the nav for the manager", (await p.locator('nav a:has-text("Audit log")').count()) > 0);

// drill-down: new leads today opens a filtered list
await p.click('a:has-text("New leads today")');
await p.waitForURL(/created=today/);
check("drill-down opens the filtered lead list", (await p.textContent("h1")) === "Leads received today");
await p.goBack();

// hide a widget, reload, still hidden
await p.click('button:has-text("Customize")');
await p.locator('label:has-text("Available staff") input').uncheck();
await p.click('button:has-text("Save")');
await p.waitForTimeout(1500);
await p.reload();
check("hidden widget stays hidden after reload", !(await txt()).includes("Available and under the open-lead limit"));
await p.click('button:has-text("Customize")');
await p.locator('label:has-text("Available staff") input').check();
await p.click('button:has-text("Save")');
await p.waitForTimeout(1500);
check("widget can be shown again", (await p.reload().then(txt)).includes("Available and under the open-lead limit"));
await p.screenshot({ path: `${out}/shots/dash_live.png` });

// audit log
await p.goto("http://localhost:3000/audit");
t = await txt();
check("audit shows automatic escalation entries", t.includes("Lead escalated automatically"));
await p.selectOption("#action", "lead.escalated");
await p.click('button:has-text("Apply filters")');
await p.waitForURL(/action=lead\.escalated/);
const rows = await p.locator("tbody tr").count();
const allEscalations = (await p.locator("tbody").textContent()).split("Lead escalated automatically").length - 1 === rows;
check("event type filter narrows the log", rows > 0 && allEscalations, `${rows} rows`);
await p.screenshot({ path: `${out}/shots/audit.png` });
// no edit affordance and the API refuses writes
const w = await p.evaluate(async () => (await fetch("/api/v1/audit", { method: "DELETE" })).status);
check("audit has no delete endpoint", w === 405 || w === 404, "status " + w);

// restricted user: self scope, no audit, no value
const u = await login("relayhq.user2@example.com");
const ut = await u.locator("main").textContent();
check("user sees personal scope wording", ut.includes("My new leads today"));
check("user does not see audit in the nav", (await u.locator('nav a:has-text("Audit log")').count()) === 0);
await u.goto("http://localhost:3000/audit");
check("direct audit URL shows access denied for a user", (await u.locator("main").textContent()).includes("don't have access to the audit log"));
const auditApi = await u.evaluate(async () => (await fetch("/api/v1/audit")).status);
check("audit API refuses a user without permission", auditApi === 403, "status " + auditApi);
check("no money on the user dashboard", !/\$\d/.test(ut));
await b.close();

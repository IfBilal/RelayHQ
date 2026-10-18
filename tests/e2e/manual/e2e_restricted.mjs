import { chromium } from "@playwright/test";
const [email, password] = [process.argv[2], process.argv[3]];
const b = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();
const check = (name, ok, extra = "") => console.log(ok ? "PASS" : "FAIL", name, extra);
await p.goto("http://localhost:3000/login");
await p.fill('input[name="email"]', email);
await p.fill('input[name="password"]', password);
await p.click('button[type="submit"]');
await p.waitForURL("**/dashboard", { timeout: 20000 });

await p.goto("http://localhost:3000/pipelines/default");
await p.waitForSelector(".board");
const html = await p.content();
check("board renders cards for the restricted user", (await p.locator(".deal-card").count()) > 0);
check("no dollar amounts in the board HTML", !/\$\d/.test(await p.locator("main").innerHTML()), "");
check("open pipeline shows Restricted", html.includes("Restricted"));

const api = async (path) => p.evaluate(async (u) => { const r = await fetch(u); return { status: r.status, text: await r.text() }; }, path);
const pipelines = await api("/api/v1/pipelines");
check("pipelines API has no value_minor", pipelines.status === 200 && !pipelines.text.includes("value_minor"));
const contacts = await api("/api/v1/contacts?limit=5");
check("contacts API ok and no value keys", contacts.status === 200 && !contacts.text.includes("value"));
const forbidden = await p.evaluate(async () => { const r = await fetch("/api/v1/opportunities", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ contactId: "00000000-0000-4000-8000-000000000000", pipelineId: "00000000-0000-4000-8000-000000000000", stageId: "00000000-0000-4000-8000-000000000000", title: "x", value: 100 }) }); return r.status; });
check("setting a value without permission is rejected (not 201)", forbidden !== 201, "status " + forbidden);

// the value-permitting form field must be absent
await p.goto("http://localhost:3000/opportunities/new");
check("new opportunity form has no value field", (await p.locator('input[name="value"]').count()) === 0);
// contact detail
const href = await p.goto("http://localhost:3000/contacts").then(() => p.locator("tbody a").first().getAttribute("href"));
await p.goto("http://localhost:3000" + href);
check("contact page shows no money", !/\$\d/.test(await p.locator("main").innerHTML()));
// admin-only API
const audit = await p.evaluate(async () => (await fetch("/api/v1/pipelines?pipelineId=00000000-0000-4000-8000-000000000000")).status);
console.log("INFO unknown pipeline id status", audit);
await b.close();

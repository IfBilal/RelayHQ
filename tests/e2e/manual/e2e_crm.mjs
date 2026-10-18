import { chromium } from "@playwright/test";
const out = process.argv[2];
const [email, password] = [process.argv[3], process.argv[4]];
const log = (...a) => console.log(...a);
const b = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();
const check = (name, ok, extra = "") => log(ok ? "PASS" : "FAIL", name, extra);

await p.goto("http://localhost:3000/login");
await p.fill('input[name="email"]', email);
await p.fill('input[name="password"]', password);
await p.click('button[type="submit"]');
await p.waitForURL("**/dashboard", { timeout: 20000 });

// contact
const suffix = String(Date.now()).slice(-7);
const phone = "+1415" + suffix;
await p.goto("http://localhost:3000/contacts/new");
await p.fill('input[name="name"]', "Maya Richardson " + suffix);
await p.fill('input[name="email"]', `maya${suffix}@example.com`);
await p.fill('input[name="phone"]', phone);
await p.fill('input[name="companyName"]', "Atlas Homes");
await p.click('button[type="submit"]');
await p.waitForURL(/\/contacts\/[0-9a-f-]{36}$/, { timeout: 20000 });
check("create contact -> detail page", (await p.textContent("h1")) === "Customer profile");
const contactUrl = p.url();
check("detail shows company chip", (await p.textContent("body")).includes("Atlas Homes"));

// duplicate phone
await p.goto("http://localhost:3000/contacts/new");
await p.fill('input[name="name"]', "Duplicate Person");
await p.fill('input[name="phone"]', phone);
await p.click('button[type="submit"]');
await p.waitForSelector('form [role="alert"]', { timeout: 10000 }).catch(() => {});
check("duplicate phone rejected with message", (await p.locator("form").textContent()).includes("already exists"), await p.locator("form").textContent());

// list + search
await p.goto("http://localhost:3000/contacts?q=" + encodeURIComponent("Maya Richardson " + suffix));
check("search finds contact", (await p.textContent("table")).includes("Maya Richardson " + suffix));

// opportunity
const contactId = contactUrl.split("/").pop();
await p.goto(`http://localhost:3000/opportunities/new?contactId=${contactId}`);
await p.fill('input[name="title"]', "Solar install " + suffix);
await p.fill('input[name="value"]', "8500");
await p.click('button[type="submit"]');
await p.waitForURL(/\/pipelines\//, { timeout: 20000 });
const body1 = await p.textContent("body");
check("card on board with value", body1.includes("Solar install " + suffix) && body1.includes("$8,500"));

// move stage
const card = p.locator(".deal-card", { hasText: "Solar install " + suffix });
await card.locator("select").selectOption({ label: "Qualified" });
await p.locator('section[aria-label="Qualified"] .deal-card', { hasText: "Solar install " + suffix }).waitFor({ timeout: 10000 }).catch(() => {});
const inQualified = await p.locator('section[aria-label="Qualified"] .deal-card', { hasText: "Solar install " + suffix }).count();
if (!inQualified) log("   card error text:", await card.textContent());
check("moved to Qualified column", inQualified === 1);

// note
await p.goto(contactUrl);
await p.fill("#note-body", "Customer wants a site visit next week");
await p.click('button:has-text("Save note")');
await p.getByText("Customer wants a site visit next week").first().waitFor({ timeout: 10000 }).catch(async () => log("   note form text:", await p.locator("form").last().textContent()));
const body2 = await p.textContent("body");
check("note on timeline", body2.includes("Customer wants a site visit next week"));
check("stage change on timeline", body2.includes("Stage changed"));
await p.screenshot({ path: `${out}/shots/crm_contact.png` });
await p.goto("http://localhost:3000/pipelines/default");
await p.screenshot({ path: `${out}/shots/crm_pipeline.png` });
await b.close();

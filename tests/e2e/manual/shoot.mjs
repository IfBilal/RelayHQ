import { chromium } from "@playwright/test";
const out = process.argv[2];
const routes = [["dashboard","/dashboard"],["recovery","/leads/recovery"],["pipeline","/pipelines/default"],["contact","/contacts/sample"],["rules","/settings/assignment"],["integrations","/settings/integrations"],["appointments","/appointments"]];
const browser = await chromium.launch({ channel: "chrome", headless: true });
for (const [label, viewport] of [["desktop",{width:1440,height:900}],["mobile",{width:390,height:844}]]) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  await page.goto("http://localhost:3000/login");
  await page.fill('input[name="email"]', "" + (process.env.E2E_OWNER_EMAIL ?? "") + "");
  await page.fill('input[name="password"]', process.env.E2E_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard", { timeout: 20000 });
  for (const [name, path] of routes) {
    await page.goto("http://localhost:3000" + path);
    await page.waitForSelector(".content", { timeout: 20000 });
    await page.waitForTimeout(400);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    console.log(label, name, "horizontal overflow px:", overflow);
    await page.screenshot({ path: `${out}/shots/${label}_${name}.png` });
  }
  await ctx.close();
}
await browser.close();

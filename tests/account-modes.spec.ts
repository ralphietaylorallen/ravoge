import { test, expect, type Page } from "@playwright/test";
test.use({ trace: "off" });

test("one Coach identity creates Client access, switches views and keeps single-role boundaries", async ({ page, browser }, info) => {
  test.skip(process.env.RAVOGE_ACCESS_MODES_QA !== "yes" || process.env.SUPABASE_DB_TARGET !== "local" || info.project.name !== "desktop", "Isolated CI fixtures only");
  test.setTimeout(120000);
  const users = JSON.parse(process.env.BETA_QA_USERS!) as {id:string;email:string;password:string;role:string}[];
  const coach = users.find(u => u.role === "coach")!;
  const client = users.find(u => u.role === "client")!;
  const owner = users.find(u => u.role === "owner")!;
  async function login(p: Page, user: typeof coach) {
    await p.goto("/login");
    await p.getByLabel("Email", {exact:true}).fill(user.email);
    await p.getByLabel("Password", {exact:true}).fill(user.password);
    await p.getByRole("button", {name:"Login",exact:true}).click();
  }
  await login(page, coach); await expect(page).toHaveURL(/\/coach$/);
  await page.getByRole("link", {name:"Switch view",exact:true}).click();
  await page.getByRole("button", {name:"Create my Client profile"}).click();
  await expect(page).toHaveURL(/\/client\/welcome$/);
  await expect(page.getByText(/Your gym will assign a Coach/)).toBeVisible();
  await page.getByRole("link", {name:"Open Client App",exact:true}).click();
  await expect(page).toHaveURL(/\/client$/);
  await page.getByRole("link", {name:"Switch view",exact:true}).click();
  await expect(page.getByRole("button",{name:"Create my Client profile"})).toHaveCount(0);
  await page.getByRole("button",{name:"Open Coach view"}).click();
  await expect(page).toHaveURL(/\/coach$/);
  await page.getByRole("button",{name:"Log out",exact:true}).click();
  await login(page, coach); await expect(page).toHaveURL(/\/access$/);
  for (const width of [390,820,1440]) {
    await page.setViewportSize({width,height:1000});
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(page.getByRole("button",{name:"Open Client view"})).toBeVisible();
  }
  await page.getByRole("button",{name:"Open Client view"}).focus();
  await page.keyboard.press("Enter"); await expect(page).toHaveURL(/\/client$/);

  const context = await browser.newContext(); const single = await context.newPage();
  await login(single,client); await expect(single).toHaveURL(/\/client$/);
  await single.goto("/coach"); await expect(single).toHaveURL(/\/client$/);
  await single.getByRole("link",{name:"Switch view",exact:true}).click();
  await expect(single.getByRole("button",{name:/Coach approval required/})).toBeDisabled();
  await expect(single.getByRole("button",{name:"Create my Client profile"})).toHaveCount(0);
  await single.getByRole("button",{name:"Log out",exact:true}).click();
  await login(single,owner); await expect(single).toHaveURL(/\/owner$/);
  await single.getByRole("link",{name:"Team",exact:true}).click();
  await expect(single.getByRole("heading",{name:"Team",exact:true})).toBeVisible();
  await context.close();
});

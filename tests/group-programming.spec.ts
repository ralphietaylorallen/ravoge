import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

test.use({ trace: "off" });
test("group notepad uses real permission/save/publication paths and never claims Mindbody sync", async ({ page, browser }, info) => {
  test.skip(process.env.RAVOGE_GROUP_QA !== "yes" || info.project.name !== "desktop", "Explicit disposable group QA fixtures required.");
  test.setTimeout(180000);
  const users = JSON.parse(process.env.BETA_QA_USERS ?? "[]") as { role: string; email: string; password: string; id: string; name: string }[];
  const owner = users.find(u => u.role === "owner")!, coach = users.filter(u => u.role === "coach")[0], denied = users.filter(u => u.role === "coach")[1], client = users.find(u => u.role === "client")!;
  async function login(target: Page, user: typeof owner) {
    await target.goto("/login"); await target.getByLabel("Email",{exact:true}).fill(user.email); await target.getByLabel("Password",{exact:true}).fill(user.password);
    await target.getByRole("button",{name:"Login",exact:true}).click(); await expect(target).toHaveURL(new RegExp(`/${user.role}$`), {timeout:25000});
  }
  await login(page, owner);
  await page.getByRole("link",{name:"Group Class Programming",exact:true}).click();
  await expect(page.getByRole("heading",{name:"Group Class Programming",exact:true})).toBeVisible();
  const permission = page.locator("form").filter({has:page.getByRole("checkbox",{name:`${coach.name}: Can manage Group Class Programming`,exact:true})});
  await permission.getByRole("checkbox").check(); await permission.getByRole("button",{name:"Save permission"}).click(); await expect(permission.getByRole("status")).toHaveText("Permission saved.");
  const coachContext = await browser.newContext(); const coachPage = await coachContext.newPage();
  await login(coachPage,coach); await coachPage.getByRole("link",{name:"Group Class Programming",exact:true}).click();
  const days = coachPage.getByLabel("Monday through Saturday").getByRole("button");
  const editor = coachPage.getByRole("textbox",{name:/workout$/});
  const raw = "  EMOM 12\n1. Row 250 m\n2. 8 / side @ 55 lb\n\n65% — 4 rounds  ";
  await editor.fill(raw); await days.nth(1).click();
  await expect(coachPage.getByRole("dialog")).toContainText("Save this draft before leaving?");
  await coachPage.getByRole("button",{name:"Stay Here",exact:true}).click(); await expect(editor).toHaveValue(raw);
  await days.nth(1).click(); await coachPage.getByRole("button",{name:"Save and Continue",exact:true}).click();
  await expect(coachPage.getByRole("dialog")).toHaveCount(0); await expect(editor).toHaveValue("");
  await days.nth(0).click(); await expect(editor).toHaveValue(raw);
  await editor.fill("discard me"); await days.nth(1).click(); await coachPage.getByRole("button",{name:"Discard Changes",exact:true}).click();
  for (let i=1;i<6;i++) { await days.nth(i).click(); await editor.fill(i===5 ? "   \n" : `${raw}\nDay ${i+1}`); await coachPage.getByRole("button",{name:"Save Draft",exact:true}).click(); await expect(coachPage.getByRole("status").filter({hasText:"Draft Saved."})).toBeVisible(); }
  await days.nth(0).click(); await expect(editor).toHaveValue(raw);
  await coachPage.getByRole("button",{name:"Publish This Date",exact:true}).click();
  await expect(coachPage.getByRole("dialog")).toContainText("1 workout"); await coachPage.getByRole("button",{name:"Publish",exact:true}).click();
  await expect(coachPage.getByRole("status").filter({hasText:"1 workout published to Ravoge"})).toBeVisible();
  await expect(days.nth(0)).toContainText("Published to Ravoge"); await expect(days.nth(1)).toContainText("Draft Saved");
  const checks = coachPage.getByLabel("Monday through Saturday").getByRole("checkbox");
  await checks.nth(1).check(); await checks.nth(3).check(); await checks.nth(5).check();
  await coachPage.getByRole("button",{name:"Publish Selected Dates",exact:true}).click(); await expect(coachPage.getByRole("dialog")).toContainText("2 workouts"); await coachPage.getByRole("button",{name:"Publish",exact:true}).click();
  await expect(coachPage.getByRole("status").filter({hasText:"2 workouts published to Ravoge"})).toBeVisible(); await expect(days.nth(2)).toContainText("Draft Saved");
  await coachPage.getByRole("button",{name:"Publish Week",exact:true}).click(); await expect(coachPage.getByRole("dialog")).toContainText("5 workouts"); await coachPage.getByRole("button",{name:"Publish",exact:true}).click();
  await expect(coachPage.getByRole("status").filter({hasText:"5 workouts published to Ravoge"})).toBeVisible(); await expect(days.nth(5)).toContainText("Empty");
  await editor.fill(`${raw}\nUpdated`); await coachPage.getByRole("button",{name:"Save Draft",exact:true}).click(); await expect(days.nth(0)).toContainText("Updated Draft");
  await coachPage.getByRole("button",{name:"Version history",exact:true}).click(); await expect(coachPage.locator("summary").filter({hasText:"Version 1"})).toContainText("Published");
  await coachPage.getByRole("button",{name:"Republish This Date",exact:true}).click(); await coachPage.getByRole("button",{name:"Publish",exact:true}).click(); await expect(days.nth(0)).toContainText("Published to Ravoge");
  await coachPage.getByRole("button",{name:"Retry Mindbody sync check",exact:true}).click(); await expect(coachPage.getByRole("status").filter({hasText:"Mindbody sync remains unavailable"})).toBeVisible();
  for (const width of [390,768,820,1024,1440]) { await coachPage.setViewportSize({width,height:1000}); expect(await coachPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true); if ([390,820,1440].includes(width)) { await coachPage.evaluate(()=>window.scrollTo(0,0)); await coachPage.screenshot({path:`.temp/group-programming-${width}.png`,fullPage:true,style:'[data-netlify-deploy-id] { visibility:hidden!important; }'}); } }
  await coachPage.reload(); await expect(editor).toHaveValue(`${raw}\nUpdated`);
  await coachPage.getByRole("button",{name:"Log out",exact:true}).click(); await login(coachPage,coach);
  await coachPage.goto("/coach/group-programming"); await expect(editor).toHaveValue(`${raw}\nUpdated`);
  await coachPage.goto("/owner/mindbody"); await expect(coachPage).toHaveURL(/\/coach$/);
  const deniedContext = await browser.newContext(); const deniedPage = await deniedContext.newPage();
  await login(deniedPage,denied); await expect(deniedPage.getByRole("link",{name:"Group Class Programming",exact:true})).toHaveCount(0);
  await deniedPage.goto("/coach/group-programming"); await expect(deniedPage.getByText("Your Owner must enable Group Class Programming access. No programming was loaded.")).toBeVisible(); await expect(deniedPage.getByRole("textbox")).toHaveCount(0);
  const clientContext = await browser.newContext(); const clientPage = await clientContext.newPage(); await login(clientPage,client);
  await clientPage.goto("/coach/group-programming"); await expect(clientPage).toHaveURL(/\/client$/); await clientPage.goto("/owner/group-programming"); await expect(clientPage).toHaveURL(/\/client$/);
  const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,{auth:{persistSession:false}}); await db.auth.signInWithPassword({email:coach.email,password:coach.password});
  const rows=await db.from("group_daily_programs").select("revision,published_revision,mindbody_sync_status,last_sync_at"); expect(rows.error).toBeNull(); expect(rows.data).toHaveLength(6); expect(rows.data!.filter(row=>row.published_revision!==null)).toHaveLength(5); expect(rows.data!.every(row=>row.mindbody_sync_status!=="synced"&&row.last_sync_at===null)).toBe(true); await db.auth.signOut();
  await permission.getByRole("checkbox").uncheck(); await permission.getByRole("button",{name:"Save permission"}).click(); await expect(permission.getByRole("button",{name:"Save permission",exact:true})).toBeEnabled(); await expect(permission.getByRole("status")).toHaveText("Permission saved.");
  await coachPage.goto("/coach/group-programming"); await expect(coachPage.getByRole("textbox")).toHaveCount(0);
  await clientContext.close(); await deniedContext.close(); await coachContext.close();
});

test("Owner duplicates a week, edits and publishes copies, and explicitly resolves destination conflicts", async ({ page }, info) => {
  test.skip(process.env.RAVOGE_GROUP_QA !== "yes" || info.project.name !== "desktop", "Explicit disposable group QA fixtures required.");
  test.setTimeout(180000);
  const users = JSON.parse(process.env.BETA_QA_USERS ?? "[]") as { role: string; email: string; password: string }[];
  const owner = users.find(u => u.role === "owner")!;
  await page.goto("/login"); await page.getByLabel("Email",{exact:true}).fill(owner.email); await page.getByLabel("Password",{exact:true}).fill(owner.password);
  await page.getByRole("button",{name:"Login",exact:true}).click(); await expect(page).toHaveURL(/\/owner$/, {timeout:25000});
  await page.getByRole("link",{name:"Group Class Programming",exact:true}).click();
  const days = page.getByLabel("Monday through Saturday").getByRole("button");
  const editor = page.getByRole("textbox",{name:/workout$/});
  async function move(name: "Next week" | "Previous week") {
    const before = await days.first().locator("strong").textContent();
    await page.getByRole("button",{name,exact:true}).click();
    await expect(days.first().locator("strong")).not.toHaveText(before!);
  }
  await move("Next week"); await move("Next week");
  const source = Array.from({length:6},(_,index)=>`  Class ${index+1} — strength\nTITLE: Original day ${index+1}\n\nEMOM 12\nRow 250 m\n8 / side @ 55 lb\t65%\nNotes: preserve spacing  \n`);
  for (let i=0;i<6;i++) {
    await days.nth(i).click(); await editor.fill(source[i]); await page.getByRole("button",{name:"Save Draft",exact:true}).click();
    await expect(page.getByRole("status").filter({hasText:"Draft Saved."})).toBeVisible();
  }
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,{auth:{persistSession:false}});
  expect((await db.auth.signInWithPassword({email:owner.email,password:owner.password})).error).toBeNull();
  const sourceRows = (await db.from("group_daily_programs").select("*").order("programming_date")).data!.filter(row=>source.includes(row.raw_workout_text));
  expect(sourceRows).toHaveLength(6);
  await page.getByRole("button",{name:"Duplicate Week",exact:true}).dblclick();
  await expect(page.getByRole("status").filter({hasText:"Week duplicated. Review your changes, then publish when ready."})).toBeVisible();
  for (let i=0;i<6;i++) { await days.nth(i).click(); await expect(editor).toHaveValue(source[i]); await expect(days.nth(i)).toContainText("Draft Saved"); }
  const copiedRows = (await db.from("group_daily_programs").select("*").order("programming_date")).data!.filter(row=>source.includes(row.raw_workout_text)&&!sourceRows.some(old=>old.id===row.id));
  expect(copiedRows).toHaveLength(6); expect(copiedRows.every(row=>row.published_at===null&&row.published_revision===null&&row.last_sync_at===null)).toBe(true);
  for (const original of sourceRows) expect((await db.from("group_daily_programs").select("*").eq("id",original.id).single()).data).toEqual(original);
  await days.first().click(); await editor.fill(`${source[0]}\nSmall copied-day change`);
  await page.getByRole("button",{name:"Save Draft",exact:true}).click(); await expect(days.first()).toContainText("Draft Saved");
  await page.getByRole("button",{name:"Publish Week",exact:true}).click(); await page.getByRole("dialog").getByRole("button",{name:"Publish",exact:true}).click();
  await expect(page.getByRole("status").filter({hasText:"6 workouts published to Ravoge"})).toBeVisible();
  await move("Previous week"); await page.getByRole("button",{name:"Duplicate Week",exact:true}).click();
  const modal = page.getByRole("dialog"); await expect(modal).toContainText("The next week already has programming");
  for (const width of [390,768,820,1024,1440]) {
    await page.setViewportSize({width,height:1000});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await expect(modal.getByRole("button",{name:"Cancel",exact:true})).toBeInViewport();
    if ([390,820,1440].includes(width)) await page.screenshot({path:`.temp/duplicate-week-modal-${width}.png`,fullPage:true});
  }
  await page.keyboard.press("Tab"); expect(await page.evaluate(()=>Boolean(document.activeElement?.closest('[role="dialog"]')))).toBe(true);
  await page.keyboard.press("Escape"); await expect(modal).toHaveCount(0);
  const beforeCancel = (await db.from("group_daily_programs").select("*").order("programming_date")).data;
  await page.getByRole("button",{name:"Duplicate Week",exact:true}).click(); await modal.getByRole("button",{name:"Cancel",exact:true}).click();
  expect((await db.from("group_daily_programs").select("*").order("programming_date")).data).toEqual(beforeCancel);
  await page.getByRole("button",{name:"Duplicate Week",exact:true}).click(); await modal.getByRole("button",{name:"Copy only into empty days",exact:true}).click();
  await expect(page.getByRole("status").filter({hasText:"existing day(s) preserved"})).toBeVisible();
  await expect(editor).toHaveValue(`${source[0]}\nSmall copied-day change`); await expect(days.first()).toContainText("Published to Ravoge");
  await move("Previous week"); await page.getByRole("button",{name:"Duplicate Week",exact:true}).click();
  await modal.getByRole("button",{name:"Replace existing programmed days",exact:true}).click();
  await expect(page.getByRole("status").filter({hasText:"Week duplicated."})).toBeVisible();
  await expect(editor).toHaveValue(source[0]); await expect(days.first()).toContainText("Draft Saved");
  await page.getByRole("button",{name:"Version history",exact:true}).click();
  await expect(page.locator("summary").filter({hasText:"Version 2"})).toContainText("Published");
  for (const original of sourceRows) expect((await db.from("group_daily_programs").select("*").eq("id",original.id).single()).data).toEqual(original);
  await db.auth.signOut();
});

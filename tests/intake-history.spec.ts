import { test, expect, type Page } from "@playwright/test";

test.use({trace:"off",video:"off",actionTimeout:15000});
const clientId=process.env.INTAKE_PREVIEW_CLIENT_ID;
async function login(page:Page) {
  await page.goto("/login");
  await page.getByLabel("Email",{exact:true}).fill(process.env.INTAKE_PREVIEW_COACH_EMAIL!);
  await page.getByLabel("Password",{exact:true}).fill(process.env.INTAKE_PREVIEW_COACH_PASSWORD!);
  await page.getByRole("button",{name:"Login",exact:true}).click();
  await expect(page).toHaveURL(/\/coach$/,{timeout:45000});
}
test("isolated intake: one goal, independent saved spots, cancel, failed save, reload and account session",async({page},info)=>{
  test.skip(!clientId||info.project.name!=="desktop","Requires explicit synthetic accounts on an isolated Ravoge preview database.");
  test.setTimeout(180000);
  // Fail closed if somebody accidentally points this mutable test at production.
  expect(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname).not.toBe("kqdnljafaiohlijbgfld.supabase.co");
  expect(process.env.INTAKE_PREVIEW_COACH_EMAIL).toMatch(/@example\.test$/);
  expect(new URL(process.env.PLAYWRIGHT_BASE_URL??"http://localhost:3000").hostname).not.toBe("ravoge.com");
  await login(page); await page.goto(`/coach/clients/${clientId}?tab=intake`);
  const nav=page.getByRole("navigation",{name:"Intake steps"});
  const one=page.getByRole("radio",{name:"Weight loss",exact:true});
  const two=page.getByRole("radio",{name:"Muscle growth",exact:true});
  await one.check(); await page.getByLabel("Target weight (lb, optional)",{exact:true}).fill("180");
  await two.check(); await expect(one).not.toBeChecked(); await expect(two).toBeChecked();
  await expect(page.getByLabel("Target weight (lb, optional)",{exact:true})).toHaveCount(0);
  for(const label of ["Age","Current weight (lb, optional)","Average workout days per week over the last 6 months","Days per week training with this gym","Strength-training experience","Time available per session","What would success look like?","Other exercise, sports, or physically demanding work","How often?","Typical sleep duration (hours, optional)","Perceived recovery"]) await expect(page.getByLabel(label,{exact:true})).toBeVisible();
  await expect(page.getByLabel(/^Preferred exercises/)).toBeVisible(); await expect(page.getByLabel(/^Avoided exercises/)).toBeVisible();
  await expect(page.getByRole("group",{name:"Main barriers to consistency"})).toBeVisible();
  await nav.getByRole("button",{name:/Body map/}).click();
  const body=page.getByRole("region",{name:"Body map and injury history"});
  const add=body.getByRole("button",{name:/Add another spot/});
  for(const [width,height] of [[390,844],[820,1180],[1440,1000]]) {
    await page.setViewportSize({width,height}); await add.click();
    const modal=page.getByRole("dialog"); await expect(modal).toBeVisible();
    await expect(modal.getByRole("button",{name:"Save this spot",exact:true})).toBeInViewport();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.keyboard.press("Escape"); await expect(modal).not.toBeVisible(); await expect(add).toBeFocused();
  }
  await add.click(); let modal=page.getByRole("dialog");
  await modal.getByLabel("Surgically repaired",{exact:true}).check();
  await modal.getByLabel("Long-term issue",{exact:true}).check();
  await modal.getByLabel("Current pain (0–10; leave blank if unknown)",{exact:true}).fill("0");
  await modal.getByLabel("What was repaired?",{exact:true}).fill("Synthetic previous ligament repair");
  await modal.getByLabel("Approximately when was surgery?",{exact:true}).fill("Several years ago");
  await modal.getByRole("button",{name:"Save this spot",exact:true}).click(); await expect(modal).not.toBeVisible();
  const knee=body.getByRole("button",{name:/left knee · front · Pain 0\/10 · Surgery history — Edit/});
  await expect(knee).toBeVisible(); await expect(body.getByRole("checkbox",{name:"No pain, injuries, or restrictions to report",exact:true})).toBeDisabled();
  await add.click(); modal=page.getByRole("dialog");
  await modal.getByLabel("Region",{exact:true}).selectOption("lower_back"); await modal.getByLabel("Side",{exact:true}).selectOption("midline"); await modal.getByLabel("View",{exact:true}).selectOption("back");
  await modal.getByLabel("Pain/discomfort without a known injury",{exact:true}).check();
  await modal.getByRole("button",{name:"Save this spot",exact:true}).click(); await expect(modal).not.toBeVisible();
  await expect(body.getByRole("button",{name:/lower back · back · Pain unknown — Edit/})).toBeVisible();
  await knee.click(); modal=page.getByRole("dialog"); await modal.getByLabel("Current pain (0–10; leave blank if unknown)",{exact:true}).fill("8");
  await modal.getByRole("button",{name:"Cancel",exact:true}).click(); await expect(knee).toBeVisible();
  await knee.click(); await expect(modal.getByLabel("Current pain (0–10; leave blank if unknown)",{exact:true})).toHaveValue("0");
  await modal.getByLabel("Current pain (0–10; leave blank if unknown)",{exact:true}).fill("4");
  await page.route("**/coach/clients/**",route=>route.request().method()==="POST"&&route.request().headers()["next-action"]?route.abort("internetdisconnected"):route.continue());
  await modal.getByRole("button",{name:"Save this spot",exact:true}).click(); await expect(modal.getByRole("alert")).toContainText("not saved");
  await expect(modal.getByLabel("Current pain (0–10; leave blank if unknown)",{exact:true})).toHaveValue("4");
  await page.unroute("**/coach/clients/**"); await modal.getByRole("button",{name:"Save this spot",exact:true}).click(); await expect(modal).not.toBeVisible();
  await page.reload(); await nav.getByRole("button",{name:/Body map/}).click();
  await expect(body.getByRole("button",{name:/left knee · front · Pain 4\/10 · Surgery history — Edit/})).toBeVisible();
  await expect(body.getByRole("button",{name:/lower back · back · Pain unknown — Edit/})).toBeVisible();
  await page.getByRole("button",{name:"Log out",exact:true}).click(); await login(page); await page.goto(`/coach/clients/${clientId}?tab=intake`); await nav.getByRole("button",{name:/Body map/}).click();
  await expect(body.getByRole("button",{name:/left knee · front · Pain 4\/10 · Surgery history — Edit/})).toBeVisible();
});

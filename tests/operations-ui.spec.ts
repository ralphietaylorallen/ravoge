import {expect,test,type Page} from "@playwright/test";
import sharp from "sharp";

test.use({trace:"off",actionTimeout:20_000});
const clientId=process.env.PR22_CLIENT_ID;
async function login(page:Page,role:"OWNER"|"COACH"|"CLIENT") {
  await page.goto("/login");
  await page.getByLabel("Email").fill(process.env[`PR22_${role}_EMAIL`]!);
  await page.getByLabel("Password",{exact:true}).fill(process.env[`PR22_${role}_PASSWORD`]!);
  await page.getByRole("button",{name:"Login",exact:true}).click();
  await expect(page).toHaveURL(new RegExp(`/${role.toLowerCase()}$`));
}
async function noOverflow(page:Page){expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);}

test("Owner to Coach to Client operations, outcomes, intake, photos and responsive controls",async({page,browser},testInfo)=>{
  test.skip(!clientId,"Run through the explicit disposable Ravoge QA runner.");
  test.setTimeout(300_000);
  const runtimeErrors:string[]=[];
  page.on("pageerror",error=>runtimeErrors.push(error.message));
  await login(page,"OWNER");
  await page.goto("/owner/clients");
  const card=page.getByRole("link",{name:"Open Client: QA Client",exact:true});
  await expect(card).toContainText("Not assigned");
  for(const [name,width,height] of [["desktop",1440,1000],["ipad",820,1180],["phone",390,844]] as const){await page.setViewportSize({width,height});await noOverflow(page);await page.screenshot({path:testInfo.outputPath(`directory-${name}.png`),fullPage:true});}
  await page.setViewportSize({width:1440,height:1000});
  await card.click({position:{x:12,y:12}});
  await expect(page).toHaveURL(new RegExp(`/owner/clients/${clientId}$`));
  await page.screenshot({path:testInfo.outputPath("owner-client-desktop.png"),fullPage:true});
  await page.getByRole("button",{name:"Assign Coach",exact:true}).click();
  const dialog=page.getByRole("dialog");
  await expect(dialog).toBeVisible();await page.screenshot({path:testInfo.outputPath("assign-coach-desktop.png")});await page.keyboard.press("Escape");
  await expect(page.getByRole("button",{name:"Assign Coach",exact:true})).toBeFocused();
  await page.getByRole("button",{name:"Assign Coach",exact:true}).click();
  await dialog.getByRole("radio").check();
  await dialog.getByRole("button",{name:"Confirm assignment"}).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("button",{name:"Change Coach"})).toBeVisible();
  await page.getByRole("link",{name:/Schedule first session/}).click();
  await expect(page.locator('[aria-label="Choose a session date"] button')).toHaveCount(31);
  const tomorrow=new Date();tomorrow.setUTCDate(tomorrow.getUTCDate()+1);
  const date=tomorrow.toISOString().slice(0,10);
  await page.locator('[aria-label="Choose a session date"] button').nth(1).click();
  await expect(page).toHaveURL(new RegExp(`date=${date}`));
  await page.screenshot({path:testInfo.outputPath("owner-booking-desktop.png"),fullPage:true});
  await page.getByRole("button",{name:"Book for QA Client"}).click();
  await expect(page.getByRole("status")).toContainText("Session booked");
  await page.goto("/owner/schedule");await expect(page.getByText(/with QA Client/)).toBeVisible();
  const ownerContext=page.context();
  const coachContext=await browser.newContext();const coach=await coachContext.newPage();
  coach.on("pageerror",error=>runtimeErrors.push(error.message));
  await login(coach,"COACH");
  await expect(coach.getByRole("link",{name:/QA Client.*Assigned to you/})).toBeVisible();
  const pool=coach.locator("li").filter({hasText:"QA Pool Client"});await pool.getByRole("button",{name:"Assign to me"}).click();
  await expect(coach.getByRole("link",{name:/QA Pool Client.*Assigned to you/})).toBeVisible();
  await coach.goto("/coach/schedule");await expect(coach.getByText(/QA Client · 60 min/)).toBeVisible();
  await coach.goto(`/coach/clients/${clientId}`);
  await coach.getByText("Create a workout",{exact:true}).click();
  await coach.getByLabel("Workout name").fill("QA Bench Session");await coach.getByLabel("Date",{exact:true}).fill(date);
  await coach.getByLabel("Name",{exact:true}).fill("Barbell Bench Press");await coach.getByLabel("Sets",{exact:true}).fill("4");await coach.getByLabel("Reps",{exact:true}).fill("8");await coach.getByLabel("Weight",{exact:true}).fill("60");
  await coach.getByRole("button",{name:"Save workout",exact:true}).click();await expect(coach.getByRole("status")).toContainText("Workout assigned");
  await coach.getByRole("link",{name:/QA Bench Session/}).click();
  await expect(coach).toHaveURL(/\/workouts\/[0-9a-f-]+$/);
  const workoutUrl=coach.url();
  for(const [index,result,reps] of [[1,"complete","8"],[2,"failed","4"],[3,"complete","10"],[4,"not_completed",""]] as const){const row=coach.getByRole("form",{name:`Set ${index}`,exact:true});await row.getByLabel(`Set ${index} result`).selectOption(result);if(result==="failed"){await expect(row.getByText("Why?",{exact:true})).toBeVisible();await row.getByLabel(`Set ${index} failure reason`).selectOption("failed_reps");}await row.getByLabel(`Set ${index} actual reps`).fill(reps);if(result==="not_completed")await row.getByLabel(`Set ${index} actual weight`).fill("");await row.getByRole("button",{name:"Save set"}).click();await expect(row.getByRole("status")).toContainText("saved",{ignoreCase:true});await expect(row.getByLabel(`Set ${index} result`)).toHaveValue(result);if(result==="failed")await expect(row.getByLabel(`Set ${index} failure reason`)).toHaveValue("failed_reps");}
  await expect(coach.getByRole("form",{name:"Set 3",exact:true})).toContainText("exceeded");
  await coach.setViewportSize({width:820,height:1180});await noOverflow(coach);await coach.screenshot({path:testInfo.outputPath("workout-ipad.png"),fullPage:true});
  await coach.getByLabel("Session duration (minutes)").fill("45");await coach.getByLabel("Coach notes",{exact:true}).fill("QA verification session");await coach.getByRole("button",{name:"Complete workout",exact:true}).click();await expect(coach.getByRole("heading",{name:"Workout complete",exact:true})).toBeVisible();
  await coach.goto(`/coach/clients/${clientId}?tab=intake`);
  await coach.getByLabel("Session or workout").selectOption({index:1});
  for(let i=1;i<=8;i++)await coach.getByRole("button",{name:`Question ${i}: 6`,exact:true}).click();
  await coach.getByRole("button",{name:"Save check-in",exact:true}).click();await expect(coach.locator('p[role="status"]')).toContainText("All eight responses saved");
  await coach.getByRole("button",{name:"Continue →",exact:true}).click();
  for(const [id,value] of Object.entries({squatLoadKg:"80",squatReps:"3",squatOneRmKg:"88",benchLoadKg:"60",benchReps:"3",benchOneRmKg:"66",pullupStrictReps:"4"}))await coach.locator(`#${id}`).fill(value);
  await coach.getByRole("button",{name:"Continue →",exact:true}).click();await coach.locator("#rowerDistanceM").fill("2000");await coach.locator("#rowerTimeSeconds").fill("495");
  await coach.getByRole("button",{name:"Continue →",exact:true}).click();await coach.getByLabel("Assessment status").selectOption("completed");await coach.locator("#inbodyTestDate").fill(date);
  for(const [id,value]of Object.entries({weightKg:"75",inbodyScore:"80",skeletalMuscleMassKg:"35",bodyFatMassKg:"15",bodyFatPercentage:"20",bmi:"23",visceralFatLevel:"5",ecwTbw:"0.38",bmrKcal:"1700"}))await coach.locator(`#${id}`).fill(value);
  await coach.screenshot({path:testInfo.outputPath("inbody-ipad.png"),fullPage:true});
  await coach.getByRole("button",{name:"Continue →",exact:true}).click();await coach.getByRole("button",{name:"Save versioned intake & baseline"}).click();await expect(coach.getByRole("status")).toContainText("Versioned intake and baseline saved");
  const clientContext=await browser.newContext({viewport:{width:390,height:844}});const client=await clientContext.newPage();await login(client,"CLIENT");await client.goto("/client/schedule");await expect(client.getByText(/Training with QA Coach/)).toBeVisible();
  for(const [actor,role]of [[coach,"coach"],[client,"client"]] as const){await actor.goto(`/${role}/profile`);const photo=await sharp({create:{width:600,height:800,channels:3,background:role==="coach"?"#927543":"#425f55"}}).png().toBuffer();const chooserPromise=actor.waitForEvent("filechooser");await actor.getByRole("button",{name:"Choose photo",exact:true}).click();const chooser=await chooserPromise;await chooser.setFiles({buffer:photo,name:"qa-avatar.png",mimeType:"image/png"});await expect(actor.getByRole("img",{name:"Cropped profile photo preview"})).toBeVisible();await actor.getByRole("button",{name:"Save photo",exact:true}).click();await expect(actor.getByRole("status")).toContainText("Profile photo updated");await expect(actor.getByRole("button",{name:"Change profile photo"}).locator("img")).toBeVisible();await actor.reload();await expect(actor.getByRole("button",{name:"Change profile photo"}).locator("img")).toBeVisible();await actor.getByRole("button",{name:"Log out",exact:true}).click();await login(actor,role.toUpperCase() as "COACH"|"CLIENT");await actor.goto(`/${role}/profile`);await expect(actor.getByRole("button",{name:"Change profile photo"}).locator("img")).toBeVisible();await noOverflow(actor);}
  await client.goto(`/client/book?date=${date}`);await expect(client.getByRole("heading",{name:"QA Coach",exact:true})).toBeVisible();await expect(client.getByRole("radio").first()).toBeVisible();await expect(client.locator('[aria-label="Choose a session date"] button')).toHaveCount(31);await noOverflow(client);await client.screenshot({path:testInfo.outputPath("client-book-phone.png"),fullPage:true});
  await page.goto("/owner/clients");await expect(page.getByRole("link",{name:"Open Client: QA Client",exact:true}).locator("img")).toBeVisible();await page.goto("/owner/team");await expect(page.locator("img").first()).toBeVisible();
  await coach.goto(workoutUrl);await expect(coach.getByRole("heading",{name:"Workout complete",exact:true})).toBeVisible();
  expect(runtimeErrors).toEqual([]);
  await coachContext.close();await clientContext.close();void ownerContext;
});

import {test,expect,type Page} from "@playwright/test";
import {createClient} from "@supabase/supabase-js";
test.use({trace:"off"});

test("Client logs actual recovery and daily activity without changing completed training",async({page,browser},info)=>{
 test.skip(process.env.RAVOGE_CLIENT_LOG_QA!=="yes"||process.env.SUPABASE_DB_TARGET!=="local"||info.project.name!=="desktop","Isolated CI fixtures only");test.setTimeout(120000);
 const users=JSON.parse(process.env.BETA_QA_USERS!) as {id:string;email:string;password:string;name:string;role:string}[];
 const client=users.find(u=>u.role==="client")!,coach=users.find(u=>u.role==="coach")!,owner=users.find(u=>u.role==="owner")!;
 const date=process.env.BETA_QA_LOG_DATE!,workoutId=process.env.BETA_QA_LOG_WORKOUT!,corrected=new Date(new Date(`${date}T12:00:00Z`).getTime()-86400000).toISOString().slice(0,10);
 const api=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
 expect((await api.auth.signInWithPassword({email:client.email,password:client.password})).error).toBeNull();
 const before=await api.from("workout_assignments").select("*,workout_exercises(*,workout_sets(*))").eq("id",workoutId).single();expect(before.error).toBeNull();
 async function login(p:Page,u:typeof client){await p.goto("/login");await p.getByLabel("Email",{exact:true}).fill(u.email);await p.getByLabel("Password",{exact:true}).fill(u.password);await p.getByRole("button",{name:"Login",exact:true}).click();await expect(p).toHaveURL(new RegExp(`/${u.role}$`),{timeout:25000});}
 await login(page,client);
 await page.getByRole("link",{name:"Completed logging QA session",exact:false}).click();
 const recovery=page.getByRole("region",{name:"Workout recovery"});
 await recovery.getByText("Log sauna",{exact:true}).click();
 const sauna=page.getByRole("form",{name:"Add Sauna",exact:true});await expect(sauna.getByLabel("Recovery date",{exact:true})).toHaveValue(date);
 await sauna.getByLabel("Actual recovery time").fill("12:00");await sauna.getByLabel("Actual minutes completed").fill("12");await sauna.getByRole("button",{name:"Save recovery",exact:true}).click();
 await expect(recovery.getByText(`Sauna · 12 min · ${date} · Edit`,{exact:true})).toBeVisible();await page.reload();
 await recovery.getByText(`Sauna · 12 min · ${date} · Edit`,{exact:true}).click();
 const editSauna=page.getByRole("form",{name:"Edit Sauna",exact:true});await editSauna.getByLabel("Actual minutes completed").fill("15");await editSauna.getByLabel("Recovery date").fill(corrected);await editSauna.getByRole("button",{name:"Save recovery",exact:true}).click();
 await expect(recovery.getByText(`Sauna · 15 min · ${corrected} · Edit`,{exact:true})).toBeVisible();
 await recovery.getByText("Log plunge",{exact:true}).click();const plunge=page.getByRole("form",{name:"Add Cold plunge",exact:true});await plunge.getByLabel("Actual recovery time").fill("12:30");await plunge.getByLabel("Actual minutes completed").fill("2");await plunge.getByLabel("Water temperature (optional)",{exact:true}).fill("46");await plunge.getByRole("button",{name:"Save recovery",exact:true}).click();
 await expect(recovery.getByText(/Cold plunge · 2 min · 46 °F/)).toBeVisible();
 await page.getByRole("navigation",{name:"client navigation"}).getByRole("link",{name:"My day",exact:true}).click();
 await page.getByLabel("Date",{exact:true}).fill(date);await page.getByRole("button",{name:"Open date",exact:true}).click();
 const nutrition=page.getByRole("form",{name:"Daily nutrition",exact:true});await expect(nutrition.getByLabel("Calories",{exact:true})).toHaveValue("");
 await nutrition.getByLabel("Calories",{exact:true}).fill("2100");await nutrition.getByLabel("Protein (g, optional)").fill("125");await nutrition.getByRole("button",{name:"Save daily total",exact:true}).click();
 await expect(page.getByRole("region",{name:"Daily and recovery history"}).getByText("Calories: 2100 · Protein: 125 g",{exact:true})).toBeVisible();await page.reload();
 await expect(nutrition.getByLabel("Calories",{exact:true})).toHaveValue("2100");await nutrition.getByLabel("Calories",{exact:true}).fill("2300");await nutrition.getByRole("button",{name:"Save daily total",exact:true}).click();
 await expect(page.getByRole("region",{name:"Daily and recovery history"}).getByText("Calories: 2300 · Protein: 125 g",{exact:true})).toBeVisible();
 async function addActivity(type:string,minutes:string,distance?:string){await page.getByText("Add activity",{exact:true}).click();const f=page.getByRole("form",{name:"Add activity",exact:true});await expect(f.getByLabel("Distance unit",{exact:true})).toHaveValue("mi");await f.getByLabel("Activity",{exact:true}).selectOption(type);await f.getByLabel("Actual minutes",{exact:true}).fill(minutes);if(distance)await f.getByLabel("Distance (optional)",{exact:true}).fill(distance);await f.getByRole("button",{name:"Save activity",exact:true}).click();await expect(page.getByRole("form",{name:"Add activity",exact:true})).toBeHidden();}
 await addActivity("walk","20","1");await addActivity("jog","15");await page.reload();
 await page.getByText("Walk · 20 min · 1 mi · Effort: Not logged · Edit",{exact:true}).click();const editWalk=page.getByRole("form",{name:"Edit Walk",exact:true});await editWalk.getByLabel("Actual minutes",{exact:true}).fill("25");await editWalk.getByLabel("Activity date",{exact:true}).fill(corrected);await editWalk.getByRole("button",{name:"Save activity",exact:true}).click();await expect(page.getByRole("form",{name:"Edit Walk",exact:true})).toHaveCount(0);
 const history=page.getByRole("region",{name:"Daily and recovery history"});await expect(history.getByText("Walk · 25 min · 1 mi · Effort: Not logged",{exact:true})).toBeVisible();
 await page.getByText("Jog · 15 min · Distance: Not logged · Effort: Not logged · Edit",{exact:true}).click();page.once("dialog",d=>d.accept());await page.getByRole("button",{name:"Delete activity",exact:true}).click();await expect(page.getByText("Jog · 15 min · Distance: Not logged · Effort: Not logged · Edit",{exact:true})).toHaveCount(0);
 for(const width of [390,820,1440]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.getByRole("navigation",{name:"client navigation"}).focus();await page.keyboard.press("Tab");await expect(page.getByRole("navigation",{name:"client navigation"}).getByRole("link").first()).toBeFocused();}
 const cc=await browser.newContext(),cp=await cc.newPage();await login(cp,coach);await cp.goto(`/coach/clients/${client.id}?tab=progress`);await expect(cp.getByRole("region",{name:"Daily and recovery history"}).getByText("Walk · 25 min · 1 mi · Effort: Not logged",{exact:true})).toBeVisible();await expect(cp.getByText("Sauna · 15 min · Linked to completed workout",{exact:true})).toBeVisible();
 const oc=await browser.newContext(),op=await oc.newPage();await login(op,owner);await op.goto(`/owner/clients/${client.id}?tab=progress`);await expect(op.getByRole("region",{name:"Daily and recovery history"}).getByText("Calories: 2300 · Protein: 125 g",{exact:true})).toBeVisible();

 // Complete through the ordinary Coach interface, then open the same durable report as Client and Owner.
 const newWorkout=process.env.BETA_QA_REPORT_WORKOUT!;
 await cp.goto(`/coach/clients/${client.id}/workouts/${newWorkout}`);
 await cp.getByLabel("Set 1 result",{exact:true}).selectOption("complete");await cp.getByRole("button",{name:"Save set",exact:true}).click();await expect(cp.getByText("Set saved",{exact:true})).toBeVisible();
 await cp.getByLabel("Coach notes",{exact:true}).fill("Actual Coach recap for this report.");await cp.getByLabel("Session duration (minutes)",{exact:true}).fill("35");await cp.getByRole("button",{name:"Complete workout",exact:true}).click();
 await expect(cp.getByRole("heading",{name:"Session complete",exact:true})).toBeVisible();await expect(cp.getByText("Actual Coach recap for this report.",{exact:true})).toBeVisible();
 await page.goto("/client/profile");await page.locator("#workout-history").getByRole("link",{name:/Report completion QA session/}).click();await expect(page.getByRole("heading",{name:"Session complete",exact:true})).toBeVisible();await page.reload();
 for(const width of [390,820,1180,1440]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
 await expect(page.getByRole("heading",{name:"Score pending",exact:true})).toBeVisible();await page.getByRole("link",{name:"Book next session",exact:true}).click();await expect(page).toHaveURL(/\/client\/book/);await expect(page.getByRole("heading",{name:"Train with your Coach",exact:true})).toBeVisible();
 await cp.goto(`/coach/clients/${client.id}/progress`);await expect(cp.getByRole("heading",{name:"6-week progress",exact:true})).toBeVisible();await cp.getByLabel("Summary",{exact:true}).fill("Reviewed actual outcomes.");await cp.getByLabel("Next priorities",{exact:true}).fill("Continue Coach review.");await cp.getByRole("button",{name:"Share with Client",exact:true}).click();await expect(cp.getByText(/Progress report shared with this Client/)).toBeVisible();
 await page.goto("/client/progress");await page.getByRole("link",{name:/Revision 1/}).click();await expect(page.getByText("Reviewed actual outcomes.",{exact:true})).toBeVisible();
 await op.goto(`/owner/clients/${client.id}/workouts/${newWorkout}`);await expect(op.getByRole("heading",{name:"Session complete",exact:true})).toBeVisible();await expect(op.getByText("Actual Coach recap for this report.",{exact:true})).toBeVisible();
 expect((await api.from("workout_session_reports").select("workout_assignment_id").eq("workout_assignment_id",newWorkout)).data?.length).toBe(1);
 await page.goto(`/client/workouts/${workoutId}`);await page.getByText("Log sauna",{exact:true}).click();const separate=page.getByRole("form",{name:"Add Sauna",exact:true});await separate.getByLabel("Actual recovery time").fill("13:00");await separate.getByLabel("Actual minutes completed").fill("5");await separate.getByRole("button",{name:"Save recovery",exact:true}).click();await expect(page.getByText(`Sauna · 5 min · ${date} · Edit`,{exact:true})).toBeVisible();await page.getByText(`Sauna · 5 min · ${date} · Edit`,{exact:true}).click();page.once("dialog",d=>d.accept());await page.getByRole("button",{name:"Delete recovery",exact:true}).click();await expect(page.getByText(`Sauna · 5 min · ${date} · Edit`,{exact:true})).toHaveCount(0);
 const counts=await Promise.all([api.from("client_daily_totals").select("*").eq("log_date",date),api.from("client_activity_entries").select("*"),api.from("client_recovery_entries").select("*").is("deleted_at",null)]);expect(counts.map(r=>r.data?.length)).toEqual([1,1,2]);
 const after=await api.from("workout_assignments").select("*,workout_exercises(*,workout_sets(*))").eq("id",workoutId).single();expect(after.data).toEqual(before.data);
 await cc.close();await oc.close();await api.auth.signOut();
});

import {test,expect,type Page} from "@playwright/test";
import {createClient} from "@supabase/supabase-js";
test.use({trace:"off"});
test("Owner resolves appointments and assignments, removes gym access and preserves identities",async({page,browser},info)=>{
 test.skip(process.env.RAVOGE_MEMBER_REMOVE_QA!=="yes"||process.env.SUPABASE_DB_TARGET!=="local"||info.project.name!=="desktop","Isolated CI fixtures only");test.setTimeout(120000);
 const users=JSON.parse(process.env.BETA_QA_USERS!) as {id:string;email:string;password:string;name:string;role:string}[];
 const owner=users.find(u=>u.role==="owner")!,coach=users.find(u=>u.role==="coach")!,client=users.find(u=>u.role==="client")!;
 async function login(p:Page,u:typeof owner){await p.goto("/login");await p.getByLabel("Email",{exact:true}).fill(u.email);await p.getByLabel("Password",{exact:true}).fill(u.password);await p.getByRole("button",{name:"Login",exact:true}).click();await expect(p).toHaveURL(new RegExp(`/${u.role}$`),{timeout:25000});}
 const cc=await browser.newContext(),cp=await cc.newPage(),clc=await browser.newContext(),cl=await clc.newPage();
 await login(page,owner);await login(cp,coach);await login(cl,client);
 await page.goto("/owner/team");await expect(page.locator(`[data-member-id="${owner.id}"]`).getByRole("link",{name:/Remove/})).toHaveCount(0);
 await page.locator(`[data-member-id="${coach.id}"]`).getByRole("link",{name:"Remove Coach",exact:true}).click();
 await expect(page.getByRole("heading",{name:"Remove Coach",exact:true})).toBeVisible();await expect(page.getByRole("button",{name:"Remove Coach",exact:true})).toBeDisabled();
 await expect(page.getByRole("heading",{name:"Future or in-progress appointments (1)"})).toBeVisible();
 page.once("dialog",d=>d.dismiss());await page.getByRole("button",{name:"Cancel appointment",exact:true}).click();await expect(page.getByRole("heading",{name:"Future or in-progress appointments (1)"})).toBeVisible();
 page.once("dialog",d=>d.accept());await page.getByRole("button",{name:"Cancel appointment",exact:true}).click();await expect(page.getByRole("heading",{name:"Future or in-progress appointments (0)"})).toBeVisible();
 await page.getByRole("checkbox",{name:/End the 1 Coach assignment/}).check();
 for(const width of [390,820,1440]){await page.setViewportSize({width,height:1000});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
 page.once("dialog",async d=>{expect(d.message()).toContain(coach.name);await d.dismiss();});await page.getByRole("button",{name:"Remove Coach",exact:true}).click();await expect(page.getByRole("button",{name:"Remove Coach",exact:true})).toBeVisible();
 page.once("dialog",d=>d.accept());await page.getByRole("button",{name:"Remove Coach",exact:true}).click();await expect(page.getByText("This member no longer has active access to this gym.")).toBeVisible();
 await cp.reload();await expect(cp).not.toHaveURL(/\/coach$/);await expect(cp.getByRole("navigation",{name:"coach navigation"})).toHaveCount(0);
 await page.goto("/owner/team");await expect(page.locator(`[data-member-id="${coach.id}"]`)).toHaveCount(0);await expect(page.getByText("Removed members — audit history")).toBeVisible();
 await page.locator(`[data-member-id="${client.id}"]`).getByRole("link",{name:"Remove Client",exact:true}).click();page.once("dialog",d=>d.accept());await page.getByRole("button",{name:"Remove Client",exact:true}).click();await expect(page.getByText("This member no longer has active access to this gym.")).toBeVisible();
 await cl.reload();await expect(cl).not.toHaveURL(/\/client$/);await expect(cl.getByRole("navigation",{name:"client navigation"})).toHaveCount(0);
 const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,{auth:{persistSession:false}});
 for(const u of [coach,client]){const signed=await db.auth.signInWithPassword({email:u.email,password:u.password});expect(signed.error).toBeNull();expect(signed.data.user?.id).toBe(u.id);await db.auth.signOut();}
 await cc.close();await clc.close();
});

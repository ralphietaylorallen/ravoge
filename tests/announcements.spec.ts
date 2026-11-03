import {test,expect,type Page} from "@playwright/test";
test.use({trace:"off"});
test("Owner selects opted-in recipients, previews and queues privately; missing email safely pauses",async({page,browser},info)=>{
 test.skip(process.env.RAVOGE_ANNOUNCEMENTS_QA!=="yes"||process.env.SUPABASE_DB_TARGET!=="local"||info.project.name!=="desktop","Isolated CI fixtures only");test.setTimeout(120000);
 const users=JSON.parse(process.env.BETA_QA_USERS!) as {id:string;email:string;password:string;name:string;role:string}[];
 const owner=users.find(u=>u.role==="owner")!,coach=users.find(u=>u.role==="coach")!,client=users.find(u=>u.role==="client")!;
 async function login(p:Page,u:typeof owner){await p.goto("/login");await p.getByLabel("Email",{exact:true}).fill(u.email);await p.getByLabel("Password",{exact:true}).fill(u.password);await p.getByRole("button",{name:"Login",exact:true}).click();await expect(p).toHaveURL(new RegExp(`/${u.role}$`),{timeout:25000});}
 const context=await browser.newContext(),cp=await context.newPage();await login(cp,client);await cp.goto("/client/profile");
 await cp.getByLabel("Email me optional announcements from my gym").check();await cp.getByRole("button",{name:"Save email preference",exact:true}).click();await expect(cp.getByText("You opted in to optional gym announcements.")).toBeVisible();
 await cp.goto("/owner/announcements");await expect(cp.getByRole("heading",{name:"Announcements",exact:true})).toHaveCount(0);
 await login(page,owner);await page.goto("/owner/announcements");await expect(page.getByRole("heading",{name:"Announcements",exact:true})).toBeVisible();
 await expect(page.getByText("1 eligible recipients",{exact:true})).toBeVisible();
 await expect(page.getByLabel("Announcement recipients").getByRole("checkbox")).toHaveCount(1);
 await page.getByLabel("Audience",{exact:true}).selectOption("team");await expect(page.getByText("0 eligible recipients",{exact:true})).toBeVisible();await expect(page.getByRole("button",{name:"Preview announcement",exact:true})).toBeDisabled();
 await page.getByLabel("Audience",{exact:true}).selectOption("clients");await page.getByLabel("Select all eligible recipients",{exact:true}).uncheck();await expect(page.getByText("0 eligible recipients",{exact:true})).toBeVisible();await page.getByLabel("Select all eligible recipients",{exact:true}).check();
 await page.getByLabel("Subject",{exact:true}).fill("Private gym update");await page.getByLabel("Message",{exact:true}).fill("New training hours. No private member details.");
 await page.getByRole("button",{name:"Preview announcement",exact:true}).click();await expect(page.getByRole("heading",{name:"Preview announcement",exact:true})).toBeVisible();
 for(const width of [390,820,1180,1440]){await page.setViewportSize({width,height:1000});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
 page.once("dialog",d=>d.dismiss());await page.getByRole("button",{name:"Confirm 1 recipients & Send",exact:true}).click();await expect(page.getByRole("heading",{name:"Preview announcement",exact:true})).toBeVisible();
 page.once("dialog",async d=>{expect(d.message()).toContain("1 separate private email");await d.accept();});await page.getByRole("button",{name:"Confirm 1 recipients & Send",exact:true}).click();
 await expect(page.getByText("Queue saved. Sending is not configured in this environment; no emails were sent.")).toBeVisible();await expect(page.getByRole("status").filter({hasText:"Queued: 1"})).toBeVisible();
 await page.reload();await page.getByRole("button",{name:"Open announcement",exact:true}).click();await expect(page.getByRole("status").filter({hasText:"Provider-accepted: 0"})).toBeVisible();await expect(page.getByText(client.email,{exact:true})).toBeVisible();
 await context.clearCookies();await login(cp,coach);await cp.goto("/owner/announcements");await expect(cp.getByRole("heading",{name:"Announcements",exact:true})).toHaveCount(0);await context.close();
});

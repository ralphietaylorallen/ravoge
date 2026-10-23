import {test,expect as baseExpect,type Page} from '@playwright/test';
import {createClient} from '@supabase/supabase-js';
import {completeGoalsPage} from './helpers/intake';
const expect=baseExpect.configure({timeout:15000});
type Account={id:string;email:string;password:string;role:string};
const accounts:Account[]=JSON.parse(process.env.BETA_QA_USERS??'[]');
// Optional transport diagnostic for Windows networks that reset HTTP/2 streams.
// HTTPS certificate validation and every application assertion stay unchanged.
test.use({trace:'off',video:'off',actionTimeout:25000,launchOptions:process.env.RAVOGE_QA_HTTP1==='yes'?{args:['--disable-http2']}:undefined});
async function login(page:Page,a:Account){await page.goto('/login');await page.getByLabel('Email',{exact:true}).fill(a.email);await page.getByLabel('Password',{exact:true}).fill(a.password);await page.getByRole('button',{name:'Login',exact:true}).click();await expect(page).toHaveURL(new RegExp(`/${a.role}$`),{timeout:45000});}
async function api(a:Account){const x=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});expect((await x.auth.signInWithPassword(a)).error).toBeNull();return x;}
test('raw references: all 124 pages, reversible enable, immediate new import, source-aware draft and independent Client assignment',async({browser},info)=>{
 test.skip(process.env.RAVOGE_REFERENCE_QA!=='yes'||info.project.name!=='desktop','Explicit isolated Ravoge fixtures required');test.setTimeout(360000);
 const ownerAccount=accounts.find(a=>a.role==='owner')!,coachAccount=accounts.find(a=>a.role==='coach')!,clientAccount=accounts.find(a=>a.role==='client')!;
 const oc=await browser.newContext(),cc=await browser.newContext(),uc=await browser.newContext();const owner=await oc.newPage(),coach=await cc.newPage(),client=await uc.newPage();
 const errors:string[]=[];for(const p of [owner,coach,client]){p.on('pageerror',()=>errors.push('runtime error'));p.on('requestfailed',r=>{if(r.failure()?.errorText!=='net::ERR_ABORTED')console.log('QA browser transport',new URL(r.url()).pathname,r.failure()?.errorText);});}
 const oa=await api(ownerAccount),ca=await api(coachAccount),ua=await api(clientAccount);
 await login(owner,ownerAccount);await login(coach,coachAccount);await login(client,clientAccount);
 if(process.env.RAVOGE_CINEMATIC_QA==='yes'){
  for(const [actor,label,path]of [[owner,'owner-home','/owner'],[owner,'owner-team','/owner/team'],[owner,'owner-apps','/owner/apps'],[owner,'owner-equipment','/owner/equipment'],[owner,'owner-schedule','/owner/schedule'],[coach,'coach-clients','/coach'],[coach,'coach-schedule','/coach/schedule'],[coach,'profile','/coach/profile'],[client,'client-home','/client'],[client,'client-profile','/client/profile'],[client,'client-book','/client/book']]as const){
   await actor.goto(path);await expect(actor.locator('[data-ravoge-visual="cinematic"]')).toBeVisible();
   for(const [width,height]of [[390,844],[820,1180],[1440,1000]]){await actor.setViewportSize({width,height});expect(await actor.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await actor.screenshot({path:info.outputPath(`cinematic-${label}-${width}.png`),fullPage:true,style:'[data-netlify-deploy-id] { visibility: hidden !important; }'});}
  }
 }
 await owner.goto('/owner/equipment');await owner.getByRole('checkbox',{name:'Bands',exact:true}).check();await owner.getByRole('button',{name:'Save available equipment',exact:true}).click();await expect(owner.getByRole('status').filter({hasText:'Selected equipment types added'})).toBeVisible({timeout:15000});
 const equipment=owner.locator('section').filter({has:owner.getByRole('heading',{name:'Add equipment',exact:true})});
 await equipment.getByLabel('Equipment type',{exact:true}).selectOption('dumbbells');await equipment.getByLabel('Name',{exact:true}).fill('Synthetic confirmed dumbbell pairs');await equipment.getByLabel('Quantity (optional)').fill('12');await equipment.getByLabel('Minimum weight (lb)').fill('20');await equipment.getByLabel('Maximum weight (lb)').fill('50');await equipment.getByLabel('Exact available sizes (lb, optional)').fill('20, 25, 30, 35, 40, 50');await equipment.getByRole('button',{name:'Add equipment',exact:true}).click();await expect(equipment.getByRole('status')).toContainText('Saved.');
 async function upload(count:number,prefix:string){await owner.goto('/owner/training-library/import');const csv='Title,Description\n'+Array.from({length:count},(_,i)=>`${prefix} ${i+1},"Goblet Squat; Band Row; Dead Bug. EMOM circuit per side with unspecified station targets."`).join('\n');await owner.getByLabel('Workout history file').setInputFiles({buffer:Buffer.from(csv),name:'synthetic-raw.csv',mimeType:'text/csv'});await expect(owner.getByRole('button',{name:'Parse and preview'})).not.toBeVisible();await owner.getByRole('button',{name:'Upload workouts',exact:true}).click();await expect(owner.getByRole('status').filter({hasText:'Added to your gym'})).toBeVisible();await expect(owner.getByRole('button',{name:'Save import',exact:true})).toHaveCount(0);}
 await upload(124,'Raw style QA');const before=(await oa.from('training_library_items').select('id,normalized_content').order('id')).data;expect(before).toHaveLength(124);
 expect((await oa.from('training_library_reviews').select('id')).data).toEqual([]);
 await owner.goto('/owner/training-library');await expect(owner.getByRole('status').filter({hasText:'124 gym references enabled'})).toBeVisible();
 await expect(owner.locator('body')).not.toContainText('original source records');await owner.getByRole('button',{name:'Use as gym references',exact:true}).click();await expect(owner.getByRole('alert').filter({hasText:'Select workouts'})).toHaveText('Select workouts, or choose Select all workouts first.');await expect(owner.getByRole('dialog')).not.toBeVisible();
 await owner.getByRole('checkbox',{name:/Select all workouts/}).check();await expect(owner.getByText('All 124 matching workouts selected, including other pages.')).toBeVisible();
 await owner.getByRole('button',{name:'Exclude from generation',exact:true}).click();await expect(owner.getByRole('status').filter({hasText:'124 workout(s) excluded'})).toBeVisible();
 await owner.getByRole('checkbox',{name:/Select all workouts/}).check();
 await owner.getByRole('button',{name:'Use as gym references',exact:true}).click();const confirmation=owner.getByRole('dialog',{name:'Use these workouts as examples of this gym’s programming style?',exact:true});await expect(confirmation).toBeVisible();await owner.keyboard.press('Escape');await expect(confirmation).not.toBeVisible();expect((await oa.from('training_library_items').select('id').eq('reference_enabled',true)).data).toHaveLength(0);
 await owner.getByRole('button',{name:'Use as gym references',exact:true}).click();await confirmation.getByRole('button',{name:'Use workouts',exact:true}).focus();await owner.keyboard.press('Enter');await expect(confirmation).not.toBeVisible();await expect(owner.getByRole('status').filter({hasText:'124 workout(s) enabled'})).toBeVisible();
 expect((await oa.from('training_library_items').select('id,normalized_content').order('id')).data).toEqual(before);
 for(const [width,height]of [[390,844],[820,1180],[1440,1000]]){await owner.setViewportSize({width,height});expect(await owner.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await owner.screenshot({path:info.outputPath(`raw-library-${width}.png`),fullPage:true,style:'[data-netlify-deploy-id] { visibility: hidden !important; }'});}
 await upload(1,'New immediate QA');await owner.goto('/owner/training-library');await expect(owner.getByRole('status').filter({hasText:'125 gym references enabled'})).toBeVisible();
 expect((await oa.from('training_library_items').select('id').eq('reference_enabled',true)).data).toHaveLength(125);
 await coach.goto(`/coach/clients/${clientAccount.id}?tab=intake`);
 if(process.env.RAVOGE_CINEMATIC_QA==='yes')for(const [width,height]of [[390,844],[820,1180],[1440,1000]]){await coach.setViewportSize({width,height});expect(await coach.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await coach.screenshot({path:info.outputPath(`cinematic-intake-${width}.png`),fullPage:true,style:'[data-netlify-deploy-id] { visibility: hidden !important; }'});}
 await completeGoalsPage(coach);
 await coach.getByRole('button',{name:'Continue →',exact:true}).click();
 await coach.locator('#squatOneRmMethod').selectOption('not_tested');await coach.locator('#benchOneRmMethod').selectOption('not_tested');await coach.getByLabel('Strict pull-ups',{exact:true}).fill('0');
 await coach.getByRole('button',{name:'Continue →',exact:true}).click();await coach.getByLabel('Distance (m)',{exact:true}).fill('500');await coach.getByLabel('Time (seconds)',{exact:true}).fill('120');
 await coach.getByRole('button',{name:'Continue →',exact:true}).click();await coach.getByRole('button',{name:'Continue →',exact:true}).click();
 await coach.getByRole('button',{name:'Save intake',exact:true}).click();
 try { await expect.poll(()=>coach.getByRole('status').allTextContents(),{timeout:15000}).toContainEqual(expect.stringMatching(/Intake saved/)); }
 catch(error) { await coach.screenshot({path:info.outputPath('intake-save-failure.png'),fullPage:true,style:'[data-netlify-deploy-id] { visibility: hidden !important; }'}); throw error; }
 await coach.goto(`/coach/clients/${clientAccount.id}`);await coach.getByRole('checkbox',{name:/I reviewed the latest intake/}).check();await coach.getByRole('button',{name:'Confirm intake safety review',exact:true}).click();
 await expect(coach.getByRole('button',{name:'Create workout',exact:true})).toBeEnabled();await coach.getByRole('button',{name:'Create workout',exact:true}).click();await expect(coach).toHaveURL(/\/prescriptions\//,{timeout:70000});
 const id=new URL(coach.url()).pathname.split('/').at(-1)!;const {data:draft}=await ca.from('generated_prescriptions').select('engine_version,generation_context,original_recommendation').eq('id',id).single();
 expect(draft!.generation_context.sourceType).toBe('gym_reference_examples');expect(draft!.generation_context.trainingSnapshot.knowledgeCounts.referenceEnabled).toBe(125);expect(draft!.generation_context.trainingSnapshot.knowledgeCounts.approved).toBe(0);
 expect(draft!.generation_context.referenceVersions.length).toBeGreaterThan(0);expect(draft!.generation_context.referenceVersions.length).toBeLessThanOrEqual(5);expect(draft!.generation_context.trainingSnapshot.knowledgeCatalog).toBeUndefined();
 expect(draft!.generation_context.loadEngine).toBe('deterministic-v1');expect(draft!.original_recommendation.every((e:{loadUnit:string})=>e.loadUnit==='lb')).toBe(true);
 expect(draft!.engine_version,`Provider outcome: ${draft!.generation_context.fallbackReason??'none'}; issue: ${new URL(coach.url()).searchParams.get('generationIssue')??'none'}`).toBe('prescription-v0.4-openai');
 expect(draft!.generation_context.provenanceAudit.gymPercentage).toBeGreaterThanOrEqual(90);
 expect(draft!.generation_context.evidence.sources.length).toBeGreaterThan(0);
 await expect(coach.getByRole('region',{name:'Generation evidence'})).toContainText(/Raw style QA|New immediate QA/);
 await expect(coach.getByLabel('Coach-confirmed 1RM (lb, only for a percentage target)').first()).not.toBeVisible();await expect(coach.getByText('Advanced: programming details and evidence',{exact:true})).toBeVisible();await expect(coach.getByText(/Gym-profile version:/)).not.toBeVisible();
 expect((await ua.from('generated_prescriptions').select('id')).data).toEqual([]);expect((await ua.from('workout_assignments').select('id')).data).toEqual([]);
 for(const band of await coach.locator('input[name="bandResistance"]:not([type="hidden"])').all())await band.fill('Light band — explicitly reviewed synthetic QA');
 const rules=(await ca.from('exercise_load_rules').select('exercise_id,prescription_type').eq('active',true)).data!;
 for(const row of await coach.locator('fieldset').filter({has:coach.locator('select[name="libraryExerciseId"]')}).all()){const exercise=await row.locator('select[name="libraryExerciseId"]').inputValue();const rule=rules.find(r=>r.exercise_id===exercise);const load=row.locator('input[name="exerciseLoad"]');if(['weighted','carry','sled'].includes(rule?.prescription_type??'')&&!await load.inputValue())await load.fill('20');}
 await coach.getByLabel('Coach instructions',{exact:true}).fill('Synthetic QA Coach reviewed raw-style adaptation, exact equipment and targets. Stop for pain.');
 for(const [width,height]of [[390,844],[820,1180],[1440,1000]]){await coach.setViewportSize({width,height});expect(await coach.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await coach.screenshot({path:info.outputPath(`raw-draft-${width}.png`),fullPage:true,style:'[data-netlify-deploy-id] { visibility: hidden !important; }'});}
 await coach.getByLabel('Workout name',{exact:true}).fill('Coach edited gym-inspired workout');await coach.getByRole('button',{name:'Assign',exact:true}).click();await expect(coach).toHaveURL(/notice=prescription-assigned/,{timeout:15000});
 const assignments=(await ua.from('workout_assignments').select('id')).data!;expect(assignments).toHaveLength(1);await client.goto(`/client/workouts/${assignments[0].id}`);await expect(client.getByRole('region',{name:'Ravoge workout player'})).toBeVisible();
 for(const [width,height]of [[390,844],[820,1180],[1440,1000]]){await client.setViewportSize({width,height});expect(await client.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await client.screenshot({path:info.outputPath(`client-workout-${width}.png`),fullPage:true,style:'[data-netlify-deploy-id] { visibility: hidden !important; }'});}
 const player=client.getByRole('region',{name:'Ravoge workout player'});await player.getByRole('button',{name:'Start workout',exact:true}).click();await expect(player.getByRole('status')).toContainText('Workout started');
 while(await player.locator('details[open] form').count()){const setId=await player.locator('details[open]').getAttribute('id');const set=player.locator(`#${setId} form`);await set.getByLabel('Actual effort (RPE, optional)').fill('5');const complete=set.getByRole('button',{name:'Complete set',exact:true});await complete.click();await expect(complete).not.toBeVisible();}
 try { await player.getByLabel('How difficult was today’s workout?').selectOption('3');await player.getByRole('button',{name:'Complete workout',exact:true}).click();await expect(player.getByRole('status')).toContainText('Workout recorded'); }
 catch(error){await client.screenshot({path:info.outputPath('client-completion-failure.png'),fullPage:true,style:'[data-netlify-deploy-id] { visibility: hidden !important; }'});console.log('QA completion route',new URL(client.url()).pathname);throw error;}
 await coach.goto(`/coach/clients/${clientAccount.id}`);await coach.getByRole('button',{name:'Create workout',exact:true}).click();await expect(coach).toHaveURL(/\/prescriptions\//,{timeout:70000});
 const nextId=new URL(coach.url()).pathname.split('/').at(-1)!;const next=(await ca.from('generated_prescriptions').select('generation_context').eq('id',nextId).single()).data!;expect(next.generation_context.trainingSnapshot.history.some((w:{status:string})=>w.status==='completed')).toBe(true);expect((await ua.from('workout_assignments').select('id')).data).toHaveLength(1);
 expect(errors).toEqual([]);await Promise.all([oa.auth.signOut(),ca.auth.signOut(),ua.auth.signOut()]);await Promise.all([oc.close(),cc.close(),uc.close()]);
});

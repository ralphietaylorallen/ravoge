import {test,expect,type Page} from '@playwright/test';
import {createClient} from '@supabase/supabase-js';
type Account={id:string;email:string;password:string;role:string};
const accounts:Account[]=JSON.parse(process.env.BETA_QA_USERS??'[]');
test.use({trace:'off',video:'off',actionTimeout:25000});
async function login(page:Page,a:Account){await page.goto('/login');await page.getByLabel('Email',{exact:true}).fill(a.email);await page.getByLabel('Password',{exact:true}).fill(a.password);await page.getByRole('button',{name:'Login',exact:true}).click();await expect(page).toHaveURL(new RegExp(`/${a.role}$`),{timeout:15000});}
async function api(a:Account){const x=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});expect((await x.auth.signInWithPassword(a)).error).toBeNull();return x;}
test('raw references: all 124 pages, reversible enable, immediate new import, source-aware draft and independent Client assignment',async({browser},info)=>{
 test.skip(process.env.RAVOGE_REFERENCE_QA!=='yes'||info.project.name!=='desktop','Explicit isolated Ravoge fixtures required');test.setTimeout(360000);
 const ownerAccount=accounts.find(a=>a.role==='owner')!,coachAccount=accounts.find(a=>a.role==='coach')!,clientAccount=accounts.find(a=>a.role==='client')!;
 const oc=await browser.newContext(),cc=await browser.newContext(),uc=await browser.newContext();const owner=await oc.newPage(),coach=await cc.newPage(),client=await uc.newPage();
 const errors:string[]=[];for(const p of [owner,coach,client])p.on('pageerror',()=>errors.push('runtime error'));
 const oa=await api(ownerAccount),ca=await api(coachAccount),ua=await api(clientAccount);
 await login(owner,ownerAccount);await login(coach,coachAccount);await login(client,clientAccount);
 expect((await oa.rpc('add_equipment_checklist',{selected_types:['dumbbells','bands']})).error).toBeNull();
 for(const n of [20,25,30,35,40,50])expect((await oa.rpc('save_gym_resource_lb',{target_id:null,resource_kind:'equipment',resource_type:'dumbbells',resource_name:`Synthetic exact pair ${n}`,resource_quantity:2,resource_length:null,resource_unit:'yards',available:true,resource_notes:null,minimum_lb:n,maximum_lb:n,exact_sizes_lb:[n],matched_pairs:false})).error).toBeNull();
 async function upload(count:number,prefix:string){await owner.goto('/owner/training-library/import');const csv='Title,Description\n'+Array.from({length:count},(_,i)=>`${prefix} ${i+1},"Goblet Squat; Band Row; Dead Bug. EMOM circuit per side with unspecified station targets."`).join('\n');await owner.getByLabel('Workout history file').setInputFiles({buffer:Buffer.from(csv),name:'synthetic-raw.csv',mimeType:'text/csv'});await owner.getByRole('button',{name:'Parse and preview'}).click();await owner.getByRole('button',{name:'Save import',exact:true}).click();await expect(owner.getByRole('status').filter({hasText:'Added to your gym'})).toBeVisible();}
 await upload(124,'Raw style QA');const before=(await oa.from('training_library_items').select('id,normalized_content').order('id')).data;expect(before).toHaveLength(124);
 expect((await oa.from('training_library_reviews').select('id')).data).toEqual([]);
 await owner.goto('/owner/training-library');await expect(owner.getByRole('status').filter({hasText:'124 gym references enabled'})).toBeVisible();
 await owner.getByRole('checkbox',{name:/Select all workouts/}).check();await expect(owner.getByText('All 124 matching workouts selected, including other pages.')).toBeVisible();
 await owner.getByRole('button',{name:'Exclude from generation',exact:true}).click();await expect(owner.getByRole('status').filter({hasText:'124 workout(s) excluded'})).toBeVisible();
 await owner.getByRole('checkbox',{name:/Select all workouts/}).check();
 let confirmations=0;owner.on('dialog',async d=>{expect(d.message()).toBe('Use these workouts as examples of this gym’s programming style?');confirmations++;await d.accept();});
 await owner.getByRole('button',{name:'Use as gym references',exact:true}).click();await expect(owner.getByRole('status').filter({hasText:'124 workout(s) enabled'})).toBeVisible();expect(confirmations).toBe(1);
 expect((await oa.from('training_library_items').select('id,normalized_content').order('id')).data).toEqual(before);
 for(const [width,height]of [[390,844],[820,1180],[1440,1000]]){await owner.setViewportSize({width,height});expect(await owner.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await owner.screenshot({path:info.outputPath(`raw-library-${width}.png`),fullPage:true});}
 await upload(1,'New immediate QA');await owner.goto('/owner/training-library');await expect(owner.getByRole('status').filter({hasText:'125 gym references enabled'})).toBeVisible();
 expect((await oa.from('training_library_items').select('id').eq('reference_enabled',true)).data).toHaveLength(125);
 const {data:intake,error}=await ca.rpc('upsert_client_intake',{target_client_user_id:clientAccount.id,intake_payload:{trainingFrequencyGoal:3,primaryGoal:'strength',trainingYears:2,experienceLevel:'intermediate',recentConsistency:'building',sessionDurationMinutes:45,sleepQuality:3,stressLevel:3,recoveryPerception:3,sorenessFatigue:3,constraintTags:[],customFields:{}}});expect(error).toBeNull();expect((await ca.rpc('confirm_intake_generation_safety',{target_intake_id:intake})).error).toBeNull();
 await coach.goto(`/coach/clients/${clientAccount.id}`);await coach.getByRole('button',{name:'Create workout',exact:true}).click();await expect(coach).toHaveURL(/\/prescriptions\//,{timeout:70000});
 const id=new URL(coach.url()).pathname.split('/').at(-1)!;const {data:draft}=await ca.from('generated_prescriptions').select('engine_version,generation_context,original_recommendation').eq('id',id).single();
 expect(draft!.generation_context.sourceType).toBe('gym_reference_examples');expect(draft!.generation_context.trainingSnapshot.knowledgeCounts.referenceEnabled).toBe(125);expect(draft!.generation_context.trainingSnapshot.knowledgeCounts.approved).toBe(0);
 expect(draft!.generation_context.referenceVersions.length).toBeGreaterThan(0);expect(draft!.generation_context.referenceVersions.length).toBeLessThanOrEqual(5);expect(draft!.generation_context.trainingSnapshot.knowledgeCatalog).toBeUndefined();
 expect(draft!.generation_context.loadEngine).toBe('deterministic-v1');expect(draft!.original_recommendation.every((e:{loadUnit:string})=>e.loadUnit==='lb')).toBe(true);
 if(process.env.RAVOGE_LIVE_WORKOUT_QA==='yes')expect(draft!.engine_version,`Provider outcome: ${draft!.generation_context.fallbackReason??'none'}; issue: ${new URL(coach.url()).searchParams.get('generationIssue')??'none'}`).toBe('prescription-v0.4-openai');else expect(draft!.engine_version).toBe('prescription-v0.4-fallback');
 await expect(coach.getByRole('region',{name:'Generation evidence'})).toContainText(/Raw style QA|New immediate QA/);
 expect((await ua.from('generated_prescriptions').select('id')).data).toEqual([]);expect((await ua.from('workout_assignments').select('id')).data).toEqual([]);
 for(const band of await coach.locator('input[name="bandResistance"]:not([type="hidden"])').all())await band.fill('Light band — explicitly reviewed synthetic QA');
 const rules=(await ca.from('exercise_load_rules').select('exercise_id,prescription_type').eq('active',true)).data!;
 for(const row of await coach.locator('fieldset').filter({has:coach.locator('select[name="libraryExerciseId"]')}).all()){const exercise=await row.locator('select[name="libraryExerciseId"]').inputValue();const rule=rules.find(r=>r.exercise_id===exercise);const load=row.locator('input[name="exerciseLoad"]');if(['weighted','carry','sled'].includes(rule?.prescription_type??'')&&!await load.inputValue())await load.fill('20');}
 await coach.getByLabel('Coach instructions',{exact:true}).fill('Synthetic QA Coach reviewed raw-style adaptation, exact equipment and targets. Stop for pain.');
 for(const [width,height]of [[390,844],[820,1180],[1440,1000]]){await coach.setViewportSize({width,height});expect(await coach.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await coach.screenshot({path:info.outputPath(`raw-draft-${width}.png`),fullPage:true});}
 await coach.getByRole('button',{name:'Approve & assign',exact:true}).click();await expect(coach).toHaveURL(/notice=prescription-assigned/,{timeout:15000});
 const assignments=(await ua.from('workout_assignments').select('id')).data!;expect(assignments).toHaveLength(1);await client.goto(`/client/workouts/${assignments[0].id}`);await expect(client.getByRole('region',{name:'Ravoge workout player'})).toBeVisible();
 for(const [width,height]of [[390,844],[820,1180],[1440,1000]]){await client.setViewportSize({width,height});expect(await client.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
 expect(errors).toEqual([]);await Promise.all([oa.auth.signOut(),ca.auth.signOut(),ua.auth.signOut()]);await Promise.all([oc.close(),cc.close(),uc.close()]);
});

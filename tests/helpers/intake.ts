import type { Page } from "@playwright/test";

/** Fill the real first page, explicitly report no spots, then open movement review. */
export async function completeGoalsPage(page:Page,{targetWeight,goal="Weight loss"}:{targetWeight?:string;goal?:"Weight loss"|"Muscle growth"|"Mobility"}={}) {
  await page.getByRole("radio",{name:goal,exact:true}).check();
  await page.getByLabel("Age",{exact:true}).fill("35");
  await page.getByLabel("Average workout days per week over the last 6 months").selectOption("3");
  await page.getByLabel("Days per week training with this gym").selectOption("3");
  await page.getByLabel("Strength-training experience").selectOption("intermediate");
  await page.getByLabel("Time available per session").selectOption("45");
  if(targetWeight) await page.getByLabel("Target weight (lb, optional)",{exact:true}).fill(targetWeight);
  for(const label of ["Sleep quality","Stress level","Perceived recovery","Soreness / fatigue"]) await page.getByLabel(label,{exact:true}).selectOption("3");
  await page.getByRole("button",{name:"Continue →",exact:true}).click();
  await page.getByRole("checkbox",{name:"No pain, injuries, or restrictions to report",exact:true}).check();
  await page.getByRole("button",{name:"Continue →",exact:true}).click();
}

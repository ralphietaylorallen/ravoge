"use client";
import { createContext, useContext } from "react";
import type { ExecutionState } from "@/app/coach/workout-actions";
import type { InjurySpot } from "@/lib/intake-history";

export type DemoAdapter = {
  intakeValues:Record<string,string[]>;
  captureIntake:(form:FormData)=>void;
  saveIntake:(state:ExecutionState,form:FormData)=>Promise<ExecutionState>;
  saveSpot:(spot:InjurySpot)=>Promise<{ok:true;spot:InjurySpot}>;
  removeSpot:(id:string)=>Promise<{ok:boolean;message:string}>;
  approve:(state:ExecutionState,form:FormData)=>Promise<ExecutionState>;
  session:(state:ExecutionState,form:FormData)=>Promise<ExecutionState>;
  recordSet:(setId:string,state:ExecutionState,form:FormData)=>Promise<ExecutionState>;
};
export const DemoContext=createContext<DemoAdapter|null>(null);
export const useDemo=()=>useContext(DemoContext);

"use client";
import { useState } from "react";
import styles from "./dashboard.module.css";
export type CheckinQuestion = {position:number;question_text:string|null;scale_min:number|null;scale_max:number|null};
function Scale({question,prefix}:{question:CheckinQuestion;prefix:string}) {
  const [value,setValue]=useState<number|null>(null);
  const id=`${prefix}-${question.position}`;
  return <li className={styles.checkinQuestion} data-wording-status={question.question_text?.startsWith("Question ")?"pending_product":"configured"}><div><label htmlFor={id}><span>{String(question.position).padStart(2,"0")}</span>{question.question_text??`Question ${question.position}`}</label><output htmlFor={id}>{value??"—"}<small>/10</small></output></div><input aria-label={`${question.question_text??`Question ${question.position}`} score`} id={id} max={10} min={1} onChange={(event)=>setValue(Number(event.target.value))} step={1} type="range" value={value??5} /><div className={styles.tapScale}>{Array.from({length:10},(_,index)=><button aria-label={`${question.question_text??`Question ${question.position}`}: ${index+1}`} aria-pressed={value===index+1} key={index} onClick={()=>setValue(index+1)} type="button">{index+1}</button>)}</div><input name={`answer-${question.position}`} type="hidden" value={value??""} /></li>;
}
export function CheckinScales({questions,prefix}:{questions:CheckinQuestion[];prefix:string}) {
  return <ol className={styles.checkinGrid}>{Array.from({length:8},(_,index)=>questions.find(q=>q.position===index+1)??{position:index+1,question_text:null,scale_min:1,scale_max:10}).map(q=><Scale key={q.position} prefix={prefix} question={q}/>)}</ol>;
}

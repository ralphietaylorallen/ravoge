"use client";
import styles from "./session-report.module.css";
export function ReportPrintButton(){return <button className={`${styles.secondary} ${styles.noPrint}`} onClick={()=>window.print()} type="button">Print / save PDF</button>;}

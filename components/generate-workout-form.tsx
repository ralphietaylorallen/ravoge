import Link from "next/link";
import styles from "./dashboard.module.css";
export function GenerateWorkoutForm({clientId,ready}:{clientId:string;ready:boolean}){
  return <Link className={styles.action} aria-disabled={!ready} href={`/coach/clients/${clientId}#train-session`}>Train / generate workout</Link>;
}

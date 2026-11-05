export function ReportIcon({kind,className}:{kind:"time"|"sets"|"weight"|"effort"|"progress"|"note"|"supplements"|"calendar"|"cardio";className?:string}) {
 const paths={
  time:<><circle cx="12" cy="13" r="8"/><path d="M9 2h6m-3 3v3m0 2v4m6-8 2-2"/></>,
  sets:<><path d="m3 7 9-5 9 5-9 5-9-5Zm0 5 9 5 9-5M3 17l9 5 9-5"/></>,
  weight:<><path d="M7 12h10M3 9v6m4-9v12m10-12v12m4-9v6"/></>,
  effort:<><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/></>,
  progress:<><path d="M4 21V13h3v8m3 0V8h3v13m3 0V3h3v18"/></>,
  note:<><path d="M4 3h16v14h-8l-5 5v-5H4Z"/><circle cx="8" cy="9" r=".5"/><circle cx="12" cy="9" r=".5"/><circle cx="16" cy="9" r=".5"/></>,
  supplements:<><path d="M6 7h12l-2 15H8L6 7Zm1-4h10v4H7V3Zm3 0V1h4v2M7 11h10"/></>,
  calendar:<><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 2v6m10-6v6M3 11h18m-10 4h2m-2 3h5"/></>,
  cardio:<><path d="M4 19h16M3 15h7l5-5h4M7 14l2-5 4 2m0 0 2 5h4M10 6l3 2"/><circle cx="14" cy="4" r="2"/></>,
 };
 return <svg className={className} aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{paths[kind]}</svg>;
}

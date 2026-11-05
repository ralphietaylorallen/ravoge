import { SessionReportPage } from "@/components/session-report-page";
export default async function OwnerSessionReport({params}:{params:Promise<{clientId:string;workoutId:string}>}){return <SessionReportPage {...await params} role="owner"/>;}

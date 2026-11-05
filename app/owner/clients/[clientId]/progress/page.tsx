import { ProgressReportPage } from "@/components/progress-report-page";
export default async function Page({params,searchParams}:{params:Promise<{clientId:string}>;searchParams:Promise<{end?:string;share?:string}>}) {
 return <ProgressReportPage role="owner" clientId={(await params).clientId} search={await searchParams}/>;
}

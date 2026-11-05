import { ProgressReportPage } from "@/components/progress-report-page";
export default async function Page({searchParams}:{searchParams:Promise<{end?:string;share?:string}>}) {
 return <ProgressReportPage role="client" search={await searchParams}/>;
}

import {WorkoutNowPage} from '@/components/workout-now-page';
export default function Page(props:{searchParams:Promise<{client?:string}>}) {return <WorkoutNowPage {...props} role="coach"/>;}

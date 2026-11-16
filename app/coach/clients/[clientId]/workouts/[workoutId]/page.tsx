import {TrainerWorkoutPage} from "@/components/trainer-workout-page";
export default async function Page(props:{params:Promise<{clientId:string;workoutId:string}>}) {return <TrainerWorkoutPage {...props} role="coach"/>;}

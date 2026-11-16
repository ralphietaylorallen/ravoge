import {TrainerPrescriptionPage} from '@/components/trainer-prescription-page';
export default async function Page(props:{params:Promise<{clientId:string;prescriptionId:string}>}) {return <TrainerPrescriptionPage {...props} role="owner"/>;}

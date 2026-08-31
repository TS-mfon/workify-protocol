import { DeliveryAction } from "@/components/ContractActions";
export default async function Deliver({params}:{params:Promise<{jobId:string}>}){const {jobId}=await params;return <><p className="muted">Job {jobId}</p><h1 className="page-title">Submit public evidence</h1><DeliveryAction jobId={jobId as `0x${string}`}/></>}

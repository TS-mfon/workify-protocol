import { AppealAction } from "@/components/ContractActions";
export default async function Appeal({params}:{params:Promise<{jobId:string}>}){const {jobId}=await params;return <><p className="muted">Job {jobId}</p><h1 className="page-title">Open appeal</h1><AppealAction jobId={jobId as `0x${string}`}/></>}

import { VerificationAction } from "@/components/ContractActions";
export default async function Verify({params}:{params:Promise<{jobId:string}>}){const {jobId}=await params;return <><p className="muted">Job {jobId}</p><h1 className="page-title">Verification</h1><VerificationAction jobId={jobId as `0x${string}`}/></>}

import { resolveGitHubPull, WorkifyError } from "@workify/evidence-engine";
import { NextResponse } from "next/server";
import { z } from "zod";
const input=z.object({issueUrl:z.string().url(),pullUrl:z.string().url()});
export async function POST(request:Request){try{return NextResponse.json(await resolveGitHubPull(...Object.values(input.parse(await request.json())) as [string,string]))}catch(error){const status=error instanceof WorkifyError&&error.code==="GITHUB_RATE_LIMITED"?429:400;return NextResponse.json({error:error instanceof Error?error.message:"Request failed"},{status})}}

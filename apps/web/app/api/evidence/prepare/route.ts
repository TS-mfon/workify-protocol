import { prepareEvidenceManifest, publicError } from "@workify/evidence-engine";
import { NextResponse } from "next/server";
export async function POST(request:Request){try{return NextResponse.json(await prepareEvidenceManifest(await request.json()))}catch(error){const result=publicError(error,"Evidence preparation failed");return NextResponse.json(result,{status:result.status})}}

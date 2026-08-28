import { getDatabase } from "@workify/evidence-engine";
import { NextResponse } from "next/server";
export async function GET(_:Request,{params}:{params:Promise<{hash:string}>}){const {hash}=await params;if(!/^[a-f0-9]{64}$/.test(hash))return NextResponse.json({error:"Invalid hash"},{status:400});const value=await (await getDatabase()).collection("evidence_manifests").findOne({_id:hash as never});return value?NextResponse.json(value.document):NextResponse.json({error:"Not found"},{status:404})}

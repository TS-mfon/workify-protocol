import { submitVerification } from "@workify/evidence-engine";
import { NextResponse } from "next/server";
export async function POST(request:Request){if(request.headers.get("authorization")!==`Bearer ${process.env.AUTOMATION_HMAC_SECRET}`)return NextResponse.json({error:"Unauthorized"},{status:401});try{return NextResponse.json(await submitVerification(await request.json()))}catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Verification submission failed"},{status:400})}}

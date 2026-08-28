import { runAutomationBatch } from "@workify/evidence-engine";
import { NextResponse } from "next/server";
export async function POST(request:Request){if(request.headers.get("authorization")!==`Bearer ${process.env.AUTOMATION_HMAC_SECRET}`)return NextResponse.json({error:"Unauthorized"},{status:401});return NextResponse.json({ok:true,...await runAutomationBatch()})}

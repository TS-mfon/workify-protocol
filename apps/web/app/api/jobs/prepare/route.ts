import { prepareJobSpecification } from "@workify/evidence-engine";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    return NextResponse.json(await prepareJobSpecification(await request.json()));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid specification" }, { status: 400 });
  }
}

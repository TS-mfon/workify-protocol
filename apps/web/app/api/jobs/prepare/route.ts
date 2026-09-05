import { prepareJobSpecification, publicError } from "@workify/evidence-engine";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    return NextResponse.json(await prepareJobSpecification(await request.json()));
  } catch (error) {
    const result = publicError(error, "Invalid specification");
    return NextResponse.json(result, { status: result.status });
  }
}

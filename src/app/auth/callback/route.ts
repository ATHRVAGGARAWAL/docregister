import { NextResponse } from "next/server";

/** Old email links lead to the current sign-in screen. */
export function GET(request: Request) {
  return NextResponse.redirect(new URL("/sign-in", request.url));
}

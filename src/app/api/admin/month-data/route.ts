import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { getAdminMonthData } from "@/lib/hls-admin";

export async function GET(request: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const month = request.nextUrl.searchParams.get("month")?.trim();
  const date = request.nextUrl.searchParams.get("date")?.trim();
  if (!month) {
    return NextResponse.json({ error: "Select a month." }, { status: 400 });
  }

  try {
    return NextResponse.json(await getAdminMonthData(month, date));
  } catch (error) {
    console.error("[admin/month-data]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load month data." },
      { status: 500 },
    );
  }
}

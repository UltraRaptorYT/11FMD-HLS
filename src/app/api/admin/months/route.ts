import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { createMonthSheet, listMonthSheets } from "@/lib/hls-admin";

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    return NextResponse.json({ months: await listMonthSheets() });
  } catch (error) {
    console.error("[admin/months GET]", error);
    return NextResponse.json(
      { error: "Could not load the workbook months." },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as { month?: string };
    if (!body.month) {
      return NextResponse.json({ error: "Select a month." }, { status: 400 });
    }

    return NextResponse.json(
      { month: await createMonthSheet(body.month) },
      { status: 201 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create month.";
    console.error("[admin/months POST]", error);
    return NextResponse.json(
      { error: message },
      { status: error instanceof Error && error.name === "MonthExistsError" ? 409 : 500 },
    );
  }
}

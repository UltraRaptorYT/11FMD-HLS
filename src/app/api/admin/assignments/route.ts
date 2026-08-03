import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import {
  clearAssignments,
  DUTY_SECTIONS,
  DutySection,
  saveAssignments,
} from "@/lib/hls-admin";

export async function POST(request: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      month?: string;
      date?: string;
      dutySection?: string;
      assignments?: Partial<Record<DutySection, string[]>>;
    };
    if (!body.month || !body.date || !body.dutySection || !body.assignments) {
      return NextResponse.json(
        { error: "Month, date, duty section, and assignments are required." },
        { status: 400 },
      );
    }

    const assignments = Object.fromEntries(
      DUTY_SECTIONS.map((section) => [section, body.assignments?.[section] ?? []]),
    ) as Record<DutySection, string[]>;

    return NextResponse.json(
      await saveAssignments(
        body.month,
        body.date,
        body.dutySection,
        assignments,
      ),
    );
  } catch (error) {
    console.error("[admin/assignments]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not save assignments." },
      { status: 400 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      month?: string;
      date?: string;
    };
    if (!body.month || !body.date) {
      return NextResponse.json(
        { error: "Month and date are required." },
        { status: 400 },
      );
    }

    return NextResponse.json(await clearAssignments(body.month, body.date));
  } catch (error) {
    console.error("[admin/assignments:delete]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not clear assignments." },
      { status: 400 },
    );
  }
}

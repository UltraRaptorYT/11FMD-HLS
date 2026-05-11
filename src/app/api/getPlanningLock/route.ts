import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";

const SPREADSHEET_ID = process.env.SHEET_ID!;
const CONFIG_SHEET_NAME = "CONFIG";

function getAuth() {
  const email = process.env.GOOGLE_SERVICE_EMAIL;
  const key = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!email || !key) {
    throw new Error("Missing Google service account env vars");
  }

  return new google.auth.JWT({
    email,
    key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
}

function normaliseValue(value: unknown) {
  return String(value ?? "")
    .trim()
    .toUpperCase();
}

function resolveFinalStatus(status: string, manualOverride: string) {
  return manualOverride || status || "UNLOCKED";
}

export async function GET(req: NextRequest) {
  try {
    const month = req.nextUrl.searchParams.get("month")?.trim().toUpperCase();

    if (!month) {
      return NextResponse.json({ error: "Missing month" }, { status: 400 });
    }

    const sheets = google.sheets({ version: "v4", auth: getAuth() });

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `'${CONFIG_SHEET_NAME}'!A:C`,
      majorDimension: "ROWS",
      valueRenderOption: "FORMATTED_VALUE",
    });

    const rows = res.data.values ?? [];
    const [headers, ...dataRows] = rows;

    if (!headers) {
      return NextResponse.json(
        { error: "CONFIG sheet has no headers" },
        { status: 500 },
      );
    }

    const monthIdx = headers.indexOf("MONTH");
    const statusIdx = headers.indexOf("STATUS");
    const overrideIdx = headers.indexOf("MANUAL OVERRIDE");

    if (monthIdx === -1 || statusIdx === -1 || overrideIdx === -1) {
      return NextResponse.json(
        { error: "Missing CONFIG headers" },
        { status: 500 },
      );
    }

    const matchedRow = dataRows.find((row) => {
      return normaliseValue(row[monthIdx]) === month;
    });

    if (!matchedRow) {
      return NextResponse.json({
        month,
        locked: false,
        status: "UNLOCKED",
        manualOverride: "",
        source: "default_unlocked",
      });
    }

    const status = normaliseValue(matchedRow[statusIdx]);
    const manualOverride = normaliseValue(matchedRow[overrideIdx]);
    const finalStatus = resolveFinalStatus(status, manualOverride);
    const locked = finalStatus === "LOCKED";

    return NextResponse.json({
      month,
      locked,
      status,
      manualOverride,
      finalStatus,
      source: manualOverride ? "manual_override" : "status",
    });
  } catch (error) {
    console.error("[getPlanningLock]", error);
    return NextResponse.json(
      { error: "Failed to fetch planning lock" },
      { status: 500 },
    );
  }
}

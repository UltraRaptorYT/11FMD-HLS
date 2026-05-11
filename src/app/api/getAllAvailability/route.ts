import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";

type DutyDay = {
  iso: string;
  enabled: boolean;
};

const SPREADSHEET_ID = process.env.SHEET_ID!;
const SHEET_NAME = "AVAILABILITY";

function getAuth() {
  const email = process.env.GOOGLE_SERVICE_EMAIL;
  const key = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!email || !key) {
    throw new Error("Missing Google service account env vars");
  }

  return new google.auth.JWT({
    email,
    key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
}

function normalizeBool(value: unknown) {
  return String(value).toUpperCase() === "TRUE";
}

export async function GET(req: NextRequest) {
  try {
    const name = req.nextUrl.searchParams.get("name")?.trim();

    if (!name) {
      return NextResponse.json({ error: "Missing name" }, { status: 400 });
    }

    const sheets = google.sheets({ version: "v4", auth: getAuth() });

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A:G`,
    });

    const rows = res.data.values ?? [];
    const [headers, ...dataRows] = rows;

    if (!headers) {
      return NextResponse.json({ months: {} });
    }

    const monthStartIdx = headers.indexOf("month_start");
    const dateIdx = headers.indexOf("date");
    const nameIdx = headers.indexOf("name");
    const availableIdx = headers.indexOf("available");

    if (
      monthStartIdx === -1 ||
      dateIdx === -1 ||
      nameIdx === -1 ||
      availableIdx === -1
    ) {
      return NextResponse.json(
        { error: "Missing required AVAILABILITY headers" },
        { status: 500 },
      );
    }

    const months: Record<string, Record<string, DutyDay>> = {};

    for (const row of dataRows) {
      const rowName = String(row[nameIdx] ?? "").trim();
      if (rowName !== name) continue;

      const monthStart = String(row[monthStartIdx] ?? "").trim();
      const date = String(row[dateIdx] ?? "").trim();
      const available = normalizeBool(row[availableIdx]);

      if (!monthStart || !date) continue;

      if (!months[monthStart]) months[monthStart] = {};

      months[monthStart][date] = {
        iso: date,
        enabled: available,
      };
    }

    return NextResponse.json({ months });
  } catch (error) {
    console.error("[getAllAvailability]", error);
    return NextResponse.json(
      { error: "Failed to fetch availability" },
      { status: 500 },
    );
  }
}

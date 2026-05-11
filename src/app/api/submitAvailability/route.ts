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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const name = String(body.name ?? "").trim();
    const monthStart = String(body.monthStart ?? "").trim();
    const availability = body.availability as Record<string, DutyDay>;

    if (!name || !monthStart || !availability) {
      return NextResponse.json(
        { error: "Missing name, monthStart, or availability" },
        { status: 400 },
      );
    }

    const sheets = google.sheets({ version: "v4", auth: getAuth() });

    const existingRes = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A:G`,
    });

    const rows = existingRes.data.values ?? [];
    const headers = rows[0] ?? [];

    const monthStartIdx = headers.indexOf("month_start");
    const dateIdx = headers.indexOf("date");
    const nameIdx = headers.indexOf("name");

    if (monthStartIdx === -1 || dateIdx === -1 || nameIdx === -1) {
      return NextResponse.json(
        { error: "Missing required AVAILABILITY headers" },
        { status: 500 },
      );
    }

    const now = new Date().toISOString();

    const existingRowMap = new Map<string, number>();

    rows.slice(1).forEach((row, i) => {
      const rowMonthStart = String(row[monthStartIdx] ?? "").trim();
      const rowDate = String(row[dateIdx] ?? "").trim();
      const rowName = String(row[nameIdx] ?? "").trim();

      if (!rowMonthStart || !rowDate || !rowName) return;

      existingRowMap.set(`${rowName}|${rowMonthStart}|${rowDate}`, i + 2);
    });

    const updates: Promise<unknown>[] = [];
    const appends: unknown[][] = [];

    for (const day of Object.values(availability)) {
      const date = day.iso;
      const existingRowNumber = existingRowMap.get(
        `${name}|${monthStart}|${date}`,
      );

      // B:G only. Column A is formula-generated.
      const rowValues = [
        monthStart,
        date,
        name,
        day.enabled ? "TRUE" : "FALSE",
        now,
        now,
      ];

      if (existingRowNumber) {
        updates.push(
          sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: `${SHEET_NAME}!B${existingRowNumber}:G${existingRowNumber}`,
            valueInputOption: "USER_ENTERED",
            requestBody: {
              values: [rowValues],
            },
          }),
        );
      } else {
        appends.push(rowValues);
      }
    }

    await Promise.all(updates);

    if (appends.length > 0) {
      await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET_NAME}!B:G`,
        valueInputOption: "USER_ENTERED",
        insertDataOption: "INSERT_ROWS",
        requestBody: {
          values: appends,
        },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[submitAvailability]", error);
    return NextResponse.json(
      { error: "Failed to submit availability" },
      { status: 500 },
    );
  }
}

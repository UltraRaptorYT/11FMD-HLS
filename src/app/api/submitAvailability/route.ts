import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";

type DutyDay = {
  iso: string;
  enabled: boolean;
};

type SubmitAvailabilityBody = {
  name: string;
  monthStart: string;
  availability: Record<string, DutyDay>;
};

const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_SERVICE_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  },
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

const sheets = google.sheets({ version: "v4", auth });

const SHEET_ID = process.env.HLS_SHEET_ID!;
const SHEET_NAME = process.env.HLS_SHEET_NAME!;

const WRITE_COLS_START = "B";
const WRITE_COLS_END = "G";

function keyOf(monthStart: string, date: string, name: string) {
  return `${monthStart}|${date}|${name}`;
}

async function appendRowsAtB(
  spreadsheetId: string,
  sheetName: string,
  rowsBtoG: (string | number | boolean)[][],
) {
  if (rowsBtoG.length === 0) return;

  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    ranges: [sheetName],
    includeGridData: false,
  });

  const sheet = meta.data.sheets?.find(
    (s) => s.properties?.title === sheetName,
  );

  if (sheet?.properties?.sheetId == null) {
    throw new Error(`Sheet not found: ${sheetName}`);
  }

  const sheetId = sheet.properties.sheetId;
  const currentRowCount = sheet.properties.gridProperties?.rowCount ?? 1000;

  const colB = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!B2:B`,
  });

  const values = colB.data.values ?? [];

  let lastUsedRow = 1;

  for (let i = values.length - 1; i >= 0; i--) {
    const cell = values[i]?.[0];
    if (cell !== undefined && String(cell).trim() !== "") {
      lastUsedRow = i + 2;
      break;
    }
  }

  const nextRow = lastUsedRow + 1;
  const neededLastRow = nextRow + rowsBtoG.length - 1;

  if (neededLastRow > currentRowCount) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            appendDimension: {
              sheetId,
              dimension: "ROWS",
              length: neededLastRow - currentRowCount,
            },
          },
        ],
      },
    });
  }

  const data = rowsBtoG.map((row, i) => ({
    range: `${sheetName}!B${nextRow + i}:G${nextRow + i}`,
    values: [row],
  }));

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: "USER_ENTERED",
      data,
    },
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as SubmitAvailabilityBody;

    const name = body.name?.trim();
    const monthStart = body.monthStart?.trim();
    const availability = body.availability;

    if (!name) {
      return NextResponse.json({ error: "Name is required." }, { status: 400 });
    }

    if (!monthStart) {
      return NextResponse.json(
        { error: "Month start is required." },
        { status: 400 },
      );
    }

    if (!availability || typeof availability !== "object") {
      return NextResponse.json(
        { error: "Availability is required." },
        { status: 400 },
      );
    }

    const now = new Date().toISOString();

    const desiredByKey = new Map<string, (string | number | boolean)[]>();

    for (const day of Object.values(availability)) {
      const row: (string | number | boolean)[] = [
        monthStart, // B
        day.iso, // C
        name, // D
        day.enabled, // E
        now, // F submitted_at
        now, // G updated_at
      ];

      desiredByKey.set(keyOf(monthStart, day.iso, name), row);
    }

    const readRes = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!B2:D`,
    });

    const existing = (readRes.data.values ?? []) as string[][];
    const rowByKey = new Map<string, number>();

    existing.forEach((r, idx) => {
      const ms = (r?.[0] ?? "").trim(); // B month_start
      const dt = (r?.[1] ?? "").trim(); // C date
      const nm = (r?.[2] ?? "").trim(); // D name

      if (!ms || !dt || !nm) return;

      rowByKey.set(keyOf(ms, dt, nm), idx + 2);
    });

    const updateRequests: {
      range: string;
      values: (string | number | boolean)[][];
    }[] = [];

    const appendValues: (string | number | boolean)[][] = [];

    for (const [key, rowValues] of desiredByKey.entries()) {
      const existingRowNumber = rowByKey.get(key);

      if (existingRowNumber != null) {
        updateRequests.push({
          range: `${SHEET_NAME}!${WRITE_COLS_START}${existingRowNumber}:${WRITE_COLS_END}${existingRowNumber}`,
          values: [rowValues],
        });
      } else {
        appendValues.push(rowValues);
      }
    }

    if (updateRequests.length > 0) {
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: SHEET_ID,
        requestBody: {
          valueInputOption: "USER_ENTERED",
          data: updateRequests,
        },
      });
    }

    if (appendValues.length > 0) {
      await appendRowsAtB(SHEET_ID, SHEET_NAME, appendValues);
    }

    return NextResponse.json({
      ok: true,
      name,
      monthStart,
      updated: updateRequests.length,
      appended: appendValues.length,
      totalWritten: updateRequests.length + appendValues.length,
    });
  } catch (error) {
    console.error("[submitAvailability] error:", error);

    return NextResponse.json(
      { error: "Failed to submit availability." },
      { status: 500 },
    );
  }
}

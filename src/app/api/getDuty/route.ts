import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";

const SPREADSHEET_ID = process.env.SHEET_ID!;

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

function normaliseName(v: string) {
  return v.trim().replace(/\s+/g, " ").toUpperCase();
}

function toISODateLocal(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseSheetDate(value: string) {
  const cleaned = String(value ?? "").trim();

  // Handles headers like: 1 Jun 2026
  const match = cleaned.match(/^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})$/);
  if (!match) return null;

  const [, dayStr, monthStr, yearStr] = match;

  const monthMap: Record<string, number> = {
    jan: 0,
    january: 0,
    feb: 1,
    february: 1,
    mar: 2,
    march: 2,
    apr: 3,
    april: 3,
    may: 4,
    jun: 5,
    june: 5,
    jul: 6,
    july: 6,
    aug: 7,
    august: 7,
    sep: 8,
    sept: 8,
    september: 8,
    oct: 9,
    october: 9,
    nov: 10,
    november: 10,
    dec: 11,
    december: 11,
  };

  const month = monthMap[monthStr.toLowerCase()];
  if (month === undefined) return null;

  const date = new Date(Number(yearStr), month, Number(dayStr));
  return toISODateLocal(date);
}

export async function GET(req: NextRequest) {
  try {
    const name = req.nextUrl.searchParams.get("name")?.trim();
    const sheetName = req.nextUrl.searchParams.get("sheetName")?.trim();

    if (!name) {
      return NextResponse.json({ error: "Missing name" }, { status: 400 });
    }

    if (!sheetName) {
      return NextResponse.json({ error: "Missing sheetName" }, { status: 400 });
    }

    const sheets = google.sheets({ version: "v4", auth: getAuth() });

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `'${sheetName}'!A:ZZ`,
    });

    const rows = res.data.values ?? [];

    if (rows.length === 0) {
      return NextResponse.json({
        sheetName,
        duties: [],
      });
    }

    // row 3 = date labels
    // col A = names / section labels
    const dateHeaderRow = rows[2] ?? [];
    const targetName = normaliseName(name);

    const nameRowIndex = rows.findIndex((row, index) => {
      if (index < 3) return false;
      return normaliseName(String(row[0] ?? "")) === targetName;
    });

    if (nameRowIndex === -1) {
      return NextResponse.json({
        sheetName,
        duties: [],
        warning: "Name not found in sheet",
      });
    }

    const nameRow = rows[nameRowIndex];

    const duties: { iso: string; label: string }[] = [];

    for (let col = 1; col < nameRow.length; col++) {
      const cell = String(nameRow[col] ?? "")
        .trim()
        .toLowerCase();

      if (cell !== "x") continue;

      const dateLabel = String(dateHeaderRow[col] ?? "").trim();
      const iso = parseSheetDate(dateLabel);

      if (!iso) continue;

      const [y, m, d] = iso.split("-").map(Number);
      const localDate = new Date(y, m - 1, d);

      duties.push({
        iso,
        label: localDate.toLocaleDateString("en-GB", {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
        }),
      });
    }

    return NextResponse.json({
      sheetName,
      duties,
    });
  } catch (error) {
    console.error("[getDuty]", error);
    return NextResponse.json(
      { error: "Failed to fetch duties" },
      { status: 500 },
    );
  }
}

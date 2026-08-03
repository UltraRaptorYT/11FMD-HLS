import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";

const SPREADSHEET_ID = process.env.SHEET_ID!;

const SECTION_HEADINGS = [
  "SUPERVISING",
  "CONDUCTING",
  "SAFETY",
  "LOGS IC",
  "LOGS TEAM",
] as const;

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

function toISODateLocal(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseSheetDate(value: string) {
  const cleaned = String(value ?? "").trim();

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

  return toISODateLocal(new Date(Number(yearStr), month, Number(dayStr)));
}

function isSectionHeading(row: unknown[]) {
  const name = String(row[0] ?? "")
    .trim()
    .toUpperCase();
  return SECTION_HEADINGS.includes(name as never);
}

export async function GET(req: NextRequest) {
  try {
    const sheetName = req.nextUrl.searchParams.get("sheetName")?.trim();

    if (!sheetName) {
      return NextResponse.json({ error: "Missing sheetName" }, { status: 400 });
    }

    const sheets = google.sheets({ version: "v4", auth: getAuth() });

    const [res, meta] = await Promise.all([
      sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `'${sheetName}'!A:ZZ`,
      }),
      sheets.spreadsheets.get({
        spreadsheetId: SPREADSHEET_ID,
        ranges: [`'${sheetName}'!A1:ZZ3`],
        includeGridData: false,
      }),
    ]);

    const rows = res.data.values ?? [];
    const dateHeaderRow = rows[2] ?? [];
    const monthSheet = meta.data.sheets?.find(
      (sheet) => sheet.properties?.title === sheetName,
    );
    const dutySectionByColumn = new Map<number, string>();

    for (let col = 1; col < dateHeaderRow.length; col++) {
      const directValue = String(rows[1]?.[col] ?? "").trim();
      const merge = monthSheet?.merges?.find(
        (range) =>
          (range.startRowIndex ?? 0) <= 1 &&
          (range.endRowIndex ?? 0) > 1 &&
          (range.startColumnIndex ?? 0) <= col &&
          (range.endColumnIndex ?? 0) > col,
      );
      const mergedValue = merge
        ? String(rows[1]?.[merge.startColumnIndex ?? col] ?? "").trim()
        : "";
      dutySectionByColumn.set(col, directValue || mergedValue);
    }

    const dates = dateHeaderRow
      .map((value, col) => {
        if (col === 0) return null;

        const iso = parseSheetDate(String(value ?? ""));
        if (!iso) return null;

        return {
          iso,
          label: String(value ?? "").trim(),
          dutySection: dutySectionByColumn.get(col) ?? "",
          col,
        };
      })
      .filter(Boolean) as {
      iso: string;
      label: string;
      dutySection: string;
      col: number;
    }[];

    const dutiesByDate: Record<
      string,
      {
        iso: string;
        label: string;
        dutySection: string;
        sections: { title: string; names: string[] }[];
      }
    > = {};

    for (const date of dates) {
      const sections: { title: string; names: string[] }[] = [];
      let currentSection: { title: string; names: string[] } | null = null;

      for (let r = 3; r < rows.length; r++) {
        const row = rows[r];
        const colA = String(row[0] ?? "").trim();

        if (!colA) continue;

        if (isSectionHeading(row)) {
          currentSection = {
            title: colA.toUpperCase(),
            names: [],
          };
          sections.push(currentSection);
          continue;
        }

        if (!currentSection) continue;

        const dutyCell = String(row[date.col] ?? "")
          .trim()
          .toLowerCase();

        if (dutyCell === "x") {
          currentSection.names.push(colA);
        }
      }

      dutiesByDate[date.iso] = {
        iso: date.iso,
        label: date.label,
        dutySection: date.dutySection,
        sections,
      };
    }

    return NextResponse.json({
      sheetName,
      dates,
      dutiesByDate,
    });
  } catch (error) {
    console.error("[getDutyAdmin]", error);
    return NextResponse.json(
      { error: "Failed to fetch admin duties" },
      { status: 500 },
    );
  }
}

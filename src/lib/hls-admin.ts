import { google } from "googleapis";

export const DUTY_SECTIONS = [
  "SUPERVISING",
  "CONDUCTING",
  "SAFETY",
  "LOGS IC",
  "LOGS TEAM",
] as const;

export type DutySection = (typeof DUTY_SECTIONS)[number];

export type MonthOption = {
  value: string;
  label: string;
  start: string;
};

export type PersonOption = {
  name: string;
  available: boolean;
  assigned: boolean;
  reason: string | null;
};

export type AdminMonthData = {
  month: string;
  dates: { iso: string; label: string; dutySection: string }[];
  selectedDate: string;
  selectedDutySection: string;
  sections: Record<DutySection, PersonOption[]>;
  groups: { name: string; people: string[] }[];
};

const MONTH_NAMES = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
] as const;

const RANK_PREFIX =
  /^(ME[1-8]|REC|PTE|LCP|CPL|CFC|3SG|2SG|1SG|SSG|MSG|2WO|1WO|MWO|SWO|2LT|LTA|CPT|MAJ|LTC|COL)\s+/i;

function getSheetsClient() {
  const email = process.env.GOOGLE_SERVICE_EMAIL;
  const key = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!email || !key || !process.env.SHEET_ID) {
    throw new Error("Missing Google Sheets environment variables");
  }

  const auth = new google.auth.GoogleAuth({
    credentials: { client_email: email, private_key: key },
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  return google.sheets({ version: "v4", auth });
}

function escapeSheetTitle(title: string) {
  return title.replace(/'/g, "''");
}

function sheetRange(title: string, range: string) {
  return `'${escapeSheetTitle(title)}'!${range}`;
}

function parseMonthTitle(title: string) {
  const match = title.trim().match(/^([A-Za-z]{3})\s+(\d{4})$/);
  if (!match) return null;

  const month = MONTH_NAMES.indexOf(match[1].toUpperCase() as never);
  const year = Number(match[2]);
  if (month < 0 || year < 2000 || year > 2200) return null;

  return { month, year, timestamp: Date.UTC(year, month, 1) };
}

export function toMonthSheetName(monthStart: string) {
  const match = monthStart.match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  if (year < 2000 || year > 2200 || month < 0 || month > 11) return null;

  return `${MONTH_NAMES[month]} ${year}`;
}

function monthLabel(year: number, month: number) {
  const shortMonth = `${MONTH_NAMES[month][0]}${MONTH_NAMES[month]
    .slice(1)
    .toLowerCase()}`;
  return `${shortMonth} ${year}`;
}

function toISODate(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseSheetDate(value: unknown) {
  const cleaned = String(value ?? "").trim();
  const match = cleaned.match(/^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})$/);
  if (!match) return null;

  const monthLookup: Record<string, number> = {
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

  const month = monthLookup[match[2].toLowerCase()];
  if (month === undefined) return null;

  return toISODate(Number(match[3]), month, Number(match[1]));
}

function cleanName(name: string) {
  return name.replace(RANK_PREFIX, "").trim();
}

function normaliseGroupName(title: string) {
  return title.replace(/\s+\[(AUTO|MANUAL)\]\s*$/i, "").trim();
}

function fullName(row: unknown[]) {
  return [row[0], row[1]]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .join(" ");
}

function columnLetter(index: number) {
  let value = index + 1;
  let result = "";

  while (value > 0) {
    const remainder = (value - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    value = Math.floor((value - 1) / 26);
  }

  return result;
}

export async function listMonthSheets(): Promise<MonthOption[]> {
  const sheets = getSheetsClient();
  const meta = await sheets.spreadsheets.get({
    spreadsheetId: process.env.SHEET_ID!,
    includeGridData: false,
  });

  return (meta.data.sheets ?? [])
    .map((sheet) => {
      const title = sheet.properties?.title ?? "";
      const parsed = parseMonthTitle(title);
      if (!parsed) return null;

      return {
        value: title.toUpperCase(),
        label: monthLabel(parsed.year, parsed.month),
        start: toISODate(parsed.year, parsed.month, 1),
        timestamp: parsed.timestamp,
      };
    })
    .filter(
      (month): month is MonthOption & { timestamp: number } => month !== null,
    )
    .sort((a, b) => b.timestamp - a.timestamp)
    .map(({ value, label, start }) => ({ value, label, start })) as MonthOption[];
}

export async function createMonthSheet(monthStart: string) {
  const newSheetName = toMonthSheetName(monthStart);
  if (!newSheetName) throw new Error("Invalid month");
  const [year, month] = monthStart.split("-").map(Number);

  const sheets = getSheetsClient();
  const spreadsheetId = process.env.SHEET_ID!;
  const templateName =
    process.env.TEMPLATE_SHEET_NAME?.trim() || "TEMPLATE - MAKE A COPY";
  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    includeGridData: false,
  });

  const existing = meta.data.sheets?.find(
    (sheet) => sheet.properties?.title?.toUpperCase() === newSheetName,
  );
  if (existing) {
    const error = new Error(`${newSheetName} already exists`);
    error.name = "MonthExistsError";
    throw error;
  }

  const template = meta.data.sheets?.find(
    (sheet) => sheet.properties?.title === templateName,
  );
  const templateSheetId = template?.properties?.sheetId;
  if (templateSheetId == null) throw new Error(`Template not found: ${templateName}`);

  const templateColumn = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: sheetRange(templateName, "A:A"),
    valueRenderOption: "UNFORMATTED_VALUE",
  });
  const columnValues = templateColumn.data.values ?? [];

  const duplicate = await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          duplicateSheet: {
            sourceSheetId: templateSheetId,
            newSheetName,
            insertSheetIndex: template?.properties?.index ?? 0,
          },
        },
      ],
    },
  });

  const newSheetId =
    duplicate.data.replies?.[0]?.duplicateSheet?.properties?.sheetId;

  try {
    if (columnValues.length > 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: sheetRange(newSheetName, `A1:A${columnValues.length}`),
        valueInputOption: "RAW",
        requestBody: { values: columnValues },
      });
    }

    const serial = Math.floor(Date.UTC(year, month - 1, 1) / 86_400_000) + 25569;

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: sheetRange(newSheetName, "A2"),
      valueInputOption: "RAW",
      requestBody: { values: [[serial]] },
    });
  } catch (error) {
    if (newSheetId != null) {
      await sheets.spreadsheets
        .batchUpdate({
          spreadsheetId,
          requestBody: { requests: [{ deleteSheet: { sheetId: newSheetId } }] },
        })
        .catch(() => undefined);
    }
    throw error;
  }

  return {
    value: newSheetName,
    label: monthLabel(year, month - 1),
    start: `${monthStart}-01`,
  } satisfies MonthOption;
}

type LoadedMonth = {
  data: AdminMonthData;
  rows: unknown[][];
  dateColumn: number;
  dutySectionColumn: number;
  rowSections: Map<number, DutySection>;
};

async function loadMonth(month: string, requestedDate?: string): Promise<LoadedMonth> {
  const monthTitle = month.trim().toUpperCase();
  if (!parseMonthTitle(monthTitle)) throw new Error("Invalid month sheet");

  const sheets = getSheetsClient();
  const spreadsheetId = process.env.SHEET_ID!;
  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    includeGridData: false,
  });
  const monthSheet = meta.data.sheets?.find(
    (sheet) => sheet.properties?.title?.toUpperCase() === monthTitle,
  );
  if (!monthSheet) throw new Error("Month sheet not found");

  const namelistName = process.env.NAMELIST_SHEET_NAME?.trim() || "NAMELIST";
  const availabilityName =
    process.env.AVAILABILITY_SHEET_NAME?.trim() || "AVAILABILITY";
  const reserved = new Set([
    namelistName.toUpperCase(),
    availabilityName.toUpperCase(),
    "CONFIG",
    "LEGENDS",
    ...DUTY_SECTIONS,
  ]);

  const possibleGroupSheets = (meta.data.sheets ?? []).filter((sheet) => {
    const title = sheet.properties?.title ?? "";
    return (
      !sheet.properties?.hidden &&
      !parseMonthTitle(title) &&
      !reserved.has(title.toUpperCase()) &&
      !/^TEMPLATE\b/i.test(title)
    );
  });

  const ranges = [
    sheetRange(monthTitle, "A:ZZ"),
    sheetRange(namelistName, "B:D"),
    sheetRange(availabilityName, "C:E"),
    ...possibleGroupSheets.map((sheet) =>
      sheetRange(sheet.properties?.title ?? "", "A:D"),
    ),
  ];
  const values = await sheets.spreadsheets.values.batchGet({
    spreadsheetId,
    ranges,
    valueRenderOption: "FORMATTED_VALUE",
    dateTimeRenderOption: "FORMATTED_STRING",
  });
  const valueRanges = values.data.valueRanges ?? [];
  const rows = (valueRanges[0]?.values ?? []) as unknown[][];
  const namelistRows = (valueRanges[1]?.values ?? []) as unknown[][];
  const availabilityRows = (valueRanges[2]?.values ?? []) as unknown[][];

  const dutySectionByColumn = new Map<number, string>();
  for (let column = 1; column < (rows[2] ?? []).length; column++) {
    const directValue = String(rows[1]?.[column] ?? "").trim();
    const merge = monthSheet.merges?.find(
      (range) =>
        (range.startRowIndex ?? 0) <= 1 &&
        (range.endRowIndex ?? 0) > 1 &&
        (range.startColumnIndex ?? 0) <= column &&
        (range.endColumnIndex ?? 0) > column,
    );
    const mergedValue = merge
      ? String(rows[1]?.[merge.startColumnIndex ?? column] ?? "").trim()
      : "";
    dutySectionByColumn.set(column, directValue || mergedValue);
  }

  const dates = (rows[2] ?? [])
    .map((value, column) => {
      if (column === 0) return null;
      const iso = parseSheetDate(value);
      if (!iso) return null;
      return {
        iso,
        label: String(value),
        dutySection: dutySectionByColumn.get(column) ?? "",
        column,
      };
    })
    .filter(Boolean) as {
    iso: string;
    label: string;
    dutySection: string;
    column: number;
  }[];
  if (dates.length === 0) throw new Error("No duty dates found in month sheet");

  const selectedDate =
    dates.find((date) => date.iso === requestedDate)?.iso ?? dates[0].iso;
  const dateColumn = dates.find((date) => date.iso === selectedDate)!.column;
  const dutySectionColumn =
    monthSheet.merges?.find(
      (merge) =>
        (merge.startRowIndex ?? 0) <= 1 &&
        (merge.endRowIndex ?? 0) > 1 &&
        (merge.startColumnIndex ?? 0) <= dateColumn &&
        (merge.endColumnIndex ?? 0) > dateColumn,
    )?.startColumnIndex ?? dateColumn;

  const attachedOut = new Set(
    namelistRows
      .filter((row) => String(row[2] ?? "").trim())
      .map((row) => String(row[0] ?? "").trim().toUpperCase()),
  );
  const unavailable = new Set(
    availabilityRows
      .filter(
        (row) =>
          String(row[0] ?? "").trim() === selectedDate &&
          String(row[2] ?? "").trim().toUpperCase() === "FALSE",
      )
      .map((row) => String(row[1] ?? "").trim()),
  );

  const emptySections: Record<DutySection, PersonOption[]> = {
    SUPERVISING: [],
    CONDUCTING: [],
    SAFETY: [],
    "LOGS IC": [],
    "LOGS TEAM": [],
  };
  const rowSections = new Map<number, DutySection>();
  let currentSection: DutySection | null = null;

  for (let rowIndex = 3; rowIndex < rows.length; rowIndex++) {
    const name = String(rows[rowIndex]?.[0] ?? "").trim();
    if (!name) continue;

    const heading = name.toUpperCase() as DutySection;
    if (DUTY_SECTIONS.includes(heading)) {
      currentSection = heading;
      continue;
    }
    if (!currentSection) continue;

    const isUnavailable = unavailable.has(name);
    const isAttachedOut = attachedOut.has(cleanName(name).toUpperCase());
    const assigned = String(rows[rowIndex]?.[dateColumn] ?? "")
      .trim()
      .toLowerCase() === "x";
    const reason = isAttachedOut
      ? "Attached out"
      : isUnavailable
        ? "Marked unavailable"
        : null;

    emptySections[currentSection].push({
      name,
      available: !reason,
      assigned,
      reason,
    });
    rowSections.set(rowIndex, currentSection);
  }

  const logsCandidates = new Set(
    emptySections["LOGS TEAM"].map((person) => person.name),
  );
  const groups = new Map<string, Set<string>>();

  possibleGroupSheets.forEach((sheet, index) => {
    const groupRows = (valueRanges[index + 3]?.values ?? []) as unknown[][];
    const headers = groupRows[0] ?? [];
    if (
      String(headers[0] ?? "").trim().toUpperCase() !== "RANK" ||
      String(headers[1] ?? "").trim().toUpperCase() !== "NAME" ||
      String(headers[2] ?? "").trim().toUpperCase() !== "ROLE"
    ) {
      return;
    }

    const groupName = normaliseGroupName(sheet.properties?.title ?? "");
    const people = groups.get(groupName) ?? new Set<string>();
    groupRows.slice(1).forEach((row) => {
      if (String(row[2] ?? "").trim().toUpperCase() !== "LOGS TEAM") return;
      const name = fullName(row);
      if (logsCandidates.has(name)) people.add(name);
    });
    if (people.size > 0) groups.set(groupName, people);
  });

  const groupedNames = new Set([...groups.values()].flatMap((group) => [...group]));
  const ungrouped = [...logsCandidates].filter((name) => !groupedNames.has(name));
  if (ungrouped.length > 0) groups.set("Unassigned", new Set(ungrouped));

  return {
    data: {
      month: monthTitle,
      dates: dates.map(({ iso, label, dutySection }) => ({
        iso,
        label,
        dutySection,
      })),
      selectedDate,
      selectedDutySection:
        dates.find((date) => date.iso === selectedDate)?.dutySection ?? "",
      sections: emptySections,
      groups: [...groups.entries()]
        .map(([name, people]) => ({ name, people: [...people].sort() }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    },
    rows,
    dateColumn,
    dutySectionColumn,
    rowSections,
  };
}

export async function getAdminMonthData(month: string, date?: string) {
  return (await loadMonth(month, date)).data;
}

export async function saveAssignments(
  month: string,
  date: string,
  dutySection: string,
  assignments: Record<DutySection, string[]>,
) {
  const loaded = await loadMonth(month, date);
  if (loaded.data.selectedDate !== date) throw new Error("Duty date not found");
  if (!loaded.data.groups.some((group) => group.name === dutySection)) {
    throw new Error("Select a valid duty section");
  }

  for (const section of DUTY_SECTIONS) {
    const selected = assignments[section] ?? [];
    const requiredCount = section === "LOGS TEAM" ? 1 : 1;
    if (selected.length < requiredCount || (section !== "LOGS TEAM" && selected.length !== 1)) {
      throw new Error(
        section === "LOGS TEAM"
          ? "Select at least one logs team member"
          : `Select one person for ${section}`,
      );
    }

    const candidates = new Map(
      loaded.data.sections[section].map((person) => [person.name, person]),
    );
    for (const name of selected) {
      const person = candidates.get(name);
      if (!person) throw new Error(`${name} is not in ${section}`);
      if (!person.available && !person.assigned) {
        throw new Error(`${name} is unavailable for this date`);
      }
    }
  }

  const selectedBySection = new Map(
    DUTY_SECTIONS.map((section) => [section, new Set(assignments[section])]),
  );
  const firstDutyRow = Math.min(...loaded.rowSections.keys());
  const lastDutyRow = Math.max(...loaded.rowSections.keys());
  const output: string[][] = [];

  for (let rowIndex = firstDutyRow; rowIndex <= lastDutyRow; rowIndex++) {
    const section = loaded.rowSections.get(rowIndex);
    if (!section) {
      output.push([String(loaded.rows[rowIndex]?.[loaded.dateColumn] ?? "")]);
      continue;
    }

    const name = String(loaded.rows[rowIndex]?.[0] ?? "").trim();
    output.push([selectedBySection.get(section)!.has(name) ? "X" : ""]);
  }

  const column = columnLetter(loaded.dateColumn);
  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: process.env.SHEET_ID!,
    requestBody: {
      valueInputOption: "RAW",
      data: [
        {
          range: sheetRange(
            month.toUpperCase(),
            `${column}${firstDutyRow + 1}:${column}${lastDutyRow + 1}`,
          ),
          values: output,
        },
        {
          range: sheetRange(
            month.toUpperCase(),
            `${columnLetter(loaded.dutySectionColumn)}2`,
          ),
          values: [[dutySection]],
        },
      ],
    },
  });

  return { ok: true, month: month.toUpperCase(), date, dutySection };
}

export async function clearAssignments(month: string, date: string) {
  const loaded = await loadMonth(month, date);
  if (loaded.data.selectedDate !== date) throw new Error("Duty date not found");

  const firstDutyRow = Math.min(...loaded.rowSections.keys());
  const lastDutyRow = Math.max(...loaded.rowSections.keys());
  const output: string[][] = [];

  for (let rowIndex = firstDutyRow; rowIndex <= lastDutyRow; rowIndex++) {
    output.push([
      loaded.rowSections.has(rowIndex)
        ? ""
        : String(loaded.rows[rowIndex]?.[loaded.dateColumn] ?? ""),
    ]);
  }

  const column = columnLetter(loaded.dateColumn);
  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: process.env.SHEET_ID!,
    requestBody: {
      valueInputOption: "RAW",
      data: [
        {
          range: sheetRange(
            month.toUpperCase(),
            `${column}${firstDutyRow + 1}:${column}${lastDutyRow + 1}`,
          ),
          values: output,
        },
        {
          range: sheetRange(
            month.toUpperCase(),
            `${columnLetter(loaded.dutySectionColumn)}2`,
          ),
          values: [[""]],
        },
      ],
    },
  });

  return { ok: true, month: month.toUpperCase(), date };
}

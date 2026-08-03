import "server-only";
import { google } from "googleapis";

type CacheEntry = {
  value: string[][];
  expiresAt: number;
};

const cache = new Map<string, CacheEntry>();
const TTL_MS = 60_000;

function getSheetsClient() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  return google.sheets({ version: "v4", auth });
}

export async function getUserRows(forceReload = false) {
  const spreadsheetId = process.env.SHEET_ID;
  const sheetName = process.env.NAMELIST_SHEET_NAME;

  if (!spreadsheetId || !sheetName) {
    throw new Error("Missing user-list environment variables");
  }

  const cacheKey = `${spreadsheetId}:${sheetName}:A2:B`;
  const cached = cache.get(cacheKey);

  if (!forceReload && cached && Date.now() < cached.expiresAt) {
    return { source: "cache", rows: cached.value };
  }

  const response = await getSheetsClient().spreadsheets.values.get({
    spreadsheetId,
    range: `'${sheetName.replace(/'/g, "''")}'!A2:B`,
  });
  const rows = (response.data.values ?? []) as string[][];

  cache.set(cacheKey, {
    value: rows,
    expiresAt: Date.now() + TTL_MS,
  });

  return { source: forceReload ? "api_forced" : "api", rows };
}

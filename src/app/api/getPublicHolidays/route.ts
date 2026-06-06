import { NextRequest, NextResponse } from "next/server";

type PublicHolidayRecord = {
  date?: string;
  holiday?: string;
};

type DataGovResponse = {
  success?: boolean;
  result?: {
    records?: PublicHolidayRecord[];
  };
};

const DATASET_ID = "d_8ef23381f9417e4d4254ee8b4dcdb176";
const DATASET_URL = `https://data.gov.sg/api/action/datastore_search?resource_id=${DATASET_ID}&limit=500`;
const TTL_MS = 24 * 60 * 60 * 1000;

type CacheEntry = {
  value: Record<string, string>;
  expiresAt: number;
};

const cache = new Map<string, CacheEntry>();

function addDaysISO(iso: string, days: number) {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

function getISODayOfWeek(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export async function GET(req: NextRequest) {
  try {
    const year = req.nextUrl.searchParams.get("year")?.trim();

    if (!year || !/^\d{4}$/.test(year)) {
      return NextResponse.json({ error: "Missing year" }, { status: 400 });
    }

    const cached = cache.get(year);
    if (cached && Date.now() < cached.expiresAt) {
      return NextResponse.json({ holidays: cached.value, source: "cache" });
    }

    const res = await fetch(DATASET_URL, {
      next: { revalidate: 24 * 60 * 60 },
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: "Failed to fetch public holidays" },
        { status: 502 },
      );
    }

    const data = (await res.json()) as DataGovResponse;
    const records = data.result?.records ?? [];
    const holidays: Record<string, string> = {};

    for (const record of records) {
      const date = record.date?.trim();
      if (!date?.startsWith(`${year}-`)) continue;

      const holidayName = record.holiday?.trim() || "Public Holiday";
      holidays[date] = holidayName;

      if (getISODayOfWeek(date) === 0) {
        const observedDate = addDaysISO(date, 1);
        if (observedDate.startsWith(`${year}-`)) {
          holidays[observedDate] = `${holidayName} (observed)`;
        }
      }
    }

    cache.set(year, {
      value: holidays,
      expiresAt: Date.now() + TTL_MS,
    });

    return NextResponse.json({ holidays, source: "data.gov.sg" });
  } catch (error) {
    console.error("[getPublicHolidays]", error);
    return NextResponse.json(
      { error: "Failed to fetch public holidays" },
      { status: 500 },
    );
  }
}

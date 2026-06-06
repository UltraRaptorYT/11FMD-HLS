"use client";

import { useState, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { addMonths } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

function formatDutyDateLong(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);

  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatDutyDateShort(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);

  const day = String(date.getDate()).padStart(2, "0");
  const month = date.toLocaleDateString("en-GB", { month: "long" });
  const year = String(date.getFullYear()).slice(-2);

  return `${day} ${month} ${year}`;
}

function getWeekdayLabel(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);

  return date.toLocaleDateString("en-GB", { weekday: "long" }).toUpperCase();
}

function getShortWeekday(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);

  return date.toLocaleDateString("en-GB", { weekday: "short" });
}

function getSectionName(
  sections: { title: string; names: string[] }[],
  title: string,
) {
  return (
    sections.find((s) => s.title.toUpperCase() === title.toUpperCase())
      ?.names?.[0] ?? ""
  );
}

function getSectionNames(
  sections: { title: string; names: string[] }[],
  title: string,
) {
  return (
    sections.find((s) => s.title.toUpperCase() === title.toUpperCase())
      ?.names ?? []
  );
}

function formatList(names: string[]) {
  if (names.length === 0) return "1. -";

  return names.map((name, index) => `${index + 1}. ${name}`).join("\n");
}

function buildHlsMessage({
  selectedDate,
  sections,
}: {
  selectedDate: string;
  sections: { title: string; names: string[] }[];
}) {
  const weekday = getWeekdayLabel(selectedDate);
  const shortWeekday = getShortWeekday(selectedDate);

  const supervising = getSectionName(sections, "SUPERVISING") || "-";
  const conducting = getSectionName(sections, "CONDUCTING") || "-";
  const safety = getSectionName(sections, "SAFETY") || "-";
  const logsIc = getSectionName(sections, "LOGS IC") || "-";
  const logsTeam = getSectionNames(sections, "LOGS TEAM");

  if (weekday === "MONDAY") {
    return `*HLS Conduct - IPPT Training/Games Day*

1) Personnel who've yet to achieve IPPT requirements:

A. Static Exercises

i. 15 counts of 4x Push-ups shoulder taps
ii. 40 Seconds of hollow body rock
iii. 15 counts of 4x squats
iv. 15 x pushups

b. 2.4KM run (6x400m)

2) Personnel who do not belong to Category 1)

B. Games
i. Frisbee
ii. Badminton
iii. Basketball
iv. Captain ball

*(All are to attend unless you have a valid reason)*

Date: *${formatDutyDateLong(selectedDate)} (${shortWeekday})*

Time : *0800hrs to 0915hrs*

*Conducting Body*

Supervising officer: *${supervising}*

Conducting officer: *${conducting}*

Safety officer: *${safety}*

Logistics IC: *${logsIc}*

Logs Party:
*(Logs party to meet at HLS store room by 7.30 am)*

${formatList(logsTeam)}

Location: *ABGTC Stadium* ELISS Blk 106 (Behind the Grand Stand nearer to MSVS)

The respective platoon POCs, please gather your guys at *0750hrs* and report your attendance to the conducting officer by *0800hrs.*

*Please conduct a water parade & bring along an SAF-ISSUED water bottle and thermometer.*

Attire: *Blue CSSCOM PT attire with a running shoe and white/grey socks*`;
  }

  return `Please disseminate.

*Battalion HLS Conduct for ${shortWeekday}, ${formatDutyDateShort(selectedDate)}*

1) Static Exercise (2 sets)

1. 15 X Diamond Push-ups
2. 15 counts of 4 Russian Twist
3. 40 Seconds of Single Leg Glute Bridge (Switch leg between sets)
4. 15 X Wide Arm Push-ups
5. 40 Seconds of side plank with twist (Switch side between sets)
6. 40 Seconds of Burpees

2) *3.0KM* / PX for non-runners

*(All are to attend unless you have a valid reason)*

Date: *${formatDutyDateShort(selectedDate)}*

Time : *0745hrs to 0915hrs*

*Conducting body*

Supervising officer: *${supervising}*

Conducting officer: *${conducting}*

Safety officer: *${safety}*

Logistics IC: *${logsIc}*

Logistics and Marshallers:

${formatList(logsTeam)}

Location: *Blk 210*

The respective platoon POCs, please gather your guys at *0745hrs* and report your attendance to the conducting officer by *0800hrs*.

*Please conduct a water parade & bring along an SAF issued water bottle and thermometer.*

Attire: *Blue CSSCOM PT attire with running shoes and white/grey socks*`;
}

function getPlanningMonth(today: Date) {
  // Before 20th: plan next month
  // From 20th onwards: plan following month
  const offset = today.getDate() >= 20 ? 2 : 1;
  return new Date(today.getFullYear(), today.getMonth() + offset, 1);
}

type AdminSection = {
  title: string;
  names: string[];
};

type AdminDutyDate = {
  iso: string;
  label: string;
  col: number;
};

type AdminDutyByDate = Record<
  string,
  {
    iso: string;
    label: string;
    sections: AdminSection[];
  }
>;

async function fetchPublicHolidayDates(year: string) {
  try {
    const res = await fetch(
      `/api/getPublicHolidays?${new URLSearchParams({ year })}`,
    );

    if (!res.ok) {
      console.error(`[AdminDutyView] getPublicHolidays ${res.status}`);
      return new Set<string>();
    }

    const data = await res.json();
    return new Set<string>(Object.keys(data.holidays ?? {}));
  } catch (e) {
    console.error("[AdminDutyView] getPublicHolidays error:", e);
    return new Set<string>();
  }
}

function toPlanningMonthSheetName(date: Date) {
  return date
    .toLocaleDateString("en-GB", {
      month: "short",
      year: "numeric",
    })
    .toUpperCase();
}

function buildPlanningMonthOptions(baseDate: Date) {
  return Array.from({ length: 6 }).map((_, i) => {
    const date = addMonths(baseDate, i - 2);

    return {
      value: toPlanningMonthSheetName(date),
      label: date.toLocaleDateString("en-GB", {
        month: "long",
        year: "numeric",
      }),
    };
  });
}

export default function AdminDutyView({
  selectedMonth,
  setSelectedMonth,
  selectedDate,
  setSelectedDate,
}: {
  selectedMonth: string;
  setSelectedMonth: (value: string) => void;
  selectedDate: string;
  setSelectedDate: (value: string) => void;
}) {
  const today = useMemo(() => new Date(), []);
  const defaultPlanningMonth = useMemo(() => getPlanningMonth(today), [today]);

  const monthOptions = useMemo(
    () => buildPlanningMonthOptions(defaultPlanningMonth),
    [defaultPlanningMonth],
  );

  const [dates, setDates] = useState<AdminDutyDate[]>([]);
  const [dutiesByDate, setDutiesByDate] = useState<AdminDutyByDate>({});
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function fetchMonthDuties() {
      setIsLoading(true);

      try {
        const res = await fetch(
          `/api/getDutyAdmin?${new URLSearchParams({
            sheetName: selectedMonth,
          })}`,
        );

        if (!res.ok) {
          console.error(`[AdminDutyView] getDutyAdmin ${res.status}`);
          setDates([]);
          setDutiesByDate({});
          setSelectedDate("");
          return;
        }

        const data = await res.json();

        const nextDates = data.dates ?? [];
        const nextDutiesByDate = data.dutiesByDate ?? {};
        const year = nextDates[0]?.iso?.slice(0, 4);
        const publicHolidayDates = year
          ? await fetchPublicHolidayDates(year)
          : new Set<string>();
        const visibleDates = nextDates.filter(
          (date: AdminDutyDate) => !publicHolidayDates.has(date.iso),
        );
        const visibleDutiesByDate = Object.fromEntries(
          Object.entries(nextDutiesByDate).filter(
            ([iso]) => !publicHolidayDates.has(iso),
          ),
        ) as AdminDutyByDate;

        if (!cancelled) {
          setDates(visibleDates);
          setDutiesByDate(visibleDutiesByDate);
          if (!selectedDate || !visibleDutiesByDate[selectedDate]) {
            setSelectedDate(visibleDates[0]?.iso ?? "");
          }
        }
      } catch (e) {
        console.error("[AdminDutyView] fetch error:", e);
        setDates([]);
        setDutiesByDate({});
        setSelectedDate("");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    fetchMonthDuties();

    return () => {
      cancelled = true;
    };
  }, [selectedMonth]);

  const selectedDuty = selectedDate ? dutiesByDate[selectedDate] : null;
  const sections = selectedDuty?.sections ?? [];

  const selectedMessage = useMemo(() => {
    if (!selectedDate) return "";

    return buildHlsMessage({
      selectedDate,
      sections,
    });
  }, [selectedDate, sections]);

  const [copiedMessage, setCopiedMessage] = useState(false);

  const copyMessage = async () => {
    try {
      await navigator.clipboard.writeText(selectedMessage);
      setCopiedMessage(true);
      setTimeout(() => setCopiedMessage(false), 2000);
      toast.success("Message copied");
    } catch {
      toast.error("Failed to copy message");
    }
  };

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <div
          className="text-xs font-semibold tracking-wider uppercase"
          style={{ color: "#c8a97e" }}
        >
          Select planning month
        </div>

        <Select value={selectedMonth} onValueChange={setSelectedMonth}>
          <SelectTrigger className="h-12 w-full border border-[#2a2a2a] bg-[#0f0f0f] px-4 text-sm text-white">
            <SelectValue placeholder="Select month" />
          </SelectTrigger>

          <SelectContent
            position="popper"
            side="bottom"
            align="start"
            sideOffset={8}
            className="z-[9999] w-[var(--radix-select-trigger-width)] border border-[#2a2a2a] bg-[#111111] text-white shadow-xl"
          >
            {monthOptions.map((month) => (
              <SelectItem
                key={month.value}
                value={month.value}
                className="cursor-pointer rounded-lg px-3 py-2 text-sm text-white focus:bg-[#252525] focus:text-white"
              >
                {month.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <div
          className="text-xs font-semibold tracking-wider uppercase"
          style={{ color: "#c8a97e" }}
        >
          Select duty date
        </div>

        <Select
          value={selectedDate}
          onValueChange={setSelectedDate}
          disabled={isLoading || dates.length === 0}
        >
          <SelectTrigger className="h-12 w-full border border-[#2a2a2a] bg-[#0f0f0f] px-4 text-sm text-white">
            <SelectValue
              placeholder={isLoading ? "Loading dates..." : "Select date"}
            />
          </SelectTrigger>

          <SelectContent
            position="popper"
            side="bottom"
            align="start"
            sideOffset={8}
            className="z-[9999] w-[var(--radix-select-trigger-width)] border border-[#2a2a2a] bg-[#111111] text-white shadow-xl"
          >
            {dates.map((date) => (
              <SelectItem
                key={date.iso}
                value={date.iso}
                className="cursor-pointer rounded-lg px-3 py-2 text-sm text-white focus:bg-[#252525] focus:text-white"
              >
                {date.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {sections.map((section) => (
        <div
          key={section.title}
          className="rounded-2xl overflow-hidden"
          style={{
            backgroundColor: "#131313",
            border: "1px solid #1e1e1e",
          }}
        >
          <div
            className="px-4 py-3 text-xs font-bold tracking-wider uppercase"
            style={{
              backgroundColor: "#1f2d1c",
              color: "#b7d7a8",
              borderBottom: "1px solid #2f4529",
            }}
          >
            {section.title}
          </div>

          {section.names.length === 0 ? (
            <div className="px-4 py-3 text-sm" style={{ color: "#555" }}>
              No one assigned
            </div>
          ) : (
            <div className="divide-y divide-neutral-900">
              {section.names.map((person) => (
                <div
                  key={person}
                  className="px-4 py-3 flex items-center justify-between"
                >
                  <span className="text-sm font-medium text-white">
                    {person}
                  </span>

                  <span
                    className="px-2 py-1 rounded-md text-xs font-bold"
                    style={{
                      backgroundColor: "#c8a97e22",
                      color: "#c8a97e",
                    }}
                  >
                    x
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      {selectedMessage && (
        <div
          className="rounded-2xl overflow-hidden"
          style={{
            backgroundColor: "#131313",
            border: "1px solid #1e1e1e",
          }}
        >
          <div
            className="flex items-center justify-between px-4 py-3"
            style={{
              backgroundColor: "#1a1812",
              borderBottom: "1px solid #2a2518",
            }}
          >
            <div>
              <div
                className="text-xs font-bold tracking-wider uppercase"
                style={{ color: "#c8a97e" }}
              >
                Generated Message
              </div>
              <div className="text-xs mt-0.5" style={{ color: "#666" }}>
                {selectedMonth} · {selectedDuty?.label}
              </div>
            </div>

            <Button
              variant="outline"
              className="text-xs h-8 px-3"
              onClick={copyMessage}
            >
              {copiedMessage ? "Copied!" : "Copy"}
            </Button>
          </div>

          <pre
            className="whitespace-pre-wrap text-sm leading-relaxed p-4 overflow-x-auto"
            style={{
              color: "#e5e5e5",
              fontFamily:
                'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
            }}
          >
            {selectedMessage}
          </pre>
        </div>
      )}
    </div>
  );
}

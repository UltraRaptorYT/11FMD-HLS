"use client";
import { useState, useMemo, useEffect } from "react";
import { addMonths, fromISO, toISO } from "@/lib/utils";
import { Button } from "@/components/ui/button";

function toPlanningMonthSheetName(date: Date) {
  return date
    .toLocaleDateString("en-GB", {
      month: "short",
      year: "numeric",
    })
    .toUpperCase();
}

export default function MyDutyView({
  name,
  planningMonth,
}: {
  name: string;
  planningMonth: Date;
}) {
  const [monthOffset, setMonthOffset] = useState(0);
  const [duties, setDuties] = useState<{ iso: string; label: string }[]>([]);
  const [sheetName, setSheetName] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const viewMonth = useMemo(
    () => addMonths(planningMonth, monthOffset),
    [planningMonth, monthOffset],
  );

  const planningMonthSheetName = useMemo(
    () =>
      viewMonth
        .toLocaleDateString("en-GB", {
          month: "short",
          year: "numeric",
        })
        .toUpperCase(),
    [viewMonth],
  );

  const monthLabel = viewMonth.toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });

  const viewYear = viewMonth.getFullYear();
  const viewMonthIndex = viewMonth.getMonth();
  const daysInMonth = new Date(viewYear, viewMonthIndex + 1, 0).getDate();

  useEffect(() => {
    if (!name.trim()) {
      setDuties([]);
      return;
    }

    let cancelled = false;

    async function fetchDuty() {
      setIsLoading(true);

      try {
        const res = await fetch(
          `/api/getDuty?${new URLSearchParams({
            name: name.trim(),
            sheetName: planningMonthSheetName,
          })}`,
        );

        if (!res.ok) {
          console.error(`[MyDutyView] getDuty ${res.status}`);
          setDuties([]);
          setSheetName("");
          return;
        }

        const data = await res.json();

        if (!cancelled) {
          setDuties(data.duties ?? []);
          setSheetName(data.sheetName ?? planningMonthSheetName);
        }
      } catch (e) {
        console.error("[MyDutyView] fetch error:", e);
        setDuties([]);
        setSheetName("");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    fetchDuty();

    return () => {
      cancelled = true;
    };
  }, [name, planningMonthSheetName]);

  const dutySet = useMemo(() => new Set(duties.map((d) => d.iso)), [duties]);

  const weekdayGrid = useMemo(() => {
    const weeks: { dayNum: number; iso: string; date: Date }[][] = [];
    let currentWeek: { dayNum: number; iso: string; date: Date }[] = [];

    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(viewYear, viewMonthIndex, d);
      const dow = date.getDay();

      if (dow === 0 || dow === 6) continue;

      if (dow === 1 && currentWeek.length > 0) {
        weeks.push(currentWeek);
        currentWeek = [];
      }

      currentWeek.push({
        dayNum: d,
        iso: toISO(date),
        date,
      });
    }

    if (currentWeek.length > 0) weeks.push(currentWeek);

    return weeks;
  }, [viewYear, viewMonthIndex, daysInMonth]);

  if (!name.trim()) {
    return (
      <p className="text-sm text-muted-foreground">
        Please select your name to view duties.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          className="text-sm px-3"
          onClick={() => setMonthOffset((p) => p - 1)}
        >
          ←
        </Button>

        <div className="flex flex-col items-center">
          <div className="font-bold text-white text-base">{monthLabel}</div>
          <div className="text-xs mt-0.5" style={{ color: "#666" }}>
            {isLoading ? "Loading duties..." : sheetName}
          </div>
        </div>

        <Button
          variant="outline"
          className="text-sm px-3"
          onClick={() => setMonthOffset((p) => p + 1)}
        >
          →
        </Button>
      </div>

      <div
        className="rounded-2xl p-4"
        style={{ backgroundColor: "#131313", border: "1px solid #222" }}
      >
        <div className="grid grid-cols-5 gap-1 mb-2">
          {["Mon", "Tue", "Wed", "Thu", "Fri"].map((d) => (
            <div
              key={d}
              className="text-center text-[10px] font-bold tracking-wider uppercase py-1"
              style={{ color: "#555" }}
            >
              {d}
            </div>
          ))}
        </div>

        {weekdayGrid.map((week, wi) => {
          const padBefore = week[0].date.getDay() - 1;
          const padAfter = 5 - week[week.length - 1].date.getDay();

          return (
            <div key={wi} className="grid grid-cols-5 gap-1">
              {Array.from({ length: padBefore }).map((_, i) => (
                <div key={`pb-${wi}-${i}`} />
              ))}

              {week.map(({ dayNum, iso }) => {
                const hasDuty = dutySet.has(iso);

                return (
                  <div
                    key={iso}
                    className="relative flex flex-col items-center justify-center rounded-lg py-2 transition-all"
                    style={{
                      backgroundColor: hasDuty ? "#1a1812" : "transparent",
                      border: hasDuty
                        ? "1px solid #2a2518"
                        : "1px solid transparent",
                      minHeight: "52px",
                    }}
                  >
                    <span
                      className={`text-sm font-medium ${
                        hasDuty ? "text-white" : "text-neutral-600"
                      }`}
                    >
                      {dayNum}
                    </span>

                    {hasDuty && (
                      <div className="flex gap-0.5 mt-1">
                        <div
                          className="w-1.5 h-1.5 rounded-full"
                          style={{ backgroundColor: "#c8a97e" }}
                        />
                      </div>
                    )}
                  </div>
                );
              })}

              {Array.from({ length: padAfter }).map((_, i) => (
                <div key={`pa-${wi}-${i}`} />
              ))}
            </div>
          );
        })}
      </div>

      <div
        className="flex items-center justify-center gap-6 text-xs"
        style={{ color: "#666" }}
      >
        <span className="flex items-center gap-2">
          <span
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: "#c8a97e" }}
          />
          HLS Duty
        </span>
        <span className="flex items-center gap-2">
          <span
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: "#333" }}
          />
          No duty
        </span>
      </div>

      <div
        className="rounded-2xl p-5 text-center"
        style={{ backgroundColor: "#161616", border: "1px solid #222" }}
      >
        <div className="text-5xl font-black" style={{ color: "#c8a97e" }}>
          {duties.length}
        </div>
        <div
          className="text-xs font-semibold tracking-wider uppercase mt-1"
          style={{ color: "#666" }}
        >
          Duties this month
        </div>
      </div>
    </div>
  );
}

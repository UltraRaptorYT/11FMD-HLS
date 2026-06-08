"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { JSX, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import MyDutyView from "@/app/DutyView";
import AdminDutyView from "@/app/AdminView";
import { addMonths, fromISO, toISO } from "@/lib/utils";

function getPlanningMonth(today: Date) {
  return new Date(today.getFullYear(), today.getMonth() + 1, 1);
}

function toPlanningMonthSheetName(date: Date) {
  return date
    .toLocaleDateString("en-GB", {
      month: "short",
      year: "numeric",
    })
    .toUpperCase();
}

function isSameMonth(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

type DutyDay = {
  iso: string;
  enabled: boolean;
};

function buildDefaultMonth(
  date: Date,
  publicHolidayDates: Set<string> = new Set(),
): Record<string, DutyDay> {
  const year = date.getFullYear();
  const month = date.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const result: Record<string, DutyDay> = {};

  for (let d = 1; d <= daysInMonth; d++) {
    const day = new Date(year, month, d);
    const dayOfWeek = day.getDay();

    // Monday = 1, Wednesday = 3, Friday = 5
    if (![1, 3, 5].includes(dayOfWeek)) continue;

    const iso = toISO(day);
    if (publicHolidayDates.has(iso)) continue;

    result[iso] = {
      iso,
      enabled: true,
    };
  }

  return result;
}

function filterPublicHolidays(
  plan: Record<string, DutyDay>,
  publicHolidayDates: Set<string>,
) {
  if (publicHolidayDates.size === 0) return plan;

  return Object.fromEntries(
    Object.entries(plan).filter(([iso]) => !publicHolidayDates.has(iso)),
  );
}

export default function HomeClient({
  namelist,
}: {
  namelist: string[];
}): JSX.Element {
  const [nameSearch, setNameSearch] = useState("");
  const [monthOffset, setMonthOffset] = useState(0);
  const [name, setName] = useState("");
  const [showNameDropdown, setShowNameDropdown] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastSubmitAt, setLastSubmitAt] = useState(0);

  const today = useMemo(() => new Date(), []);

  const initialPlanningMonth = useMemo(() => getPlanningMonth(today), [today]);
  const [planningMonth, setPlanningMonth] = useState(initialPlanningMonth);

  const viewDate = useMemo(
    () => addMonths(planningMonth, monthOffset),
    [planningMonth, monthOffset],
  );

  const filteredNames = namelist.filter((n) =>
    n.toLowerCase().includes(nameSearch.toLowerCase()),
  );

  const currentMonthStart = useMemo(
    () => new Date(today.getFullYear(), today.getMonth(), 1),
    [today],
  );

  const currentMonthSheetName = useMemo(
    () => toPlanningMonthSheetName(currentMonthStart),
    [currentMonthStart],
  );

  const [adminSelectedMonth, setAdminSelectedMonth] = useState(
    currentMonthSheetName,
  );

  const defaultAdminMonth = useMemo(
    () =>
      planningMonth
        .toLocaleDateString("en-GB", {
          month: "short",
          year: "numeric",
        })
        .toUpperCase(),
    [planningMonth],
  );

  const [adminSelectedDate, setAdminSelectedDate] = useState("");
  const [activeTab, setActiveTab] = useState("plan");

  const viewedMonthStart = useMemo(
    () => new Date(viewDate.getFullYear(), viewDate.getMonth(), 1),
    [viewDate],
  );
  const viewedYear = viewedMonthStart.getFullYear();

  const viewedMonthStartISO = toISO(viewedMonthStart);

  const isCurrentPlanningMonth = isSameMonth(viewedMonthStart, planningMonth);

  const monthLabel = viewDate.toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });

  const planningMonthSheetName = useMemo(
    () => toPlanningMonthSheetName(viewedMonthStart),
    [viewedMonthStart],
  );

  const [planningLock, setPlanningLock] = useState<{
    locked: boolean;
    finalStatus: string;
    source: string;
  } | null>(null);

  const [isLockLoading, setIsLockLoading] = useState(false);
  const [publicHolidaysByYear, setPublicHolidaysByYear] = useState<
    Record<string, Record<string, string>>
  >({});

  useEffect(() => {
    if (publicHolidaysByYear[String(viewedYear)]) return;

    let cancelled = false;

    async function fetchPublicHolidays() {
      try {
        const res = await fetch(
          `/api/getPublicHolidays?${new URLSearchParams({
            year: String(viewedYear),
          })}`,
        );

        if (!res.ok) {
          console.error(`[HLS] getPublicHolidays ${res.status}`);
          return;
        }

        const data = await res.json();

        if (!cancelled) {
          setPublicHolidaysByYear((prev) => ({
            ...prev,
            [String(viewedYear)]: data.holidays ?? {},
          }));
        }
      } catch (e) {
        console.error("[HLS] getPublicHolidays error:", e);
      }
    }

    fetchPublicHolidays();

    return () => {
      cancelled = true;
    };
  }, [publicHolidaysByYear, viewedYear]);

  const publicHolidayDates = useMemo(
    () => new Set(Object.keys(publicHolidaysByYear[String(viewedYear)] ?? {})),
    [publicHolidaysByYear, viewedYear],
  );

  const baseKey = "hlsDetails";
  const nameKey = `${baseKey}:name`;
  const monthKey = viewedMonthStartISO;
  const draftKey = `${baseKey}:monthDraft:${name.trim()}:${monthKey}`;
  const submittedKey = `${baseKey}:monthSubmitted:${name.trim()}:${monthKey}`;

  useEffect(() => {
    let cancelled = false;

    async function fetchPlanningLock() {
      setIsLockLoading(true);

      try {
        const res = await fetch(
          `/api/getPlanningLock?${new URLSearchParams({
            month: planningMonthSheetName,
          })}`,
        );

        if (!res.ok) {
          console.error(`[HLS] getPlanningLock ${res.status}`);
          setPlanningLock(null);
          return;
        }

        const data = await res.json();

        if (!cancelled) {
          const locked = Boolean(data.locked);

          setPlanningLock({
            locked,
            finalStatus: data.finalStatus ?? "UNLOCKED",
            source: data.source ?? "unknown",
          });

          if (locked && monthOffset === 0) {
            setPlanningMonth((prev) => addMonths(prev, 1));
          }
        }
      } catch (e) {
        console.error("[HLS] getPlanningLock error:", e);
        if (!cancelled) setPlanningLock(null);
      } finally {
        if (!cancelled) setIsLockLoading(false);
      }
    }

    fetchPlanningLock();

    return () => {
      cancelled = true;
    };
  }, [planningMonthSheetName, monthOffset]);

  const isLockedMonth = Boolean(planningLock?.locked);

  useEffect(() => {
    try {
      setName(localStorage.getItem(nameKey) ?? "");
    } catch {}
  }, [nameKey]);

  useEffect(() => {
    try {
      if (name) localStorage.setItem(nameKey, name);
      else localStorage.removeItem(nameKey);
    } catch {}
  }, [name, nameKey]);

  const [plan, setPlan] = useState<Record<string, DutyDay>>(() =>
    buildDefaultMonth(planningMonth),
  );

  const visiblePlan = useMemo(
    () => filterPublicHolidays(plan, publicHolidayDates),
    [plan, publicHolidayDates],
  );

  const activeDays = Object.values(visiblePlan).filter((d) => d.enabled);

  const changeMonth = (offset: number) => {
    const nextOffset = monthOffset + offset;
    setMonthOffset(nextOffset);
  };

  const cacheKey = `${baseKey}:serverCache:${name.trim()}`;
  const [serverCache, setServerCache] = useState<
    Record<string, Record<string, DutyDay>>
  >({});
  const [isFetching, setIsFetching] = useState(false);
  const [submittedFingerprint, setSubmittedFingerprint] = useState("");

  const currentFingerprint = useMemo(() => JSON.stringify(plan), [plan]);

  const hasUnsavedChanges = useMemo(() => {
    if (!submittedFingerprint) return false;
    return currentFingerprint !== submittedFingerprint;
  }, [currentFingerprint, submittedFingerprint]);

  useEffect(() => {
    const savedFromServer = serverCache[viewedMonthStartISO];

    if (savedFromServer) {
      setPlan(savedFromServer);
      const fp = JSON.stringify(savedFromServer);
      setSubmittedFingerprint(fp);

      try {
        localStorage.setItem(submittedKey, fp);
        localStorage.setItem(draftKey, fp);
      } catch {}

      return;
    }

    try {
      const submitted = localStorage.getItem(submittedKey);
      const draft = localStorage.getItem(draftKey);

      if (submitted) {
        setPlan(JSON.parse(submitted));
        setSubmittedFingerprint(submitted);
        return;
      }

      if (draft) {
        setPlan(JSON.parse(draft));
        setSubmittedFingerprint("");
        return;
      }

      setPlan(buildDefaultMonth(fromISO(viewedMonthStartISO)));
      setSubmittedFingerprint("");
    } catch {
      setPlan(buildDefaultMonth(fromISO(viewedMonthStartISO)));
      setSubmittedFingerprint("");
    }
  }, [serverCache, viewedMonthStartISO, submittedKey, draftKey]);

  useEffect(() => {
    try {
      const submitted = localStorage.getItem(submittedKey);
      const draft = localStorage.getItem(draftKey);

      if (submitted) {
        setPlan(JSON.parse(submitted));
        return;
      }

      if (draft) {
        setPlan(JSON.parse(draft));
        return;
      }

      setPlan(buildDefaultMonth(fromISO(viewedMonthStartISO)));
    } catch {
      setPlan(buildDefaultMonth(fromISO(viewedMonthStartISO)));
    }
  }, [draftKey, submittedKey, viewedMonthStartISO]);

  useEffect(() => {
    if (!name.trim()) return;

    try {
      localStorage.setItem(draftKey, JSON.stringify(plan));
    } catch {}
  }, [draftKey, name, plan]);

  const toggleDuty = (iso: string) => {
    if (isLockedMonth) return;

    setPlan((prev) => ({
      ...prev,
      [iso]: {
        ...prev[iso],
        enabled: !prev[iso].enabled,
      },
    }));
  };

  const SUBMIT_COOLDOWN_MS = 3000;

  const canSubmit =
    !isLockLoading && !isLockedMonth && !isSubmitting && Boolean(name.trim());

  useEffect(() => {
    if (!name.trim()) {
      setServerCache({});
      return;
    }

    let cancelled = false;

    async function fetchAllAvailability() {
      try {
        const cached = localStorage.getItem(cacheKey);
        if (cached && !cancelled) setServerCache(JSON.parse(cached));
      } catch {}

      setIsFetching(true);

      try {
        const res = await fetch(
          `/api/getAllAvailability?${new URLSearchParams({ name: name.trim() })}`,
        );

        if (!res.ok) {
          console.error(`[HLS] getAllAvailability ${res.status}`);
          return;
        }

        const data = await res.json();

        if (!cancelled && data?.months) {
          const months = data.months as Record<string, Record<string, DutyDay>>;

          setServerCache(months);
          localStorage.setItem(cacheKey, JSON.stringify(months));

          for (const [monthStart, monthPlan] of Object.entries(months)) {
            localStorage.setItem(
              `${baseKey}:monthSubmitted:${name.trim()}:${monthStart}`,
              JSON.stringify(monthPlan),
            );
          }
        }
      } catch (e) {
        console.error("[HLS] fetch availability error:", e);
      } finally {
        if (!cancelled) setIsFetching(false);
      }
    }

    fetchAllAvailability();

    return () => {
      cancelled = true;
    };
  }, [name, cacheKey]);

  const resetMonth = () => {
    if (isLockedMonth) return;

    const reset = buildDefaultMonth(
      fromISO(viewedMonthStartISO),
      publicHolidayDates,
    );
    setPlan(reset);

    toast.info("Reset to default");
  };

  const clearMonth = () => {
    if (isLockedMonth) return;

    const cleared = Object.fromEntries(
      Object.entries(
        buildDefaultMonth(fromISO(viewedMonthStartISO), publicHolidayDates),
      ).map(([iso, day]) => [iso, { ...day, enabled: false }]),
    );

    setPlan(cleared);

    try {
      localStorage.removeItem(draftKey);
      localStorage.removeItem(submittedKey);
    } catch {}

    toast.info("Cleared", {
      description: "Current month HLS availability has been cleared.",
    });
  };

  const handleSubmit = async () => {
    if (isSubmitting) return;

    const now = Date.now();
    const remaining = SUBMIT_COOLDOWN_MS - (now - lastSubmitAt);

    if (remaining > 0) {
      toast.error("Please wait before submitting again", {
        description: `Try again in ${Math.ceil(remaining / 1000)}s.`,
      });
      return;
    }

    if (!name.trim()) {
      toast.error("Please select your name first.");
      return;
    }

    if (isLockedMonth) {
      toast.error("This month is locked", {
        description:
          "You can view it, but you can no longer edit or submit it.",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await fetch("/api/submitAvailability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          monthStart: toISO(viewedMonthStart),
          availability: visiblePlan,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error("Submit failed", {
          description: err?.error ?? "Please try again.",
        });
        return;
      }

      localStorage.setItem(submittedKey, JSON.stringify(visiblePlan));
      localStorage.setItem(draftKey, JSON.stringify(visiblePlan));

      setLastSubmitAt(Date.now());

      toast.success("Submitted", {
        description: "Your HLS availability has been saved.",
      });
    } catch {
      toast.error("Submit failed", {
        description: "Network error. Try again.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 max-w-xl">
      <div className="text-center space-y-1 relative">
        <h1 className="text-xl font-bold text-white tracking-tight">
          HLS Planner
        </h1>
        <p className="text-xs" style={{ color: "#555" }}>
          Submit and manage your monthly HLS availability
        </p>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="w-full gap-6"
      >
        <TabsList className="w-full group-data-[orientation=horizontal]/tabs:h-12">
          <TabsTrigger value="plan">Plan</TabsTrigger>
          <TabsTrigger value="myDuties">My Duties</TabsTrigger>
          <TabsTrigger value="admin">Admin</TabsTrigger>
        </TabsList>

        <TabsContent value="plan" className="gap-6 flex flex-col">
          <div className="space-y-3 bg-muted p-4 rounded-lg">
            <div className="space-y-2 relative">
              <div
                className="text-xs font-semibold tracking-wider uppercase"
                style={{ color: "#c8a97e" }}
              >
                Editing HLS for
              </div>

              <div
                className="flex items-center rounded-xl px-4 py-3 cursor-pointer transition-colors"
                style={{
                  backgroundColor: "#0f0f0f",
                  border: "1px solid #2a2a2a",
                }}
                onClick={() => setShowNameDropdown(!showNameDropdown)}
              >
                <span className="flex-1 text-sm font-medium text-white">
                  {name || "Select name..."}
                </span>
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 12 12"
                  fill="none"
                  className={`transition-transform`}
                  style={{ rotate: `${showNameDropdown ? "180deg" : "0deg"}` }}
                >
                  <path
                    d="M2 4L6 8L10 4"
                    stroke="#666"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              </div>

              {showNameDropdown && (
                <div
                  className="absolute z-50 top-full left-0 right-0 mt-1 rounded-xl overflow-hidden shadow-2xl"
                  style={{
                    backgroundColor: "#1a1a1a",
                    border: "1px solid #2a2a2a",
                  }}
                >
                  <div className="p-2">
                    <input
                      type="text"
                      value={nameSearch}
                      onChange={(e) => setNameSearch(e.target.value)}
                      placeholder="Search..."
                      className="w-full px-3 py-2 rounded-lg text-sm text-white placeholder-neutral-600 outline-none"
                      style={{
                        backgroundColor: "#0f0f0f",
                        border: "1px solid #333",
                      }}
                      autoFocus
                    />
                  </div>

                  <div className="max-h-48 overflow-y-auto">
                    {filteredNames.length === 0 ? (
                      <div
                        className="px-4 py-3 text-sm"
                        style={{ color: "#666" }}
                      >
                        No names found
                      </div>
                    ) : (
                      filteredNames.map((n) => (
                        <button
                          key={n}
                          className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                            n === name
                              ? "text-white"
                              : "text-neutral-400 hover:text-white"
                          }`}
                          style={
                            n === name ? { backgroundColor: "#252525" } : {}
                          }
                          onClick={() => {
                            setName(n);
                            setShowNameDropdown(false);
                            setNameSearch("");
                          }}
                        >
                          {n}
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {!name ? (
            <p className="text-sm text-muted-foreground">
              Please select your name to start planning.
            </p>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <Button
                  variant="outline"
                  className="text-sm px-3"
                  onClick={() => changeMonth(-1)}
                >
                  ←
                </Button>

                <div className="flex flex-col items-center">
                  <div className="font-bold text-white text-base">
                    {monthLabel}
                  </div>

                  {isLockLoading ? (
                    <div className="text-xs mt-0.5" style={{ color: "#666" }}>
                      Checking lock...
                    </div>
                  ) : isLockedMonth ? (
                    <div
                      className="text-xs mt-0.5"
                      style={{ color: "#f59e0b" }}
                    >
                      Locked
                    </div>
                  ) : (
                    <div
                      className="text-xs mt-0.5"
                      style={{ color: "#4ade80" }}
                    >
                      Unlocked
                    </div>
                  )}

                  {!isCurrentPlanningMonth && (
                    <button
                      className="text-xs mt-1 font-medium"
                      style={{ color: "#c8a97e" }}
                      onClick={() => {
                        setMonthOffset(0);
                        setPlan(buildDefaultMonth(planningMonth));
                      }}
                    >
                      Back to current month
                    </button>
                  )}
                </div>

                <Button
                  variant="outline"
                  className="text-sm px-3"
                  onClick={() => changeMonth(1)}
                >
                  →
                </Button>
              </div>

              <div className="space-y-3">
                {Object.values(visiblePlan).map((day) => {
                  const dateObj = new Date(day.iso);
                  const dayName = dateObj.toLocaleDateString("en-GB", {
                    weekday: "short",
                  });
                  const dayNum = dateObj.getDate();
                  const monthShort = dateObj.toLocaleDateString("en-GB", {
                    month: "short",
                  });

                  return (
                    <div
                      key={day.iso}
                      className="rounded-xl p-4 transition-all duration-300 border"
                      style={{
                        backgroundColor: day.enabled ? "#1a1812" : "#111111",
                        border: day.enabled
                          ? "1px solid #3d3520"
                          : "1px solid #1e1e1e",
                      }}
                    >
                      <div className="flex items-center gap-4">
                        <div className="flex flex-col items-center min-w-9">
                          <span
                            className="text-[10px] font-bold tracking-wider uppercase"
                            style={{
                              color: day.enabled ? "#c8a97e" : "#555",
                            }}
                          >
                            {dayName}
                          </span>

                          <span
                            className={`text-xl font-bold ${
                              day.enabled ? "text-white" : "text-neutral-600"
                            }`}
                          >
                            {dayNum}
                          </span>

                          <span
                            className="text-[10px]"
                            style={{ color: "#555" }}
                          >
                            {monthShort}
                          </span>
                        </div>

                        <div className="flex-1">
                          <div
                            className="text-sm font-medium"
                            style={{
                              color: day.enabled ? "#c8a97e" : "#555",
                            }}
                          >
                            {isLockedMonth
                              ? "Locked"
                              : day.enabled
                                ? "Available"
                                : "Unavailable"}
                          </div>
                        </div>

                        <Button
                          disabled={isLockedMonth || isLockLoading}
                          onClick={() => toggleDuty(day.iso)}
                          className="relative w-12 h-7 rounded-full transition-all duration-300 disabled:opacity-50"
                          style={{
                            backgroundColor: day.enabled
                              ? "#c8a97e"
                              : "#2a2a2a",
                          }}
                        >
                          <div
                            className="absolute top-0.5 w-6 h-6 rounded-full bg-white shadow-md transition-all duration-300"
                            style={{
                              left: day.enabled
                                ? "calc(100% - 1.625rem)"
                                : "0.125rem",
                            }}
                          />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  disabled={isLockedMonth}
                  className="h-10 bg-[#1a1111] disabled:opacity-50 text-sm font-medium transition-all"
                  // className="h-10 bg-[#1a1111] disabled:opacity-50 text-sm font-medium transition-all"
                  style={{ border: "1px solid #20283d", color: "#557ce8" }}
                  onClick={resetMonth}
                >
                  Reset
                </Button>
                <Button
                  variant="outline"
                  disabled={isLockedMonth}
                  className="h-10 bg-[#1a1111] disabled:opacity-50 text-sm font-medium transition-all"
                  style={{ border: "1px solid #3d2020", color: "#e85555" }}
                  onClick={clearMonth}
                >
                  Clear
                </Button>

                <Button
                  disabled={!canSubmit}
                  className="flex-1 py-3 h-10 text-sm font-bold transition-all duration-300"
                  style={
                    canSubmit
                      ? {
                          background:
                            "linear-gradient(135deg, #c8a97e 0%, #a88a5e 100%)",
                          color: "#0a0a0a",
                          boxShadow: "0 4px 20px #c8a97e44",
                        }
                      : {
                          backgroundColor: "#1a1a1a",
                          color: "#444",
                          border: "1px solid #252525",
                        }
                  }
                  onClick={handleSubmit}
                >
                  {isSubmitting ? "Submitting..." : "Submit Availability"}
                </Button>
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="myDuties" className="gap-6 flex flex-col">
          <MyDutyView
            name={name}
            planningMonth={currentMonthStart}
            onSelectAdminDate={({ sheetName, iso }) => {
              setAdminSelectedMonth(sheetName);
              setAdminSelectedDate(iso);
              setActiveTab("admin");
            }}
          />
        </TabsContent>

        <TabsContent value="admin" className="gap-6 flex flex-col">
          <AdminDutyView
            selectedMonth={adminSelectedMonth}
            setSelectedMonth={setAdminSelectedMonth}
            selectedDate={adminSelectedDate}
            setSelectedDate={setAdminSelectedDate}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

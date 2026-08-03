"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  CalendarDays,
  ChevronRight,
  ClipboardCheck,
  CopyPlus,
  LogOut,
  RefreshCw,
  Trash2,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import type {
  AdminMonthData,
  DutySection,
  MonthOption,
  PersonOption,
} from "@/lib/hls-admin";
import SearchableSelect from "./SearchableSelect";

const SINGLE_SECTIONS: { key: DutySection; label: string; hint: string }[] = [
  { key: "SUPERVISING", label: "Supervising officer", hint: "Supervising" },
  { key: "CONDUCTING", label: "Conducting officer", hint: "Conducting" },
  { key: "SAFETY", label: "Safety officer", hint: "Safety" },
  { key: "LOGS IC", label: "Logistics IC", hint: "Logs IC" },
];

type Assignments = Record<DutySection, string[]>;

function emptyAssignments(): Assignments {
  return {
    SUPERVISING: [],
    CONDUCTING: [],
    SAFETY: [],
    "LOGS IC": [],
    "LOGS TEAM": [],
  };
}

function availabilityLabel(person: PersonOption) {
  if (person.available) return "Available";
  return person.reason ?? "Unavailable";
}

function buildCreateMonthOptions(existingMonths: MonthOption[]) {
  const existing = new Set(
    existingMonths.map((month) => month.start.slice(0, 7)),
  );
  const today = new Date();

  return Array.from({ length: 6 }, (_, offset) => {
    const date = new Date(today.getFullYear(), today.getMonth() + offset, 1);
    const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const alreadyExists = existing.has(value);

    return {
      value,
      label: date.toLocaleDateString("en-GB", {
        month: "long",
        year: "numeric",
      }),
      description: alreadyExists ? "Sheet already exists" : "Ready to create",
      disabled: alreadyExists,
    };
  });
}

export default function AdminDashboard() {
  const router = useRouter();
  const [months, setMonths] = useState<MonthOption[]>([]);
  const [selectedMonth, setSelectedMonth] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [newMonth, setNewMonth] = useState("");
  const [monthData, setMonthData] = useState<AdminMonthData | null>(null);
  const [assignments, setAssignments] = useState<Assignments>(emptyAssignments);
  const [selectedGroup, setSelectedGroup] = useState("");
  const [logsSearch, setLogsSearch] = useState("");
  const [isLoadingMonths, setIsLoadingMonths] = useState(true);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [showClearDialog, setShowClearDialog] = useState(false);

  const handleUnauthorized = useCallback(
    (response: Response) => {
      if (response.status !== 401) return false;
      router.refresh();
      return true;
    },
    [router],
  );

  const loadMonths = useCallback(async () => {
    setIsLoadingMonths(true);
    try {
      const response = await fetch("/api/admin/months", { cache: "no-store" });
      if (handleUnauthorized(response)) return;
      const data = (await response.json()) as {
        months?: MonthOption[];
        error?: string;
      };
      if (!response.ok) throw new Error(data.error ?? "Could not load months.");

      const nextMonths = data.months ?? [];
      setMonths(nextMonths);
      const params = new URLSearchParams(window.location.search);
      const requested = params.get("month")?.toUpperCase();
      const initialMonth =
        nextMonths.find((month) => month.value === requested)?.value ??
        nextMonths[0]?.value ??
        "";
      setSelectedMonth((current) => current || initialMonth);
      setSelectedDate((current) => current || params.get("date") || "");
      const creationOptions = buildCreateMonthOptions(nextMonths);
      setNewMonth((current) =>
        creationOptions.some(
          (option) => option.value === current && !option.disabled,
        )
          ? current
          : (creationOptions.find((option) => !option.disabled)?.value ?? ""),
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not load months.",
      );
    } finally {
      setIsLoadingMonths(false);
    }
  }, [handleUnauthorized]);

  useEffect(() => {
    queueMicrotask(() => void loadMonths());
  }, [loadMonths]);

  const loadMonthData = useCallback(
    async (month: string, date?: string) => {
      if (!month) return;
      setIsLoadingData(true);
      try {
        const query = new URLSearchParams({ month });
        if (date) query.set("date", date);
        const response = await fetch(`/api/admin/month-data?${query}`, {
          cache: "no-store",
        });
        if (handleUnauthorized(response)) return;
        const data = (await response.json()) as AdminMonthData & {
          error?: string;
        };
        if (!response.ok)
          throw new Error(data.error ?? "Could not load duty data.");

        setMonthData(data);
        setSelectedDate((current) =>
          data.selectedDate !== current ? data.selectedDate : current,
        );
        const nextAssignments = emptyAssignments();
        for (const section of Object.keys(data.sections) as DutySection[]) {
          nextAssignments[section] = data.sections[section]
            .filter((person) => person.assigned)
            .map((person) => person.name);
        }
        setAssignments(nextAssignments);

        const assignedLog = nextAssignments["LOGS TEAM"][0];
        const assignedGroup = data.groups.find((group) =>
          group.people.includes(assignedLog),
        );
        const rowTwoGroup = data.groups.find(
          (group) => group.name === data.selectedDutySection,
        );
        setSelectedGroup(
          rowTwoGroup?.name ??
            assignedGroup?.name ??
            data.groups[0]?.name ??
            "",
        );
      } catch (error) {
        setMonthData(null);
        toast.error(
          error instanceof Error ? error.message : "Could not load duty data.",
        );
      } finally {
        setIsLoadingData(false);
      }
    },
    [handleUnauthorized],
  );

  useEffect(() => {
    queueMicrotask(
      () => void loadMonthData(selectedMonth, selectedDate || undefined),
    );
  }, [loadMonthData, selectedMonth, selectedDate]);

  const selectedGroupPeople = useMemo(() => {
    if (!monthData || !selectedGroup) return [];
    const names = new Set(
      monthData.groups.find((group) => group.name === selectedGroup)?.people ??
        [],
    );
    return monthData.sections["LOGS TEAM"].filter((person) =>
      names.has(person.name),
    );
  }, [monthData, selectedGroup]);

  const filteredGroupPeople = useMemo(() => {
    const search = logsSearch.trim().toLowerCase();
    if (!search) return selectedGroupPeople;

    return selectedGroupPeople.filter((person) =>
      `${person.name} ${availabilityLabel(person)}`
        .toLowerCase()
        .includes(search),
    );
  }, [logsSearch, selectedGroupPeople]);

  const createMonthOptions = useMemo(
    () => buildCreateMonthOptions(months),
    [months],
  );
  const selectedCreateMonth = createMonthOptions.find(
    (option) => option.value === newMonth,
  );

  async function createMonth() {
    if (!newMonth) return;
    setIsCreating(true);
    try {
      const response = await fetch("/api/admin/months", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month: newMonth }),
      });
      if (handleUnauthorized(response)) return;
      const data = (await response.json()) as {
        month?: MonthOption;
        error?: string;
      };
      if (!response.ok || !data.month) {
        throw new Error(data.error ?? "Could not create month.");
      }

      toast.success(`${data.month.label} created`, {
        description: "Template duplicated and column A frozen as values.",
      });
      setSelectedDate("");
      setSelectedMonth(data.month.value);
      await loadMonths();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not create month.",
      );
    } finally {
      setIsCreating(false);
    }
  }

  function setSingleAssignment(section: DutySection, name: string) {
    setAssignments((current) => ({
      ...current,
      [section]: name ? [name] : [],
    }));
  }

  function toggleLogsPerson(name: string) {
    setAssignments((current) => {
      const selected = new Set(current["LOGS TEAM"]);
      if (selected.has(name)) selected.delete(name);
      else selected.add(name);
      return { ...current, "LOGS TEAM": [...selected] };
    });
  }

  const canSave =
    Boolean(selectedMonth && selectedDate && selectedGroup) &&
    SINGLE_SECTIONS.every((section) => assignments[section.key].length === 1) &&
    assignments["LOGS TEAM"].length >= 1;

  async function saveDutyAssignments() {
    if (!canSave) {
      toast.error(
        "Select the logistics group, complete every duty role, and choose at least one logs team member.",
      );
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch("/api/admin/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          month: selectedMonth,
          date: selectedDate,
          dutySection: selectedGroup,
          assignments,
        }),
      });
      if (handleUnauthorized(response)) return;
      const data = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(data.error ?? "Could not save assignments.");

      toast.success("Duty assignments saved", {
        description: "The selected date has been updated in Google Sheets.",
      });
      await loadMonthData(selectedMonth, selectedDate);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not save assignments.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function clearDutyAssignments() {
    if (!selectedMonth || !selectedDate) return;

    setIsClearing(true);
    try {
      const response = await fetch("/api/admin/assignments", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          month: selectedMonth,
          date: selectedDate,
        }),
      });
      if (handleUnauthorized(response)) return;
      const data = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(data.error ?? "Could not clear assignments.");

      setShowClearDialog(false);
      setAssignments(emptyAssignments());
      toast.success("Duty assignments cleared", {
        description:
          "All assignments and the logistics group were removed for this date.",
      });
      await loadMonthData(selectedMonth, selectedDate);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not clear assignments.",
      );
    } finally {
      setIsClearing(false);
    }
  }

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.refresh();
  }

  return (
    <main className="min-h-screen bg-[#090b0a] text-white">
      <header className="border-b border-white/8 bg-[#0c0f0c]/90 px-5 py-4 backdrop-blur sm:px-8">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="font-semibold tracking-tight">HLS Admin</h1>
              <p className="text-xs text-white/40">Monthly duty assignment</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              asChild
              className="text-white/55 hover:text-white"
            >
              <Link href="/">Planner</Link>
            </Button>
            <Button
              variant="outline"
              onClick={logout}
              className="border-white/10 bg-transparent text-white/65"
            >
              <LogOut className="size-4" aria-hidden="true" />
              <span className="hidden sm:inline">Sign out</span>
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl space-y-6 px-5 py-7 sm:px-8 sm:py-10">
        <Card className="rounded-3xl bg-[#121512] ring-white/8">
          <CardHeader className="gap-3 sm:grid-cols-[1fr_auto]">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#c8a97e]">
                <CopyPlus className="size-4" aria-hidden="true" /> Month setup
              </div>
              <CardTitle className="mt-3 text-xl">
                Create a monthly duty sheet
              </CardTitle>
              <CardDescription className="mt-2 max-w-xl leading-6 text-white/45">
                Duplicates “Template – Make a Copy”, freezes column A as values,
                places the new month immediately before the template, and sets
                A2 to the first day of the month.
              </CardDescription>
            </div>
            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:self-end">
              <div className="space-y-2">
                <Label>Month to create</Label>
                <SearchableSelect
                  value={newMonth}
                  options={createMonthOptions}
                  onValueChange={setNewMonth}
                  placeholder="Choose month"
                  searchPlaceholder="Search next six months…"
                  emptyMessage="No matching month."
                  className="min-w-52 sm:w-64"
                />
              </div>
              <Button
                onClick={createMonth}
                disabled={
                  !newMonth || selectedCreateMonth?.disabled || isCreating
                }
                className="h-11 self-end bg-[#c8a97e] px-5 text-[#10110e] hover:bg-[#d4b98f]"
              >
                {isCreating ? (
                  <RefreshCw className="animate-spin" />
                ) : (
                  <CopyPlus />
                )}
                {isCreating ? "Creating…" : "Create month"}
              </Button>
            </div>
          </CardHeader>
        </Card>

        <Card className="rounded-3xl bg-[#121512] ring-white/8">
          <CardHeader className="border-b border-white/8">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#c8a97e]">
              <ClipboardCheck className="size-4" aria-hidden="true" /> Duty
              assignment
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <CalendarDays className="size-4 text-white/35" /> Month
                </Label>
                <SearchableSelect
                  value={selectedMonth}
                  options={months.map((month) => ({
                    value: month.value,
                    label: month.label,
                  }))}
                  onValueChange={(value) => {
                    setSelectedDate("");
                    setSelectedMonth(value);
                  }}
                  placeholder={
                    isLoadingMonths ? "Loading months…" : "Select month"
                  }
                  searchPlaceholder="Search month…"
                  emptyMessage="No matching month sheet."
                  disabled={isLoadingMonths || months.length === 0}
                />
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <ChevronRight className="size-4 text-white/35" /> Duty date
                </Label>
                <SearchableSelect
                  value={selectedDate}
                  options={(monthData?.dates ?? []).map((date) => ({
                    value: date.iso,
                    label: date.label,
                  }))}
                  onValueChange={setSelectedDate}
                  placeholder={
                    isLoadingData ? "Loading dates…" : "Select duty date"
                  }
                  searchPlaceholder="Search duty date…"
                  emptyMessage="No matching duty date."
                  disabled={isLoadingData || !monthData?.dates.length}
                />
              </div>
            </div>
          </CardHeader>

          {isLoadingData && !monthData ? (
            <CardContent className="flex min-h-80 items-center justify-center gap-3 text-sm text-white/45">
              <RefreshCw className="size-4 animate-spin" /> Loading
              availability…
            </CardContent>
          ) : monthData ? (
            <CardContent className="pt-1">
              <div className="grid gap-4 md:grid-cols-2">
                {SINGLE_SECTIONS.map((section) => {
                  const people = monthData.sections[section.key];
                  const availableCount = people.filter(
                    (person) => person.available,
                  ).length;
                  return (
                    <Card
                      key={section.key}
                      size="sm"
                      className="min-w-0 bg-black/15 ring-white/8"
                    >
                      <CardHeader>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <CardTitle>{section.label}</CardTitle>
                            <CardDescription className="mt-1 text-xs text-white/35">
                              {availableCount} of {people.length} available
                            </CardDescription>
                          </div>
                          <Badge className="bg-[#b7d7a8]/10 text-[10px] uppercase tracking-wider text-[#b7d7a8]">
                            {section.hint}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <SearchableSelect
                          value={assignments[section.key][0] ?? ""}
                          options={people.map((person) => ({
                            value: person.name,
                            label: person.name,
                            description: availabilityLabel(person),
                            disabled: !person.available && !person.assigned,
                          }))}
                          onValueChange={(value) =>
                            setSingleAssignment(section.key, value)
                          }
                          placeholder="Select person…"
                          searchPlaceholder={`Search ${section.label.toLowerCase()}…`}
                          emptyMessage="No matching personnel."
                        />
                      </CardContent>
                    </Card>
                  );
                })}
              </div>

              <Card className="mt-5 min-w-0 bg-black/15 ring-white/8">
                <CardHeader>
                  <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Users className="size-4 text-[#c8a97e]" /> Logistics
                        team
                      </CardTitle>
                      <CardDescription className="mt-1 text-xs leading-5 text-white/40">
                        Choose a group, then search and select at least one
                        available person. This group is also written to row 2
                        for the duty date.
                      </CardDescription>
                    </div>
                    <div className="w-full space-y-2 sm:w-64">
                      <Label>Logistics group</Label>
                      <SearchableSelect
                        value={selectedGroup}
                        options={monthData.groups.map((group) => ({
                          value: group.name,
                          label: group.name,
                          description: `${group.people.length} people`,
                        }))}
                        onValueChange={(group) => {
                          setSelectedGroup(group);
                          setLogsSearch("");
                        }}
                        placeholder="Select group…"
                        searchPlaceholder="Search group…"
                        emptyMessage="No matching group."
                      />
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="min-w-0">
                  <div className="min-w-0 overflow-hidden rounded-xl border border-[#2a2a2a] bg-[#1a1a1a] shadow-2xl">
                    <div className="p-2">
                      <input
                        type="text"
                        value={logsSearch}
                        onChange={(event) => setLogsSearch(event.target.value)}
                        placeholder={`Search ${selectedGroup || "logs team"} names…`}
                        className="w-full rounded-lg border border-[#333] bg-[#0f0f0f] px-3 py-2 text-sm text-white outline-none placeholder:text-neutral-600"
                      />
                    </div>
                    <div className="max-h-48 min-w-0 overflow-y-auto">
                      {filteredGroupPeople.length === 0 ? (
                        <div className="px-4 py-3 text-sm text-[#666]">
                          No matching logistics personnel.
                        </div>
                      ) : (
                        filteredGroupPeople.map((person) => {
                          const checked = assignments["LOGS TEAM"].includes(
                            person.name,
                          );
                          const disabled =
                            !person.available && !person.assigned;

                          return (
                            <label
                              key={person.name}
                              className={`flex min-w-0 items-start gap-3 px-4 py-2.5 text-left text-sm transition-colors ${
                                checked
                                  ? "bg-[#252525] text-white"
                                  : "text-neutral-400 hover:bg-[#202020] hover:text-white"
                              } ${disabled ? "cursor-not-allowed opacity-40" : "cursor-pointer"}`}
                            >
                              <Checkbox
                                checked={checked}
                                disabled={disabled}
                                aria-label={`Select ${person.name}`}
                                onCheckedChange={() =>
                                  toggleLogsPerson(person.name)
                                }
                                className="mt-0.5 shrink-0"
                              />
                              <span className="min-w-0 flex-1 overflow-hidden">
                                <span className="block break-words text-sm font-medium leading-5">
                                  {person.name}
                                </span>
                                <span
                                  className={
                                    person.available
                                      ? "block text-xs text-emerald-300/65"
                                      : "block text-xs text-red-300/70"
                                  }
                                >
                                  {availabilityLabel(person)}
                                </span>
                              </span>
                            </label>
                          );
                        })
                      )}
                    </div>
                  </div>

                  {assignments["LOGS TEAM"].length > 0 && (
                    <div className="mt-4 flex min-w-0 flex-wrap gap-2">
                      {assignments["LOGS TEAM"].map((name) => (
                        <Badge
                          key={name}
                          variant="secondary"
                          className="max-w-full whitespace-normal wrap-break-word py-1.5 h-auto"
                        >
                          {name}
                        </Badge>
                      ))}
                    </div>
                  )}
                </CardContent>
                <Separator className="bg-white/8" />
                <CardFooter className="flex flex-col gap-4 bg-white/[0.02] sm:flex-row sm:justify-between">
                  <p className="text-sm text-white/45">
                    <span className="font-semibold text-white">
                      {assignments["LOGS TEAM"].length}
                    </span>{" "}
                    logs team member
                    {assignments["LOGS TEAM"].length === 1 ? "" : "s"} selected
                  </p>
                  <div className="flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row">
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={() => setShowClearDialog(true)}
                      disabled={
                        !selectedDate || isLoadingData || isSaving || isClearing
                      }
                      className="h-11 w-full border-red-400/20 bg-red-500/5 px-5 text-red-200 hover:bg-red-500/10 hover:text-red-100 sm:w-auto"
                    >
                      <Trash2 />
                      Clear assignments
                    </Button>
                    <Button
                      onClick={saveDutyAssignments}
                      disabled={
                        !canSave || isSaving || isClearing || isLoadingData
                      }
                      className="h-11 w-full bg-[#c8a97e] px-6 text-[#10110e] hover:bg-[#d4b98f] sm:w-auto"
                    >
                      {isSaving ? (
                        <RefreshCw className="animate-spin" />
                      ) : (
                        <ClipboardCheck />
                      )}
                      {isSaving ? "Saving…" : "Save assignments"}
                    </Button>
                  </div>
                </CardFooter>
              </Card>
            </CardContent>
          ) : (
            <CardContent className="flex min-h-72 items-center justify-center text-sm text-white/35">
              Select a month sheet to begin.
            </CardContent>
          )}
        </Card>
      </div>

      <Dialog open={showClearDialog} onOpenChange={setShowClearDialog}>
        <DialogContent className="border border-white/10 bg-[#151815] text-white">
          <DialogHeader>
            <DialogTitle>Clear this date&apos;s assignments?</DialogTitle>
            <DialogDescription className="leading-6 text-white/50">
              This removes every duty assignment and the logistics group from{" "}
              {monthData?.dates.find((date) => date.iso === selectedDate)
                ?.label ?? selectedDate}
              .
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="border-white/8 bg-white/[0.02]">
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={isClearing}>
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="button"
              variant="destructive"
              onClick={clearDutyAssignments}
              disabled={isClearing}
            >
              {isClearing ? <RefreshCw className="animate-spin" /> : <Trash2 />}
              {isClearing ? "Clearing…" : "Clear assignments"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}

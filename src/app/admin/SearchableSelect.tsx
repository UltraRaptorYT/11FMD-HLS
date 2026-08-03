"use client";

import { useState } from "react";
import { ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export type SearchableOption = {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
};

export default function SearchableSelect({
  value,
  options,
  onValueChange,
  placeholder,
  searchPlaceholder = "Search…",
  emptyMessage = "No results found.",
  disabled,
  className,
}: {
  value: string;
  options: SearchableOption[];
  onValueChange: (value: string) => void;
  placeholder: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const selected = options.find((option) => option.value === value);
  const normalizedSearch = search.trim().toLowerCase();
  const filteredOptions = normalizedSearch
    ? options.filter((option) =>
        `${option.label} ${option.description ?? ""}`
          .toLowerCase()
          .includes(normalizedSearch),
      )
    : options;

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) setSearch("");
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "min-h-11 h-auto w-full justify-between gap-3 border-white/10 bg-[#0b0d0b] px-3 py-2 text-left text-sm font-normal whitespace-normal hover:bg-white/5",
            className,
          )}
        >
          <span
            className={cn(
              "min-w-0 flex-1 break-words",
              !selected && "text-white/35",
            )}
          >
            {selected?.label ?? placeholder}
          </span>
          <ChevronsUpDown className="size-4 shrink-0 text-white/35" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={4}
        className="w-[var(--radix-popover-trigger-width)] min-w-64 overflow-hidden rounded-xl border border-[#2a2a2a] bg-[#1a1a1a] p-0 shadow-2xl"
      >
        <div className="p-2">
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={searchPlaceholder}
            className="w-full rounded-lg border border-[#333] bg-[#0f0f0f] px-3 py-2 text-sm text-white outline-none placeholder:text-neutral-600"
            autoFocus
          />
        </div>

        <div className="max-h-48 overflow-y-auto">
          {filteredOptions.length === 0 ? (
            <div className="px-4 py-3 text-sm text-[#666]">
              {emptyMessage}
            </div>
          ) : (
            filteredOptions.map((option) => {
              const isSelected = option.value === value;

              return (
                <button
                  key={option.value}
                  type="button"
                  disabled={option.disabled}
                  className={cn(
                    "w-full px-4 py-2.5 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                    isSelected
                      ? "bg-[#252525] text-white"
                      : "text-neutral-400 hover:bg-[#202020] hover:text-white",
                  )}
                  onClick={() => {
                    onValueChange(option.value);
                    setOpen(false);
                    setSearch("");
                  }}
                >
                  <span className="block break-words leading-5">
                    {option.label}
                  </span>
                  {option.description && (
                    <span className="mt-0.5 block break-words text-xs text-neutral-600">
                      {option.description}
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

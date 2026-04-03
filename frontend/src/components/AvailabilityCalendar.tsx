"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { toast } from "@/hooks/use-toast";

interface AvailabilityCalendarProps {
  joinToken: string;
  trip: {
    id: string;
    travel_from: string | null;
    travel_to: string | null;
    deadline: string | null;
  };
  members: Array<{ id: string; display_name: string }>;
  availSlots: Array<{ member_id: string; slot_date: string; tier: string }>;
  currentMemberId: string | null;
  isOrganiser: boolean;
  onTripUpdated: () => void;
  availabilityDeadline?: { due_date: string; locked: boolean } | null;
}

type Tier = "free" | "could_work" | "unavailable";

const TIER_CYCLE: Array<Tier | null> = ["free", "could_work", "unavailable", null];

const DAY_HEADERS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const FULL_MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const MEMBER_COLOURS = [
  { bg: "rgba(212, 144, 10, 0.25)", border: "#D4900A", label: "Amber" },
  { bg: "rgba(58, 125, 92, 0.25)", border: "#3A7D5C", label: "Green" },
  { bg: "rgba(196, 97, 74, 0.25)", border: "#C4614A", label: "Terra" },
  { bg: "rgba(99, 102, 241, 0.25)", border: "#6366F1", label: "Indigo" },
  { bg: "rgba(236, 72, 153, 0.25)", border: "#EC4899", label: "Pink" },
  { bg: "rgba(14, 165, 233, 0.25)", border: "#0EA5E9", label: "Sky" },
  { bg: "rgba(168, 85, 247, 0.25)", border: "#A855F7", label: "Purple" },
  { bg: "rgba(34, 197, 94, 0.25)", border: "#22C55E", label: "Lime" },
];

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatDateDisplay(d: string): string {
  return new Date(d).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfWeek(year: number, month: number): number {
  // 0=Sun, convert so Mon=0
  const day = new Date(year, month, 1).getDay();
  return day === 0 ? 6 : day - 1;
}

export default function AvailabilityCalendar({
  joinToken,
  trip,
  members,
  availSlots,
  currentMemberId,
  isOrganiser,
  onTripUpdated,
  availabilityDeadline,
}: AvailabilityCalendarProps) {
  const [localSlots, setLocalSlots] = useState<
    Array<{ member_id: string; slot_date: string; tier: string }>
  >(availSlots);

  const [deadlineValue, setDeadlineValue] = useState<string>(
    trip.deadline ?? ""
  );

  // Travel date editing state
  const [travelFrom, setTravelFrom] = useState<string>(trip.travel_from ?? "");
  const [travelTo, setTravelTo] = useState<string>(trip.travel_to ?? "");
  const dateDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Month navigation
  const [currentMonth, setCurrentMonth] = useState(() => {
    const anchor = trip.travel_from
      ? new Date(trip.travel_from + "T00:00:00")
      : new Date();
    return new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  });

  // Re-anchor when travel_from changes
  useEffect(() => {
    if (trip.travel_from) {
      const d = new Date(trip.travel_from + "T00:00:00");
      setCurrentMonth(new Date(d.getFullYear(), d.getMonth(), 1));
    }
  }, [trip.travel_from]);

  // Sync travel dates from props
  useEffect(() => {
    setTravelFrom(trip.travel_from ?? "");
    setTravelTo(trip.travel_to ?? "");
  }, [trip.travel_from, trip.travel_to]);

  // Keep local slots in sync
  useEffect(() => {
    setLocalSlots(availSlots);
  }, [availSlots]);

  // Member colour map (deterministic by member order)
  const memberColourMap = useMemo(
    () =>
      new Map(
        members.map((m, i) => [m.id, MEMBER_COLOURS[i % MEMBER_COLOURS.length]])
      ),
    [members]
  );

  // Build lookup: date string -> array of { member_id, tier }
  const slotsByDate = useMemo(() => {
    const map = new Map<string, Array<{ member_id: string; tier: string }>>();
    for (const slot of localSlots) {
      const key = slot.slot_date;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push({ member_id: slot.member_id, tier: slot.tier });
    }
    return map;
  }, [localSlots]);

  // Submitted member IDs
  const submittedMemberIds = useMemo(() => {
    const ids = new Set<string>();
    for (const slot of localSlots) ids.add(slot.member_id);
    return ids;
  }, [localSlots]);

  const submittedCount = submittedMemberIds.size;

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  // Travel window range for highlighting
  const travelRange = useMemo(() => {
    if (!trip.travel_from || !trip.travel_to) return null;
    return {
      from: trip.travel_from,
      to: trip.travel_to,
    };
  }, [trip.travel_from, trip.travel_to]);

  // Build calendar days for current month
  const calendarCells = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const daysInMonth = getDaysInMonth(year, month);
    const firstDow = getFirstDayOfWeek(year, month);

    const cells: Array<{ date: Date; inMonth: boolean } | null> = [];

    // Leading empties
    for (let i = 0; i < firstDow; i++) cells.push(null);

    // Days in month
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ date: new Date(year, month, d), inMonth: true });
    }

    // Trailing empties to fill last row
    while (cells.length % 7 !== 0) cells.push(null);

    return cells;
  }, [currentMonth]);

  const handleCellTap = useCallback(
    async (date: Date) => {
      if (!currentMemberId) return;

      const key = dateKey(date);
      const existing = localSlots.find(
        (s) => s.member_id === currentMemberId && s.slot_date === key
      );

      const currentTier: Tier | null = existing
        ? (existing.tier as Tier)
        : null;
      const currentIndex = TIER_CYCLE.indexOf(currentTier);
      const nextTier = TIER_CYCLE[(currentIndex + 1) % TIER_CYCLE.length];

      const previousSlots = [...localSlots];

      if (nextTier === null) {
        setLocalSlots((prev) =>
          prev.filter(
            (s) => !(s.member_id === currentMemberId && s.slot_date === key)
          )
        );
      } else if (existing) {
        setLocalSlots((prev) =>
          prev.map((s) =>
            s.member_id === currentMemberId && s.slot_date === key
              ? { ...s, tier: nextTier }
              : s
          )
        );
      } else {
        setLocalSlots((prev) => [
          ...prev,
          { member_id: currentMemberId, slot_date: key, tier: nextTier },
        ]);
      }

      try {
        await api.post(
          `/api/trips/${joinToken}/availability`,
          { slot: { date: key, tier: nextTier } },
          joinToken
        );
      } catch {
        setLocalSlots(previousSlots);
        toast({
          title: "Failed to update availability",
          variant: "destructive",
        });
      }
    },
    [currentMemberId, localSlots, joinToken]
  );

  const handleDeadlineChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const newDate = e.target.value;
      setDeadlineValue(newDate);
      try {
        await api.patch(
          `/api/trips/${joinToken}`,
          { deadline: newDate || null },
          joinToken
        );
        onTripUpdated();
      } catch {
        setDeadlineValue(trip.deadline ?? "");
        toast({ title: "Failed to update deadline", variant: "destructive" });
      }
    },
    [joinToken, onTripUpdated, trip.deadline]
  );

  const saveDate = useCallback(
    async (from: string, to: string) => {
      if (!isOrganiser) return;
      try {
        await api.patch(
          `/api/trips/${joinToken}`,
          { travel_from: from || null, travel_to: to || null },
          joinToken
        );
        onTripUpdated();
      } catch {
        toast({ title: "Failed to save dates", variant: "destructive" });
      }
    },
    [isOrganiser, joinToken, onTripUpdated]
  );

  const handleDateChange = (field: "from" | "to", value: string) => {
    const newFrom = field === "from" ? value : travelFrom;
    const newTo = field === "to" ? value : travelTo;
    if (field === "from") setTravelFrom(value);
    else setTravelTo(value);

    if (dateDebounceRef.current) clearTimeout(dateDebounceRef.current);
    dateDebounceRef.current = setTimeout(() => saveDate(newFrom, newTo), 800);
  };

  useEffect(() => {
    return () => {
      if (dateDebounceRef.current) clearTimeout(dateDebounceRef.current);
    };
  }, []);

  // Navigation
  const prevMonth = () =>
    setCurrentMonth(
      (m) => new Date(m.getFullYear(), m.getMonth() - 1, 1)
    );
  const nextMonth = () =>
    setCurrentMonth(
      (m) => new Date(m.getFullYear(), m.getMonth() + 1, 1)
    );

  function isInTravelRange(date: Date): boolean {
    if (!travelRange) return false;
    const key = dateKey(date);
    return key >= travelRange.from && key <= travelRange.to;
  }

  function renderStrips(date: Date) {
    const key = dateKey(date);
    const entries = slotsByDate.get(key);
    if (!entries || entries.length === 0) return null;

    return (
      <div className="flex flex-col gap-[2px] w-full mt-auto">
        {entries.slice(0, 6).map((entry, i) => {
          const colour = memberColourMap.get(entry.member_id);
          if (!colour) return null;

          const isCurrentUser = entry.member_id === currentMemberId;
          const opacity =
            entry.tier === "free" ? 1 : entry.tier === "could_work" ? 0.6 : 1;

          return (
            <div
              key={`${entry.member_id}-${i}`}
              className={cn(
                "h-1 rounded-[1px] w-full",
                isCurrentUser && "ring-1 ring-amber ring-offset-0",
                entry.tier === "unavailable" &&
                  "bg-[repeating-linear-gradient(135deg,transparent,transparent_2px,currentColor_2px,currentColor_3px)]"
              )}
              style={
                entry.tier === "unavailable"
                  ? { color: colour.border, opacity: 0.5 }
                  : { backgroundColor: colour.border, opacity }
              }
            />
          );
        })}
      </div>
    );
  }

  return (
    <div className="bg-surface border border-b-subtle rounded-[4px] p-6">
      <h2 className="font-display text-2xl font-bold text-t-primary mb-1">
        When can everyone go?
      </h2>

      {/* Travel dates — organiser sets, everyone sees */}
      <div className="mb-6">
        <p className="font-ui text-xs text-t-tertiary uppercase tracking-wider mb-3">
          When are you travelling?
        </p>
        {isOrganiser ? (
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="font-ui text-xs text-t-secondary block mb-1">
                From
              </label>
              <input
                type="date"
                value={travelFrom}
                onChange={(e) => handleDateChange("from", e.target.value)}
                className="w-full h-10 px-3 bg-surface border border-b-mid rounded-[4px] font-mono text-sm text-t-primary focus:outline-none focus:border-amber transition-colors"
              />
            </div>
            <div className="flex-1">
              <label className="font-ui text-xs text-t-secondary block mb-1">
                To
              </label>
              <input
                type="date"
                value={travelTo}
                min={travelFrom}
                onChange={(e) => handleDateChange("to", e.target.value)}
                className="w-full h-10 px-3 bg-surface border border-b-mid rounded-[4px] font-mono text-sm text-t-primary focus:outline-none focus:border-amber transition-colors"
              />
            </div>
          </div>
        ) : (
          <p className="font-mono text-sm text-t-primary">
            {trip.travel_from && trip.travel_to ? (
              `${formatDateDisplay(trip.travel_from)} → ${formatDateDisplay(trip.travel_to)}`
            ) : (
              <span className="text-t-tertiary">Dates not set yet</span>
            )}
          </p>
        )}
      </div>

      {/* Tap instruction */}
      <p className="font-ui text-xs text-t-tertiary mb-4">
        Tap to cycle:{" "}
        <span className="text-green">free</span>
        {" / "}
        <span className="text-amber">could work</span>
        {" / "}
        <span className="text-terra">unavailable</span>
        {" / "}
        <span>clear</span>
      </p>

      {/* Month navigation */}
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={prevMonth}
          className="h-9 w-9 flex items-center justify-center rounded-[4px] border border-b-mid text-t-secondary hover:bg-hover transition-colors cursor-pointer"
        >
          ←
        </button>
        <span className="font-display text-xl text-t-primary">
          {FULL_MONTH_NAMES[currentMonth.getMonth()]} {currentMonth.getFullYear()}
        </span>
        <button
          onClick={nextMonth}
          className="h-9 w-9 flex items-center justify-center rounded-[4px] border border-b-mid text-t-secondary hover:bg-hover transition-colors cursor-pointer"
        >
          →
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7">
        {DAY_HEADERS.map((day) => (
          <div
            key={day}
            className="font-ui text-xs text-t-tertiary text-center py-1"
          >
            {day}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7">
        {calendarCells.map((cell, i) => {
          if (!cell) {
            return <div key={`empty-${i}`} className="min-h-[52px] sm:min-h-[52px]" />;
          }

          const { date } = cell;
          const key = dateKey(date);
          const isPast = date < today;
          const inRange = isInTravelRange(date);
          const myEntry = currentMemberId
            ? localSlots.find(
                (s) => s.member_id === currentMemberId && s.slot_date === key
              )
            : null;

          return (
            <button
              key={key}
              type="button"
              disabled={isPast}
              onClick={() => {
                if (!isPast) handleCellTap(date);
              }}
              className={cn(
                "min-h-[44px] sm:min-h-[52px] p-1 border border-b-subtle/50 flex flex-col items-start",
                "transition-colors rounded-[4px]",
                inRange && "bg-[rgba(240,234,214,0.06)]",
                myEntry && "ring-1 ring-inset ring-amber/40",
                isPast
                  ? "opacity-30 cursor-not-allowed"
                  : "cursor-pointer hover:bg-hover"
              )}
            >
              <span className="font-mono text-xs text-t-primary leading-tight">
                {date.getDate()}
              </span>
              {renderStrips(date)}
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-4 pt-4 border-t border-b-subtle">
        <div className="flex flex-wrap gap-x-4 gap-y-1 mb-2">
          {members.map((m) => {
            const colour = memberColourMap.get(m.id);
            if (!colour) return null;
            return (
              <div key={m.id} className="flex items-center gap-1.5">
                <div
                  className="w-3 h-3 rounded-[2px]"
                  style={{ backgroundColor: colour.border }}
                />
                <span className="font-ui text-xs text-t-secondary">
                  {m.display_name}
                </span>
              </div>
            );
          })}
        </div>
        <div className="flex gap-4">
          <span className="font-ui text-xs text-t-tertiary">
            ██ Free
          </span>
          <span className="font-ui text-xs text-t-tertiary">
            ▒▒ Could work
          </span>
          <span className="font-ui text-xs text-t-tertiary">
            ╳╳ Unavailable
          </span>
        </div>
      </div>

      {/* Confirm by / Progress */}
      <div className="mt-4 pt-4 border-t border-b-subtle">
        {isOrganiser ? (
          <div className="flex items-center gap-3 mb-3">
            <span className="font-ui text-sm text-t-secondary">
              Confirm availability by
            </span>
            <input
              type="date"
              value={deadlineValue}
              onChange={handleDeadlineChange}
              className="h-9 px-3 bg-surface border border-b-mid rounded-[4px] font-mono text-sm text-t-primary focus:outline-none focus:border-t-secondary"
            />
          </div>
        ) : trip.deadline ? (
          <p className="font-ui text-sm text-t-secondary mb-3">
            Deadline:{" "}
            {new Date(trip.deadline).toLocaleDateString("en-IN", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </p>
        ) : null}

        {/* Progress bar */}
        <div className="flex gap-1 mb-2">
          {members.map((m) => {
            const hasSubmitted = submittedMemberIds.has(m.id);
            return (
              <div
                key={m.id}
                className={cn(
                  "h-2 flex-1 rounded-full transition-all",
                  hasSubmitted ? "bg-amber" : "border border-b-mid"
                )}
              />
            );
          })}
        </div>
        <p className="font-ui text-xs text-t-tertiary">
          {submittedCount} of {members.length} submitted availability
        </p>
      </div>

      {/* Inline deadline */}
      {availabilityDeadline &&
        !availabilityDeadline.locked &&
        (() => {
          const now = new Date();
          now.setHours(0, 0, 0, 0);
          const days = Math.ceil(
            (new Date(availabilityDeadline.due_date).getTime() -
              now.getTime()) /
              86400000
          );
          return (
            <p
              className={cn(
                "font-ui text-xs mt-4",
                days <= 2 ? "text-terra" : "text-t-tertiary"
              )}
            >
              {days <= 0
                ? "⚠ Deadline passed"
                : `Submit availability by ${new Date(availabilityDeadline.due_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`}
            </p>
          );
        })()}
    </div>
  );
}

"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { toast } from "@/hooks/use-toast";

interface AIWindow {
  start_date: string;
  end_date: string;
  nights: number;
  summary: string;
  stretching_members?: string[];
  unavailable_members?: string[];
}

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
  travelWindows?: { windows: AIWindow[] } | null;
}

type Tier = "free" | "could_work" | "unavailable";
type PickableTier = Tier | "clear";

const DAY_HEADERS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const FULL_MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
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

const TIER_LABELS: Record<PickableTier, string> = {
  free: "Free",
  could_work: "Could work",
  unavailable: "Unavailable",
  clear: "Clear",
};

const TIER_COLORS: Record<PickableTier, string> = {
  free: "text-accent-green border-accent-green bg-accent-green/10",
  could_work: "text-accent-amber border-accent-amber bg-accent-amber/10",
  unavailable: "text-accent-terra border-accent-terra bg-accent-terra/10",
  clear: "text-t-secondary border-b-mid bg-transparent",
};

const TIER_INACTIVE: Record<PickableTier, string> = {
  free: "text-t-secondary border-b-mid hover:border-accent-green/40",
  could_work: "text-t-secondary border-b-mid hover:border-accent-amber/40",
  unavailable: "text-t-secondary border-b-mid hover:border-accent-terra/40",
  clear: "text-t-tertiary border-b-subtle hover:border-b-mid",
};

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfWeek(year: number, month: number): number {
  const day = new Date(year, month, 1).getDay();
  return day === 0 ? 6 : day - 1;
}

function getDateRange(startKey: string, endKey: string): string[] {
  const dates: string[] = [];
  const startDate = new Date(startKey + "T00:00:00");
  const endDate = new Date(endKey + "T00:00:00");
  const [from, to] =
    startDate <= endDate ? [startDate, endDate] : [endDate, startDate];
  const current = new Date(from);
  while (current <= to) {
    dates.push(dateKey(current));
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

interface OverlapWindow {
  start: string;
  end: string;
  days: number;
  memberCount: number;
  totalMembers: number;
}

function computeOverlapWindows(
  availSlots: Array<{ member_id: string; slot_date: string; tier: string }>
): OverlapWindow[] {
  const submittedIds = new Set<string>();
  for (const slot of availSlots) submittedIds.add(slot.member_id);
  const submittedCount = submittedIds.size;
  if (submittedCount === 0) return [];

  const threshold = Math.max(2, Math.ceil(submittedCount * 0.5));
  const dateAvailCount = new Map<string, number>();
  const dateMemberSeen = new Map<string, Set<string>>();

  for (const slot of availSlots) {
    if (slot.tier !== "free" && slot.tier !== "could_work") continue;
    if (!dateMemberSeen.has(slot.slot_date)) {
      dateMemberSeen.set(slot.slot_date, new Set());
    }
    const seen = dateMemberSeen.get(slot.slot_date)!;
    if (!seen.has(slot.member_id)) {
      seen.add(slot.member_id);
      dateAvailCount.set(
        slot.slot_date,
        (dateAvailCount.get(slot.slot_date) ?? 0) + 1
      );
    }
  }

  const qualifyingDates = Array.from(dateAvailCount.entries())
    .filter(([, count]) => count >= threshold)
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  if (qualifyingDates.length === 0) return [];

  const windows: OverlapWindow[] = [];
  let windowStart = qualifyingDates[0];
  let windowEnd = qualifyingDates[0];
  let minCount = qualifyingDates[0].count;

  for (let i = 1; i < qualifyingDates.length; i++) {
    const prev = new Date(qualifyingDates[i - 1].date + "T00:00:00");
    const curr = new Date(qualifyingDates[i].date + "T00:00:00");
    const diffDays = (curr.getTime() - prev.getTime()) / 86400000;

    if (diffDays === 1) {
      windowEnd = qualifyingDates[i];
      minCount = Math.min(minCount, qualifyingDates[i].count);
    } else {
      const days =
        Math.round(
          (new Date(windowEnd.date + "T00:00:00").getTime() -
            new Date(windowStart.date + "T00:00:00").getTime()) /
            86400000
        ) + 1;
      if (days >= 2) {
        windows.push({
          start: windowStart.date,
          end: windowEnd.date,
          days,
          memberCount: minCount,
          totalMembers: submittedCount,
        });
      }
      windowStart = qualifyingDates[i];
      windowEnd = qualifyingDates[i];
      minCount = qualifyingDates[i].count;
    }
  }

  const days =
    Math.round(
      (new Date(windowEnd.date + "T00:00:00").getTime() -
        new Date(windowStart.date + "T00:00:00").getTime()) /
        86400000
    ) + 1;
  if (days >= 2) {
    windows.push({
      start: windowStart.date,
      end: windowEnd.date,
      days,
      memberCount: minCount,
      totalMembers: submittedCount,
    });
  }

  windows.sort(
    (a, b) => b.memberCount - a.memberCount || b.days - a.days
  );

  return windows;
}

function formatShortDate(d: string): string {
  return new Date(d + "T00:00:00").toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  });
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
  travelWindows,
}: AvailabilityCalendarProps) {
  const [localSlots, setLocalSlots] = useState<
    Array<{ member_id: string; slot_date: string; tier: string }>
  >(availSlots);

  const [deadlineValue, setDeadlineValue] = useState<string>(
    trip.deadline ?? ""
  );

  // New interaction model: tier picker + range selection
  const [selectedTier, setSelectedTier] = useState<PickableTier>("free");
  const [rangeMode, setRangeMode] = useState(false);
  const [rangeStart, setRangeStart] = useState<string | null>(null);

  // Month navigation
  const [currentMonth, setCurrentMonth] = useState(() => {
    const anchor = trip.travel_from
      ? new Date(trip.travel_from + "T00:00:00")
      : new Date();
    return new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  });

  useEffect(() => {
    if (trip.travel_from) {
      const d = new Date(trip.travel_from + "T00:00:00");
      setCurrentMonth(new Date(d.getFullYear(), d.getMonth(), 1));
    }
  }, [trip.travel_from]);

  useEffect(() => {
    setLocalSlots(availSlots);
  }, [availSlots]);

  const memberColourMap = useMemo(
    () =>
      new Map(
        members.map((m, i) => [
          m.id,
          MEMBER_COLOURS[i % MEMBER_COLOURS.length],
        ])
      ),
    [members]
  );

  const slotsByDate = useMemo(() => {
    const map = new Map<
      string,
      Array<{ member_id: string; tier: string }>
    >();
    for (const slot of localSlots) {
      const key = slot.slot_date;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push({ member_id: slot.member_id, tier: slot.tier });
    }
    return map;
  }, [localSlots]);

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

  const calendarCells = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const daysInMonth = getDaysInMonth(year, month);
    const firstDow = getFirstDayOfWeek(year, month);

    const cells: Array<{ date: Date; inMonth: boolean } | null> = [];
    for (let i = 0; i < firstDow; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ date: new Date(year, month, d), inMonth: true });
    }
    while (cells.length % 7 !== 0) cells.push(null);

    return cells;
  }, [currentMonth]);

  // Ref for pending API calls
  const pendingRef = useRef(false);

  // Apply tier to a list of date keys
  const applyTierToDates = useCallback(
    async (dateKeys: string[], tier: PickableTier) => {
      if (!currentMemberId || pendingRef.current) return;
      pendingRef.current = true;

      const apiTier: string | null = tier === "clear" ? null : tier;
      const previousSlots = [...localSlots];

      // Optimistic update
      setLocalSlots((prev) => {
        let slots = [...prev];
        for (const dk of dateKeys) {
          if (apiTier === null) {
            slots = slots.filter(
              (s) =>
                !(s.member_id === currentMemberId && s.slot_date === dk)
            );
          } else {
            const idx = slots.findIndex(
              (s) => s.member_id === currentMemberId && s.slot_date === dk
            );
            if (idx >= 0) {
              slots[idx] = { ...slots[idx], tier: apiTier };
            } else {
              slots.push({
                member_id: currentMemberId,
                slot_date: dk,
                tier: apiTier,
              });
            }
          }
        }
        return slots;
      });

      try {
        await Promise.all(
          dateKeys.map((dk) =>
            api.post(
              `/api/trips/${joinToken}/availability`,
              { slot: { date: dk, tier: apiTier } },
              joinToken
            )
          )
        );

        if (isOrganiser && submittedMemberIds.size >= 2) {
          api
            .post(
              `/api/trips/${joinToken}/availability/windows`,
              {},
              joinToken
            )
            .catch(() => {});
        }
      } catch {
        setLocalSlots(previousSlots);
        toast({
          title: "Couldn't save your dates — try again",
          variant: "destructive",
        });
      } finally {
        pendingRef.current = false;
      }
    },
    [
      currentMemberId,
      localSlots,
      joinToken,
      isOrganiser,
      submittedMemberIds,
    ]
  );

  const handleCellTap = useCallback(
    (date: Date) => {
      if (!currentMemberId) return;
      const key = dateKey(date);

      if (rangeMode && rangeStart) {
        // Second tap: apply range
        const range = getDateRange(rangeStart, key);
        applyTierToDates(range, selectedTier);
        setRangeStart(null);
        setRangeMode(false);
      } else if (rangeMode) {
        // First tap in range mode: set start
        setRangeStart(key);
        // Also apply tier to start date immediately
        applyTierToDates([key], selectedTier);
      } else {
        // Single tap mode: apply tier to one date
        applyTierToDates([key], selectedTier);
      }
    },
    [currentMemberId, rangeMode, rangeStart, selectedTier, applyTierToDates]
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
        toast({
          title: "Couldn't save the deadline",
          variant: "destructive",
        });
      }
    },
    [joinToken, onTripUpdated, trip.deadline]
  );

  const prevMonth = () =>
    setCurrentMonth(
      (m) => new Date(m.getFullYear(), m.getMonth() - 1, 1)
    );
  const nextMonth = () =>
    setCurrentMonth(
      (m) => new Date(m.getFullYear(), m.getMonth() + 1, 1)
    );

  const overlapWindows = useMemo(
    () => computeOverlapWindows(localSlots),
    [localSlots]
  );
  const topWindow = overlapWindows.length > 0 ? overlapWindows[0] : null;

  // Compute in-range dates for visual preview
  const rangePreviewSet = useMemo(() => {
    if (!rangeStart || !rangeMode) return new Set<string>();
    return new Set([rangeStart]);
  }, [rangeStart, rangeMode]);

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
            entry.tier === "free"
              ? 1
              : entry.tier === "could_work"
              ? 0.6
              : 1;

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

  // Get tier indicator color for a cell (current user's tier on that date)
  function getCellTierIndicator(key: string): string | null {
    if (!currentMemberId) return null;
    const entry = localSlots.find(
      (s) => s.member_id === currentMemberId && s.slot_date === key
    );
    if (!entry) return null;
    if (entry.tier === "free") return "ring-accent-green/50";
    if (entry.tier === "could_work") return "ring-accent-amber/50";
    if (entry.tier === "unavailable") return "ring-accent-terra/50";
    return null;
  }

  return (
    <div className="bg-surface border border-b-subtle rounded-[4px] p-6">
      <h2 className="font-display text-2xl font-bold text-t-primary mb-1 pr-8">
        When can everyone go?
      </h2>

      {/* ─── Tier Picker ─── */}
      <div className="mb-4">
        <p className="font-ui text-xs text-t-tertiary mb-2">
          Select a status, then tap dates to mark them
        </p>
        <div className="flex flex-wrap gap-2 items-center">
          {(["free", "could_work", "unavailable", "clear"] as PickableTier[]).map(
            (tier) => (
              <button
                key={tier}
                type="button"
                onClick={() => {
                  setSelectedTier(tier);
                  // Exit range mode if switching tier
                  if (rangeStart) {
                    setRangeStart(null);
                    setRangeMode(false);
                  }
                }}
                className={cn(
                  "h-9 px-3 rounded-[4px] border font-ui text-xs transition-all cursor-pointer",
                  selectedTier === tier
                    ? TIER_COLORS[tier]
                    : TIER_INACTIVE[tier]
                )}
              >
                {TIER_LABELS[tier]}
              </button>
            )
          )}

          <div className="w-px h-6 bg-[var(--border-subtle)] mx-1" />

          {/* Range select toggle */}
          <button
            type="button"
            onClick={() => {
              if (rangeMode) {
                setRangeMode(false);
                setRangeStart(null);
              } else {
                setRangeMode(true);
              }
            }}
            className={cn(
              "h-9 px-3 rounded-[4px] border font-ui text-xs transition-all cursor-pointer",
              rangeMode
                ? "border-accent-amber bg-accent-amber/10 text-accent-amber"
                : "border-b-mid text-t-secondary hover:border-b-strong"
            )}
          >
            {rangeMode
              ? rangeStart
                ? "Tap end date"
                : "Tap start date"
              : "Range select"}
          </button>
        </div>
      </div>

      {/* Month navigation */}
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={prevMonth}
          aria-label="Previous month"
          className="h-9 w-9 flex items-center justify-center rounded-[4px] border border-b-mid text-t-secondary hover:bg-hover transition-colors cursor-pointer"
        >
          ←
        </button>
        <span className="font-display text-xl text-t-primary">
          {FULL_MONTH_NAMES[currentMonth.getMonth()]}{" "}
          {currentMonth.getFullYear()}
        </span>
        <button
          onClick={nextMonth}
          aria-label="Next month"
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
            return (
              <div
                key={`empty-${i}`}
                className="min-h-[52px] sm:min-h-[52px]"
              />
            );
          }

          const { date } = cell;
          const key = dateKey(date);
          const isPast = date < today;
          const isInTopWindow = topWindow
            ? key >= topWindow.start && key <= topWindow.end
            : false;
          const tierRing = getCellTierIndicator(key);
          const isRangeStart = rangePreviewSet.has(key);

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
                "transition-all rounded-[4px]",
                isInTopWindow && "bg-[rgba(58,125,92,0.08)]",
                tierRing && `ring-1 ring-inset ${tierRing}`,
                isRangeStart &&
                  "ring-2 ring-inset ring-accent-amber shadow-sm",
                isPast
                  ? "opacity-30 cursor-not-allowed"
                  : "cursor-pointer hover:bg-hover active:scale-[0.96]"
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

      {/* Overlap windows */}
      <div className="mt-4 pt-4 border-t border-b-subtle">
        {submittedCount === 0 ? (
          <p className="font-ui text-sm text-t-tertiary">
            Mark your free dates above to see when the group can go.
          </p>
        ) : overlapWindows.length === 0 ? (
          <p className="font-ui text-sm text-t-tertiary">
            No overlapping dates yet — keep adding availability.
          </p>
        ) : (
          <div className="space-y-2">
            <p className="font-ui text-xs text-t-tertiary uppercase tracking-wider mb-2">
              Best windows
            </p>
            {overlapWindows.map((w, i) => (
              <div
                key={`${w.start}-${w.end}`}
                className={cn(
                  "flex items-baseline justify-between font-ui text-sm",
                  i === 0 ? "text-accent-green" : "text-t-secondary"
                )}
              >
                <span>
                  {formatShortDate(w.start)} – {formatShortDate(w.end)}{" "}
                  <span className="text-xs opacity-70">
                    ({w.days} days)
                  </span>
                </span>
                <span className="text-xs">
                  {w.memberCount} of {w.totalMembers} can make it
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* AI Suggested Windows */}
      {travelWindows?.windows && travelWindows.windows.length > 0 && (
        <div className="mt-4 pt-4 border-t border-b-subtle">
          <p className="font-ui text-xs text-t-tertiary uppercase tracking-wider mb-3">
            AI suggested windows
          </p>
          <div className="space-y-3">
            {travelWindows.windows.map((w: AIWindow, i: number) => (
              <div
                key={`${w.start_date}-${w.end_date}`}
                className={cn(
                  "p-3 rounded-[4px] bg-[rgba(240,234,214,0.03)]",
                  i === 0 && "border-l-2 border-l-accent-amber"
                )}
              >
                <div className="flex items-baseline justify-between">
                  <span className="font-mono text-sm text-t-primary">
                    {formatShortDate(w.start_date)} –{" "}
                    {formatShortDate(w.end_date)}
                  </span>
                  <span className="font-ui text-xs text-t-tertiary">
                    {w.nights} night{w.nights !== 1 ? "s" : ""}
                  </span>
                </div>
                {w.summary && (
                  <p className="font-ui text-xs text-t-secondary mt-1">
                    {w.summary}
                  </p>
                )}
                {w.stretching_members &&
                  w.stretching_members.length > 0 && (
                    <p className="font-ui text-xs text-amber mt-1">
                      Stretching: {w.stretching_members.join(", ")}
                    </p>
                  )}
                {w.unavailable_members &&
                  w.unavailable_members.length > 0 && (
                    <p className="font-ui text-xs text-terra mt-1">
                      Unavailable: {w.unavailable_members.join(", ")}
                    </p>
                  )}
              </div>
            ))}
          </div>
          {isOrganiser && (
            <button
              type="button"
              onClick={() => {
                api
                  .post(
                    `/api/trips/${joinToken}/availability/windows`,
                    {},
                    joinToken
                  )
                  .then(() => onTripUpdated())
                  .catch(() =>
                    toast({
                      title: "Couldn't refresh best travel dates",
                      variant: "destructive",
                    })
                  );
              }}
              className="font-ui text-xs text-t-tertiary hover:text-t-secondary mt-3 cursor-pointer transition-colors"
            >
              Refresh
            </button>
          )}
        </div>
      )}

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
                <span className="font-ui text-xs text-t-secondary truncate max-w-[100px]">
                  {m.display_name}
                </span>
              </div>
            );
          })}
        </div>
        <div className="flex gap-4">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-1 rounded-[1px] bg-t-secondary" />
            <span className="font-ui text-xs text-t-tertiary">Free</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-1 rounded-[1px] bg-t-secondary opacity-50" />
            <span className="font-ui text-xs text-t-tertiary">
              Could work
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-1 rounded-[1px] bg-[repeating-linear-gradient(135deg,transparent,transparent_1px,var(--text-secondary)_1px,var(--text-secondary)_2px)]" />
            <span className="font-ui text-xs text-t-tertiary">
              Unavailable
            </span>
          </div>
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
          const daysLeft = Math.ceil(
            (new Date(availabilityDeadline.due_date).getTime() -
              now.getTime()) /
              86400000
          );
          return (
            <p
              className={cn(
                "font-ui text-xs mt-4",
                daysLeft <= 2 ? "text-terra" : "text-t-tertiary"
              )}
            >
              {daysLeft <= 0
                ? "⚠ Deadline passed"
                : `Submit availability by ${new Date(availabilityDeadline.due_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`}
            </p>
          );
        })()}
    </div>
  );
}

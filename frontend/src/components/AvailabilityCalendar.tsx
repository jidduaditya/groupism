"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
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
    budget_min: number | null;
  };
  members: Array<{ id: string; display_name: string }>;
  availSlots: Array<{ member_id: string; slot_date: string; tier: string }>;
  currentMemberId: string | null;
  isOrganiser: boolean;
  onTripUpdated: () => void;
  disabled: boolean;
}

type Tier = "free" | "could_work" | "unavailable";

const TIER_CYCLE: Array<Tier | null> = ["free", "could_work", "unavailable", null];

const DAY_HEADERS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
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
  disabled,
}: AvailabilityCalendarProps) {
  const [localSlots, setLocalSlots] = useState<
    Array<{ member_id: string; slot_date: string; tier: string }>
  >(availSlots);

  const [deadlineValue, setDeadlineValue] = useState<string>(
    trip.deadline ?? ""
  );

  // Keep local slots in sync with prop updates from parent
  useEffect(() => {
    setLocalSlots(availSlots);
  }, [availSlots]);

  // Build the 42-day grid
  const calendarDays = useMemo(() => {
    const anchor = trip.travel_from
      ? new Date(trip.travel_from + "T00:00:00")
      : new Date();
    const weekStart = getWeekStart(anchor);
    // Go back 1 week for context
    weekStart.setDate(weekStart.getDate() - 7);

    const days: Date[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      days.push(d);
    }
    return days;
  }, [trip.travel_from]);

  // Build lookup: date string -> array of { member_id, tier }
  const slotsByDate = useMemo(() => {
    const map = new Map<string, Array<{ member_id: string; tier: string }>>();
    for (const slot of localSlots) {
      const key = slot.slot_date;
      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key)!.push({ member_id: slot.member_id, tier: slot.tier });
    }
    return map;
  }, [localSlots]);

  // Submitted member IDs
  const submittedMemberIds = useMemo(() => {
    const ids = new Set<string>();
    for (const slot of localSlots) {
      ids.add(slot.member_id);
    }
    return ids;
  }, [localSlots]);

  const submittedCount = submittedMemberIds.size;

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

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

      // Optimistic update
      const previousSlots = [...localSlots];

      if (nextTier === null) {
        // Remove the entry
        setLocalSlots((prev) =>
          prev.filter(
            (s) => !(s.member_id === currentMemberId && s.slot_date === key)
          )
        );
      } else if (existing) {
        // Update existing
        setLocalSlots((prev) =>
          prev.map((s) =>
            s.member_id === currentMemberId && s.slot_date === key
              ? { ...s, tier: nextTier }
              : s
          )
        );
      } else {
        // Add new
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
        // Revert on error
        setLocalSlots(previousSlots);
        toast({
          title: "Failed to update availability",
          description: "Please try again.",
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
        toast({
          title: "Failed to update deadline",
          description: "Please try again.",
          variant: "destructive",
        });
      }
    },
    [joinToken, onTripUpdated, trip.deadline]
  );

  function getCellBg(date: Date): string {
    if (!currentMemberId) return "bg-transparent";
    const key = dateKey(date);
    const entry = localSlots.find(
      (s) => s.member_id === currentMemberId && s.slot_date === key
    );
    if (!entry) return "bg-transparent";
    switch (entry.tier) {
      case "free":
        return "bg-green/5";
      case "could_work":
        return "bg-amber/5";
      case "unavailable":
        return "bg-terra/5";
      default:
        return "bg-transparent";
    }
  }

  function renderDots(date: Date) {
    const key = dateKey(date);
    const entries = slotsByDate.get(key);
    if (!entries || entries.length === 0) return null;

    const visible = entries.slice(0, 4);
    const overflow = entries.length - 4;

    return (
      <div className="flex flex-wrap gap-0.5 justify-center mt-0.5">
        {visible.map((entry, i) => {
          const dotColor =
            entry.tier === "free"
              ? "bg-green"
              : entry.tier === "could_work"
                ? "bg-amber"
                : "bg-terra";

          const isCurrentUser = entry.member_id === currentMemberId;

          return (
            <div
              key={`${entry.member_id}-${i}`}
              className={cn(
                "w-2 h-2 rounded-full",
                dotColor,
                isCurrentUser && "ring-1 ring-t-primary"
              )}
            />
          );
        })}
        {overflow > 0 && (
          <span className="font-mono text-[10px] text-t-tertiary leading-none">
            +{overflow}
          </span>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "bg-surface border border-b-subtle rounded-[4px] p-6 transition-opacity",
        disabled && "opacity-40 pointer-events-none select-none"
      )}
    >
      <h2 className="font-display text-2xl font-bold text-t-primary mb-1">
        When can everyone go?
      </h2>
      {disabled && (
        <p className="font-ui text-sm text-t-tertiary mb-4">
          Set a budget first
        </p>
      )}

      {!disabled && (
        <>
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
            {calendarDays.map((date) => {
              const key = dateKey(date);
              const isPast = date < today;
              const isFirstOfMonth = date.getDate() === 1;

              return (
                <button
                  key={key}
                  type="button"
                  disabled={isPast}
                  onClick={() => {
                    if (!isPast) handleCellTap(date);
                  }}
                  className={cn(
                    "min-h-[44px] min-w-[44px] p-1 border border-b-subtle/50 flex flex-col items-center",
                    "transition-colors rounded-[4px]",
                    getCellBg(date),
                    isPast
                      ? "opacity-30 cursor-not-allowed"
                      : "cursor-pointer hover:bg-hover"
                  )}
                >
                  <span className="font-mono text-xs text-t-primary">
                    {date.getDate()}
                  </span>
                  {isFirstOfMonth && (
                    <span className="text-[10px] opacity-60 font-ui leading-none">
                      {MONTH_NAMES[date.getMonth()]}
                    </span>
                  )}
                  {renderDots(date)}
                </button>
              );
            })}
          </div>

          {/* ConfirmByBar */}
          <div className="mt-6 pt-6 border-t border-b-subtle">
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
                Deadline: {formatDate(trip.deadline)}
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
        </>
      )}
    </div>
  );
}

import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface AvailabilityInputProps {
  joinToken: string;
  tripFrom?: string;
  tripTo?: string;
  onSubmitted: () => void;
}

type Tier = "none" | "free" | "could_work" | "unavailable";

const TIER_CYCLE: Tier[] = ["none", "free", "could_work", "unavailable"];

const TIER_COLORS: Record<Tier, string> = {
  none: "bg-elevated text-t-tertiary",
  free: "bg-green/20 text-green border border-green/30",
  could_work: "bg-amber-light/30 text-amber border border-amber/30",
  unavailable: "bg-terra/15 text-terra border border-terra/30",
};

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatMonthLabel(date: Date): string {
  return date.toLocaleDateString("en-IN", { month: "short" });
}

function formatDayNum(date: Date): string {
  return String(date.getDate());
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

const AvailabilityInput = ({ joinToken, tripFrom, tripTo, onSubmitted }: AvailabilityInputProps) => {
  const [slots, setSlots] = useState<Record<string, Tier>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Generate 6 weeks of dates centered on trip dates or starting from today
  const calendarDays = useMemo(() => {
    const center = tripFrom ? new Date(tripFrom) : new Date();
    const start = getWeekStart(center);
    // Go back 1 week to provide context
    start.setDate(start.getDate() - 7);

    const days: Date[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      days.push(d);
    }
    return days;
  }, [tripFrom]);

  const toggleDay = (date: Date) => {
    const key = dateKey(date);
    const current = slots[key] || "none";
    const nextIdx = (TIER_CYCLE.indexOf(current) + 1) % TIER_CYCLE.length;
    const next = TIER_CYCLE[nextIdx];

    setSlots((prev) => {
      if (next === "none") {
        const { [key]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [key]: next };
    });
  };

  const handleSubmit = async () => {
    const slotsArray = Object.entries(slots)
      .filter(([_, tier]) => tier !== "none")
      .map(([date, tier]) => ({ date, tier }));

    if (slotsArray.length === 0) {
      toast({ title: "Mark at least one date", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      await api.post(`/api/trips/${joinToken}/availability`, { slots: slotsArray }, joinToken);
      setSubmitted(true);
      onSubmitted();
    } catch (err: any) {
      toast({ title: "Failed to save availability", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <p className="font-ui text-sm text-green flex items-center gap-2 py-4">
        <span>✓</span> Your availability saved
      </p>
    );
  }

  // Check if a date falls within trip date range
  const isInTripRange = (date: Date) => {
    if (!tripFrom || !tripTo) return false;
    const key = dateKey(date);
    return key >= tripFrom && key <= tripTo;
  };

  // Group by weeks for the grid
  const weeks: Date[][] = [];
  for (let i = 0; i < calendarDays.length; i += 7) {
    weeks.push(calendarDays.slice(i, i + 7));
  }

  return (
    <div className="py-4 space-y-4">
      <p className="font-ui text-xs text-t-tertiary">
        Tap to cycle: <span className="text-green">free</span> → <span className="text-amber">could work</span> → <span className="text-terra">unavailable</span> → clear
      </p>

      {/* Day headers */}
      <div className="grid grid-cols-7 gap-1">
        {DAY_LABELS.map((day) => (
          <div key={day} className="text-center font-ui text-xs text-t-tertiary py-1">
            {day}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="space-y-1">
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 gap-1">
            {week.map((date) => {
              const key = dateKey(date);
              const tier = slots[key] || "none";
              const inRange = isInTripRange(date);
              const isPast = date < new Date(new Date().toDateString());

              return (
                <button
                  key={key}
                  onClick={() => !isPast && toggleDay(date)}
                  disabled={isPast}
                  className={cn(
                    "min-h-[44px] rounded-[4px] flex flex-col items-center justify-center transition-all text-xs",
                    TIER_COLORS[tier],
                    inRange && tier === "none" && "ring-1 ring-amber/30",
                    isPast && "opacity-30 cursor-not-allowed"
                  )}
                >
                  {date.getDate() === 1 && (
                    <span className="text-[10px] leading-none opacity-60">
                      {formatMonthLabel(date)}
                    </span>
                  )}
                  <span className="font-mono text-sm leading-none">{formatDayNum(date)}</span>
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <Button variant="amber" onClick={handleSubmit} disabled={submitting}>
        {submitting ? "Saving..." : "Save my availability"}
      </Button>
    </div>
  );
};

export default AvailabilityInput;

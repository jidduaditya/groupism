"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { toast } from "@/hooks/use-toast";

interface BudgetDropdownsProps {
  joinToken: string;
  trip: {
    budget_min: number | null;
    budget_max: number | null;
    travel_from: string | null;
    travel_to: string | null;
    destination_summary: any;
  };
  isOrganiser: boolean;
  onTripUpdated: () => void;
  deadline?: { due_date: string; locked: boolean } | null;
}

const BUDGET_OPTIONS = [
  { label: "₹2,000", value: 2000 },
  { label: "₹3,000", value: 3000 },
  { label: "₹5,000", value: 5000 },
  { label: "₹8,000", value: 8000 },
  { label: "₹10,000", value: 10000 },
  { label: "₹12,000", value: 12000 },
  { label: "₹15,000", value: 15000 },
  { label: "₹20,000", value: 20000 },
  { label: "₹25,000", value: 25000 },
  { label: "₹30,000+", value: 30000 },
];

export default function BudgetDropdowns({
  joinToken,
  trip,
  isOrganiser,
  onTripUpdated,
  deadline,
}: BudgetDropdownsProps) {
  const [budgetMin, setBudgetMin] = useState<number | null>(
    trip.budget_min ?? null
  );
  const [budgetMax, setBudgetMax] = useState<number | null>(
    trip.budget_max ?? null
  );
  const [travelFrom, setTravelFrom] = useState<string>(trip.travel_from ?? "");
  const [travelTo, setTravelTo] = useState<string>(trip.travel_to ?? "");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dateDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const validationError =
    budgetMin !== null && budgetMax !== null && budgetMin > budgetMax
      ? "Minimum can't be more than maximum."
      : null;

  const destSummary = trip.destination_summary;
  const totalMin = destSummary?.cost_breakdown?.total_min;
  const destName =
    destSummary?.destination || destSummary?.name || "this destination";

  const showMismatchWarning =
    budgetMax !== null &&
    totalMin !== undefined &&
    totalMin !== null &&
    budgetMax < totalMin;

  const save = useCallback(
    async (min: number, max: number) => {
      if (!isOrganiser) return;
      try {
        await api.patch(
          `/api/trips/${joinToken}`,
          { budget_min: min, budget_max: max },
          joinToken
        );
        onTripUpdated();
      } catch {
        toast({
          title: "Failed to save budget",
          variant: "destructive",
        });
      }
    },
    [isOrganiser, joinToken, onTripUpdated]
  );

  useEffect(() => {
    if (budgetMin === null || budgetMax === null) return;
    if (budgetMin > budgetMax) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      save(budgetMin, budgetMax);
    }, 800);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [budgetMin, budgetMax, save]);

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
    dateDebounceRef.current = setTimeout(() => {
      saveDate(newFrom, newTo);
    }, 800);
  };

  useEffect(() => {
    return () => {
      if (dateDebounceRef.current) clearTimeout(dateDebounceRef.current);
    };
  }, []);

  function formatDateDisplay(d: string): string {
    return new Date(d).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }

  function daysUntilDeadline(dueDate: string): number {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const due = new Date(dueDate);
    return Math.ceil((due.getTime() - now.getTime()) / 86400000);
  }

  return (
    <div className="rounded-[4px] border border-b-mid bg-surface p-6">
      <h2 className="font-display text-2xl font-bold text-t-primary mb-4">
        What&apos;s the budget?
      </h2>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="font-ui text-xs text-t-tertiary uppercase tracking-wider block mb-2">
            Minimum per person
          </label>
          <select
            className="w-full h-12 px-3 bg-surface border border-b-mid rounded-[4px] text-t-primary font-mono text-sm appearance-none cursor-pointer focus:outline-none focus:border-t-secondary"
            value={budgetMin ?? ""}
            onChange={(e) =>
              setBudgetMin(e.target.value ? Number(e.target.value) : null)
            }
          >
            <option value="">Select</option>
            {BUDGET_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="font-ui text-xs text-t-tertiary uppercase tracking-wider block mb-2">
            Maximum per person
          </label>
          <select
            className="w-full h-12 px-3 bg-surface border border-b-mid rounded-[4px] text-t-primary font-mono text-sm appearance-none cursor-pointer focus:outline-none focus:border-t-secondary"
            value={budgetMax ?? ""}
            onChange={(e) =>
              setBudgetMax(e.target.value ? Number(e.target.value) : null)
            }
          >
            <option value="">Select</option>
            {BUDGET_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {validationError && (
        <p className="font-ui text-sm text-terra mt-3">{validationError}</p>
      )}

      {showMismatchWarning && !validationError && (
        <div className="bg-[rgba(181,80,58,0.12)] border border-terra rounded-[4px] p-4 font-ui text-sm text-terra mt-4">
          ⚠ Your budget (₹{budgetMax?.toLocaleString("en-IN")}) may be tight
          for {destName} (est. from ₹{totalMin?.toLocaleString("en-IN")}).
          Consider adjusting your budget or choosing a different destination.
        </div>
      )}

      {/* Travel dates */}
      <div className="mt-6 border-t border-b-subtle pt-4">
        <p className="font-ui text-xs text-t-tertiary uppercase tracking-wider mb-3">
          When are you travelling?
        </p>

        {isOrganiser ? (
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="font-ui text-xs text-t-secondary block mb-1">From</label>
              <input
                type="date"
                value={travelFrom}
                onChange={(e) => handleDateChange("from", e.target.value)}
                className="w-full h-10 px-3 bg-surface border border-b-mid rounded-[4px] font-mono text-sm text-t-primary focus:outline-none focus:border-t-secondary"
              />
            </div>
            <div className="flex-1">
              <label className="font-ui text-xs text-t-secondary block mb-1">To</label>
              <input
                type="date"
                value={travelTo}
                onChange={(e) => handleDateChange("to", e.target.value)}
                min={travelFrom}
                className="w-full h-10 px-3 bg-surface border border-b-mid rounded-[4px] font-mono text-sm text-t-primary focus:outline-none focus:border-t-secondary"
              />
            </div>
          </div>
        ) : (
          <p className="font-mono text-sm text-t-primary">
            {trip.travel_from && trip.travel_to
              ? `${formatDateDisplay(trip.travel_from)} → ${formatDateDisplay(trip.travel_to)}`
              : "Dates not set yet"}
          </p>
        )}
      </div>

      {/* Inline deadline */}
      {deadline && !deadline.locked && (() => {
        const days = daysUntilDeadline(deadline.due_date);
        return (
          <p className={cn("font-ui text-xs mt-4", days <= 2 ? "text-terra" : "text-t-tertiary")}>
            {days <= 0 ? "⚠ Deadline passed" : `Submit budget by ${formatDateDisplay(deadline.due_date)}`}
          </p>
        );
      })()}
    </div>
  );
}

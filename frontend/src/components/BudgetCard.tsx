"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import BudgetAnalysisPanel from "./BudgetAnalysisPanel";

interface BudgetCardProps {
  joinToken: string;
  budgetPrefs: Array<{
    member_id: string;
    trip_budget_min?: number | null;
    trip_budget_max?: number | null;
    trip_members?: { id: string; display_name: string } | null;
  }>;
  members: Array<{ id: string; display_name: string }>;
  currentMemberId: string | null;
  onTripUpdated: () => void;
  deadline?: { due_date: string; locked: boolean } | null;
  cachedAnalysis?: any | null;
  trip: {
    selected_destination_id: string | null;
    destination_summary: any | null;
  };
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

function formatINR(val: number): string {
  return val.toLocaleString("en-IN");
}

export default function BudgetCard({
  joinToken,
  budgetPrefs,
  members,
  currentMemberId,
  onTripUpdated,
  deadline,
  cachedAnalysis,
  trip,
}: BudgetCardProps) {
  const myPref = budgetPrefs.find((p) => p.member_id === currentMemberId);

  const [budgetMin, setBudgetMin] = useState<number | null>(
    myPref?.trip_budget_min ?? null
  );
  const [budgetMax, setBudgetMax] = useState<number | null>(
    myPref?.trip_budget_max ?? null
  );
  const [savedVisible, setSavedVisible] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isInitialMount = useRef(true);

  // Sync from props when data refreshes
  useEffect(() => {
    const updated = budgetPrefs.find((p) => p.member_id === currentMemberId);
    if (updated) {
      setBudgetMin(updated.trip_budget_min ?? null);
      setBudgetMax(updated.trip_budget_max ?? null);
    }
  }, [budgetPrefs, currentMemberId]);

  const validationError =
    budgetMin !== null && budgetMax !== null && budgetMin > budgetMax
      ? "Minimum can't be more than maximum."
      : null;

  const save = useCallback(
    async (min: number, max: number) => {
      try {
        await api.post(
          `/api/trips/${joinToken}/budget/preferences`,
          { trip_budget_min: min, trip_budget_max: max },
          joinToken
        );
        setSavedVisible(true);
        if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
        savedTimerRef.current = setTimeout(() => setSavedVisible(false), 2000);
        onTripUpdated();

        // Auto-trigger AI budget analysis when ≥2 members have submitted
        const submittedAfterSave = budgetPrefs.filter(
          (p) => p.trip_budget_min != null && p.trip_budget_max != null
        ).length;
        const alreadyCounted = budgetPrefs.some(
          (p) => p.member_id === currentMemberId && p.trip_budget_min != null
        );
        const effectiveCount = alreadyCounted ? submittedAfterSave : submittedAfterSave + 1;
        if (effectiveCount >= 2) {
          api.post(`/api/trips/${joinToken}/budget/analyse`, {}, joinToken).catch(() => {});
        }
      } catch {
        toast({ title: "Failed to save budget", variant: "destructive" });
      }
    },
    [joinToken, onTripUpdated, budgetPrefs, currentMemberId]
  );

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
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

  useEffect(() => {
    return () => {
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    };
  }, []);

  // Average calculation (n≥1)
  const submitted = budgetPrefs.filter(
    (p) => p.trip_budget_min != null && p.trip_budget_max != null
  );
  const avgMin =
    submitted.length >= 1
      ? Math.round(
          submitted.reduce((s, p) => s + p.trip_budget_min!, 0) /
            submitted.length /
            500
        ) * 500
      : null;
  const avgMax =
    submitted.length >= 1
      ? Math.round(
          submitted.reduce((s, p) => s + p.trip_budget_max!, 0) /
            submitted.length /
            500
        ) * 500
      : null;

  // Budget mismatch warning
  const destCostMin = trip.destination_summary?.cost_breakdown?.total_min ?? null;
  const destCostMax = trip.destination_summary?.cost_breakdown?.total_max ?? null;
  const destName = trip.destination_summary?.name ?? "This destination";
  const showMismatch =
    budgetMax !== null &&
    trip.selected_destination_id !== null &&
    destCostMin !== null &&
    destCostMin > budgetMax;

  function daysUntilDeadline(dueDate: string): number {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return Math.ceil(
      (new Date(dueDate).getTime() - now.getTime()) / 86400000
    );
  }

  return (
    <div className="rounded-[4px] border border-b-mid bg-surface p-6 min-h-[280px]">
      <div className="flex items-center justify-between mb-1">
        <h2 className="font-display text-2xl font-bold text-t-primary">
          What&apos;s your budget for this trip?
        </h2>
        {savedVisible && (
          <span className="font-ui text-xs text-green">Saved ✓</span>
        )}
      </div>
      <p className="font-ui font-light text-sm text-t-secondary mb-6">
        Set your per-person budget range.
      </p>

      {/* My budget inputs */}
      <p className="font-ui text-xs text-t-tertiary uppercase tracking-wider mb-2">
        My budget
      </p>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="font-ui text-xs text-t-secondary block mb-1">
            Minimum
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
          <label className="font-ui text-xs text-t-secondary block mb-1">
            Maximum
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

      {/* Average + count */}
      {avgMin !== null && avgMax !== null && (
        <div className="mt-6 border-t border-b-subtle pt-4">
          <p className="font-mono text-xl text-text-primary">
            ₹{formatINR(avgMin)} – ₹{formatINR(avgMax)}
          </p>
          <p className="font-ui text-xs text-text-tertiary mt-0.5">
            Based on {submitted.length}{" "}
            {submitted.length === 1 ? "person" : "people"}
          </p>
        </div>
      )}

      {/* Budget mismatch warning */}
      {showMismatch && (
        <div className="mt-3 p-3 border border-accent-terra rounded-[4px] bg-[rgba(196,97,74,0.08)]">
          <p className="font-ui text-xs text-accent-terra leading-relaxed">
            ⚠ {destName} is estimated at ₹{formatINR(destCostMin)}
            {destCostMax ? ` – ₹${formatINR(destCostMax)}` : ""} pp. Your
            budget of ₹{formatINR(budgetMax!)} may not cover it. Consider
            adjusting your budget or the group choosing a different destination.
          </p>
        </div>
      )}

      {/* AI Budget Analysis — shown when ≥2 members have submitted */}
      {budgetPrefs.filter((p) => p.trip_budget_min != null).length >= 2 && (
        <BudgetAnalysisPanel
          joinToken={joinToken}
          cachedAnalysis={cachedAnalysis ?? null}
          submittedCount={budgetPrefs.filter((p) => p.trip_budget_min != null).length}
        />
      )}

      {/* Inline deadline */}
      {deadline && !deadline.locked && (() => {
        const days = daysUntilDeadline(deadline.due_date);
        return (
          <p className={cn("font-ui text-xs mt-4", days <= 2 ? "text-terra" : "text-t-tertiary")}>
            {days <= 0
              ? "⚠ Deadline passed"
              : `Submit budget by ${new Date(deadline.due_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`}
          </p>
        );
      })()}
    </div>
  );
}

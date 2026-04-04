"use client";

import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";

interface DestinationFit {
  name: string;
  fit: "comfortable" | "tight" | "out_of_range";
  note: string;
}

interface Analysis {
  mode: "locked" | "suggestions" | "no_context";
  group_budget_min: number;
  group_budget_max: number;
  verdict: string;
  detail: string;
  destination_fits?: DestinationFit[] | null;
}

interface BudgetAnalysisPanelProps {
  joinToken: string;
  cachedAnalysis: Analysis | null;
  submittedCount: number;
}

export default function BudgetAnalysisPanel({
  joinToken,
  cachedAnalysis,
  submittedCount,
}: BudgetAnalysisPanelProps) {
  const [analysis, setAnalysis] = useState<Analysis | null>(cachedAnalysis);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasFetched = useRef(false);

  const prevCount = useRef(submittedCount);

  // Sync cached analysis from props
  useEffect(() => {
    if (cachedAnalysis) {
      setAnalysis(cachedAnalysis);
    }
  }, [cachedAnalysis]);

  // Auto-trigger on first render if no cached analysis
  useEffect(() => {
    if (cachedAnalysis) return;
    if (hasFetched.current) return;
    hasFetched.current = true;
    fetchAnalysis();
  }, [cachedAnalysis]);

  // Re-trigger when new budgets are submitted
  useEffect(() => {
    if (submittedCount > prevCount.current) {
      prevCount.current = submittedCount;
      hasFetched.current = false;
      // Re-fetch if we have no cached analysis (the BudgetCard fire-and-forget
      // will handle it via Realtime, but if cachedAnalysis is null we trigger directly)
      if (!cachedAnalysis) {
        hasFetched.current = true;
        fetchAnalysis();
      }
    } else {
      prevCount.current = submittedCount;
    }
  }, [submittedCount, cachedAnalysis]);

  async function fetchAnalysis() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.post(
        `/api/trips/${joinToken}/budget/analyse`,
        {},
        joinToken
      );
      setAnalysis(res.analysis);
    } catch (err: any) {
      setError(err.message || "Budget analysis isn't available right now.");
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="mt-6 border-t border-b-subtle pt-4">
        <p className="font-ui text-xs text-t-tertiary uppercase tracking-wider mb-3">
          AI Budget Analysis
        </p>
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-6 bg-surface rounded-[4px] overflow-hidden relative">
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[rgba(240,234,214,0.06)] to-transparent animate-shimmer" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-6 border-t border-b-subtle pt-4">
        <p className="font-ui text-xs text-t-tertiary uppercase tracking-wider mb-2">
          AI Budget Analysis
        </p>
        <p className="font-ui text-sm text-terra">{error}</p>
        <button
          onClick={fetchAnalysis}
          className="font-ui text-xs text-t-tertiary hover:text-t-secondary mt-2 cursor-pointer transition-colors"
        >
          Try again
        </button>
      </div>
    );
  }

  if (!analysis) return null;

  const fitIcon = (fit: string) => {
    switch (fit) {
      case "comfortable":
        return <span className="text-green">✓</span>;
      case "tight":
        return <span className="text-amber">⚠</span>;
      case "out_of_range":
        return <span className="text-terra">✗</span>;
      default:
        return null;
    }
  };

  return (
    <div className="mt-6 border-t border-b-subtle pt-4">
      <div className="flex items-center justify-between mb-3">
        <p className="font-ui text-xs text-t-tertiary uppercase tracking-wider">
          AI Budget Analysis
        </p>
        <button
          onClick={fetchAnalysis}
          className="font-ui text-xs text-t-tertiary hover:text-t-secondary cursor-pointer transition-colors"
        >
          Refresh analysis
        </button>
      </div>

      <p className="font-display text-lg text-t-primary leading-snug">
        {analysis.verdict}
      </p>
      <p className="font-ui font-light text-sm text-t-secondary mt-2">
        {analysis.detail}
      </p>

      {analysis.destination_fits && analysis.destination_fits.length > 0 && (
        <div className="mt-4 space-y-2">
          {analysis.destination_fits.map((d) => (
            <div
              key={d.name}
              className="flex items-start gap-2"
            >
              <span className="text-sm mt-0.5">{fitIcon(d.fit)}</span>
              <div>
                <span className="font-ui text-sm text-t-primary font-medium">
                  {d.name}
                </span>
                <span className="font-ui text-sm text-t-secondary ml-2">
                  {d.note}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

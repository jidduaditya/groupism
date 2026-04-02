"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

interface DestinationSearchCardProps {
  joinToken: string;
  trip: {
    id: string;
    selected_destination_id: string | null;
    destination_summary: any | null;
    group_size: number;
    budget_min: number | null;
    budget_max: number | null;
    travel_from: string | null;
    travel_to: string | null;
  };
  isOrganiser: boolean;
  onTripUpdated: () => void;
}

type ViewState =
  | { mode: "search" }
  | { mode: "loading"; loadingText: string }
  | { mode: "suggestions"; suggestions: string[] }
  | { mode: "summary"; summary: any }
  | { mode: "selected" }
  | { mode: "error"; message: string };

export default function DestinationSearchCard({
  joinToken,
  trip,
  isOrganiser,
  onTripUpdated,
}: DestinationSearchCardProps) {
  const hasExistingDestination =
    trip.selected_destination_id !== null && trip.destination_summary !== null;

  const [view, setView] = useState<ViewState>(
    hasExistingDestination ? { mode: "selected" } : { mode: "search" }
  );
  const [searchValue, setSearchValue] = useState("");
  const [selecting, setSelecting] = useState(false);

  async function handleSearch() {
    const query = searchValue.trim();
    if (!query) return;

    setView({ mode: "loading", loadingText: "Searching..." });

    try {
      const res = await api.post(
        `/api/trips/${joinToken}/destinations/summary`,
        { query, source: "search" },
        joinToken
      );
      // Unwrap the { destination: { ... } } wrapper if present
      const summary = res.destination ?? res;
      setView({ mode: "summary", summary });
    } catch (err: any) {
      const status = err?.status ?? err?.response?.status;
      if (status === 503) {
        setView({
          mode: "error",
          message:
            "AI is unavailable right now. Try searching a destination manually.",
        });
      } else {
        setView({
          mode: "error",
          message:
            "AI is unavailable right now. Try searching a destination manually.",
        });
      }
    }
  }

  async function handleAiSuggest() {
    setView({ mode: "loading", loadingText: "Thinking about your group..." });

    try {
      const res = await api.post(
        `/api/trips/${joinToken}/destinations/summary`,
        { query: null, source: "ai" },
        joinToken
      );

      if (res.suggestions && Array.isArray(res.suggestions)) {
        setView({ mode: "suggestions", suggestions: res.suggestions });
      } else {
        setView({ mode: "summary", summary: res });
      }
    } catch {
      setView({
        mode: "error",
        message:
          "AI is unavailable right now. Try searching a destination manually.",
      });
    }
  }

  async function handleChipClick(chipName: string) {
    setView({ mode: "loading", loadingText: "Searching..." });

    try {
      const res = await api.post(
        `/api/trips/${joinToken}/destinations/summary`,
        { query: chipName, source: "search" },
        joinToken
      );
      const summary = res.destination ?? res;
      setView({ mode: "summary", summary });
    } catch {
      setView({
        mode: "error",
        message:
          "AI is unavailable right now. Try searching a destination manually.",
      });
    }
  }

  async function handleSelect(summary: any) {
    setSelecting(true);

    try {
      const destRes = await api.post(
        `/api/trips/${joinToken}/destinations`,
        {
          name: summary.name,
          tagline: summary.tagline,
          pros: summary.highlights,
          cons: summary.watch_out,
          estimated_cost_min: summary.cost_breakdown?.total_min,
          estimated_cost_max: summary.cost_breakdown?.total_max,
          source: "ai",
        },
        joinToken
      );

      const destinationId = destRes.destination?.id;

      await api.patch(
        `/api/trips/${joinToken}`,
        {
          selected_destination_id: destinationId,
          destination_summary: summary,
        },
        joinToken
      );

      onTripUpdated();
    } catch {
      toast({
        title: "Failed to select destination",
        description: "Something went wrong. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSelecting(false);
    }
  }

  function handleChangeDestination() {
    setView({ mode: "search" });
    setSearchValue("");
  }

  return (
    <div className="bg-surface border border-b-subtle rounded-[4px] p-6">
      <h2 className="font-display text-2xl font-bold text-t-primary mb-6">
        Where are you going?
      </h2>

      {/* Already selected state */}
      {view.mode === "selected" && trip.destination_summary && (
        <div>
          {isOrganiser && (
            <button
              onClick={handleChangeDestination}
              className="font-ui text-sm text-t-tertiary hover:text-t-secondary cursor-pointer transition-colors mb-4"
            >
              &larr; Change destination
            </button>
          )}
          <PlaceSummaryCard
            summary={trip.destination_summary}
            trip={trip}
            readOnly
          />
        </div>
      )}

      {/* Search mode */}
      {view.mode === "search" && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-t-tertiary text-base pointer-events-none">
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </span>
              <input
                type="text"
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSearch();
                }}
                placeholder="Search a destination..."
                className="w-full h-11 pl-10 pr-4 bg-elevated border border-b-mid rounded-[4px] font-ui text-sm text-t-primary placeholder:text-t-tertiary outline-none focus:border-amber transition-colors"
              />
            </div>
            <button
              onClick={handleAiSuggest}
              className="h-11 px-5 rounded-[4px] border border-b-mid bg-transparent font-ui text-sm text-t-primary hover:bg-hover transition-all cursor-pointer whitespace-nowrap"
            >
              Let AI suggest
            </button>
          </div>
        </div>
      )}

      {/* Loading state */}
      {view.mode === "loading" && (
        <LoadingShimmer text={view.loadingText} />
      )}

      {/* AI suggestions */}
      {view.mode === "suggestions" && (
        <div className="space-y-4">
          <p className="font-ui text-sm text-t-secondary">
            Pick a destination to explore:
          </p>
          <div className="flex flex-wrap gap-3">
            {view.suggestions.map((name) => (
              <button
                key={name}
                onClick={() => handleChipClick(name)}
                className="h-11 px-5 rounded-[4px] bg-surface border border-b-mid font-ui text-sm text-t-primary hover:bg-hover transition-all cursor-pointer"
              >
                {name}
              </button>
            ))}
          </div>
          <button
            onClick={handleChangeDestination}
            className="font-ui text-sm text-t-tertiary hover:text-t-secondary cursor-pointer transition-colors"
          >
            &larr; Back to search
          </button>
        </div>
      )}

      {/* Summary view */}
      {view.mode === "summary" && (
        <div className="space-y-6">
          <button
            onClick={handleChangeDestination}
            className="font-ui text-sm text-t-tertiary hover:text-t-secondary cursor-pointer transition-colors"
          >
            &larr; Back to search
          </button>
          <PlaceSummaryCard
            summary={view.summary}
            trip={trip}
          />
          <button
            onClick={() => handleSelect(view.summary)}
            disabled={selecting}
            className={cn(
              "w-full h-14 bg-amber text-[#1c1a15] font-display font-bold text-lg rounded-[4px] transition-opacity",
              selecting ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:opacity-90"
            )}
          >
            {selecting
              ? "Selecting..."
              : `Select ${view.summary.name || "destination"} \u2192`}
          </button>
        </div>
      )}

      {/* Error state */}
      {view.mode === "error" && (
        <div className="space-y-4">
          <p className="font-ui text-sm text-terra">{view.message}</p>
          <button
            onClick={handleChangeDestination}
            className="font-ui text-sm text-t-tertiary hover:text-t-secondary cursor-pointer transition-colors"
          >
            &larr; Back to search
          </button>
        </div>
      )}
    </div>
  );
}

/* ─── Sub-components ─── */

function LoadingShimmer({ text }: { text: string }) {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="h-12 bg-surface rounded-[4px] overflow-hidden relative"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[rgba(240,234,214,0.06)] to-transparent animate-shimmer" />
        </div>
      ))}
      <p className="font-ui font-light text-sm text-t-secondary">{text}</p>
    </div>
  );
}

function PlaceSummaryCard({
  summary,
  trip,
  readOnly = false,
}: {
  summary: any;
  trip: { group_size: number; travel_from: string | null; travel_to: string | null };
  readOnly?: boolean;
}) {
  const highlights: string[] = summary.highlights ?? summary.pros ?? [];
  const watchOuts: string[] = summary.watch_out ?? summary.cons ?? [];
  const costBreakdown = summary.cost_breakdown ?? summary.estimated_costs ?? null;

  const nightCount =
    trip.travel_from && trip.travel_to
      ? Math.max(
          1,
          Math.round(
            (new Date(trip.travel_to).getTime() -
              new Date(trip.travel_from).getTime()) /
              (1000 * 60 * 60 * 24)
          )
        )
      : null;

  return (
    <div className="space-y-5">
      {/* Name */}
      <div>
        <h3 className="font-display text-4xl font-bold text-t-primary">
          {summary.name}
        </h3>
        <div className="border-t border-b-mid mt-3" />
      </div>

      {/* Tagline */}
      {summary.tagline && (
        <p className="font-ui font-light text-t-secondary mt-2">
          {summary.tagline}
        </p>
      )}

      {/* Highlights & watch-outs */}
      {(highlights.length > 0 || watchOuts.length > 0) && (
        <div className="space-y-1.5">
          {highlights.map((h, i) => (
            <p key={`h-${i}`} className="text-green font-ui text-sm">
              &#10003; {h}
            </p>
          ))}
          {watchOuts.map((w, i) => (
            <p key={`w-${i}`} className="text-terra font-ui text-sm">
              &#10007; {w}
            </p>
          ))}
        </div>
      )}

      {/* Cost breakdown */}
      {costBreakdown && (
        <div className="space-y-3">
          <div>
            <p className="font-ui text-xs text-t-tertiary uppercase tracking-wider font-medium">
              Estimated cost
              {nightCount !== null && trip.group_size > 0
                ? ` (${nightCount} night${nightCount !== 1 ? "s" : ""}, ${trip.group_size} ${trip.group_size === 1 ? "person" : "people"})`
                : ""}
            </p>
            <div className="border-t border-b-mid mt-2" />
          </div>

          <div className="space-y-2">
            <CostRow
              label="Flights"
              min={costBreakdown.flights_min}
              max={costBreakdown.flights_max}
              suffix="pp"
            />
            <CostRow
              label="Hotel"
              min={costBreakdown.hotel_per_night_min}
              max={costBreakdown.hotel_per_night_max}
              suffix="pp/night"
            />
            <CostRow
              label="Food"
              min={costBreakdown.food_per_day_min}
              max={costBreakdown.food_per_day_max}
              suffix="pp/day"
            />
            <CostRow
              label="Activities"
              min={costBreakdown.activities_min}
              max={costBreakdown.activities_max}
              suffix="pp"
            />
          </div>

          {(costBreakdown.total_min != null ||
            costBreakdown.total_max != null) && (
            <div>
              <div className="border-t border-b-subtle" />
              <div className="flex justify-between items-center pt-2">
                <span className="font-ui text-sm text-t-secondary">
                  Total estimate
                </span>
                <span className="font-mono font-medium text-sm text-t-primary">
                  {formatRange(
                    costBreakdown.total_min,
                    costBreakdown.total_max
                  )}{" "}
                  pp
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CostRow({
  label,
  min,
  max,
  suffix,
}: {
  label: string;
  min: number | null | undefined;
  max: number | null | undefined;
  suffix: string;
}) {
  if (min == null && max == null) return null;

  return (
    <div className="flex justify-between items-center">
      <span className="font-ui text-sm text-t-secondary">{label}</span>
      <span className="font-mono text-sm text-t-primary">
        {formatRange(min ?? null, max ?? null)} {suffix}
      </span>
    </div>
  );
}

function formatRange(min: number | null, max: number | null): string {
  const fmt = (n: number) =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(n);

  if (min != null && max != null) return `${fmt(min)} \u2013 ${fmt(max)}`;
  if (min != null) return fmt(min);
  if (max != null) return fmt(max);
  return "\u2014";
}

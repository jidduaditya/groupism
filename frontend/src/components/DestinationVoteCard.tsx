"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

interface CostBreakdown {
  flights_min: number;
  flights_max: number;
  hotel_per_night_min: number;
  hotel_per_night_max: number;
  food_per_day_min: number;
  food_per_day_max: number;
  activities_min: number;
  activities_max: number;
  total_min: number;
  total_max: number;
}

interface DestinationVoteCardProps {
  destination: {
    id: string;
    name: string;
    tagline: string | null;
    pros: string[];
    cons: string[];
    estimated_cost_min: number | null;
    estimated_cost_max: number | null;
    cost_breakdown: CostBreakdown | null;
    nights: number | null;
    votes: number;
    voter_member_ids: string[];
    added_by_member_id: string | null;
  };
  currentMemberId: string | null;
  isOrganiser: boolean;
  isSelected: boolean;
  isWinning: boolean;
  joinToken: string;
  groupSize: number;
  onVote: (destId: string) => void;
  onRemove: (destId: string) => void;
  onSelect: (destId: string) => void;
  onDeselect: () => void;
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

export default function DestinationVoteCard({
  destination,
  currentMemberId,
  isOrganiser,
  isSelected,
  isWinning,
  groupSize,
  onVote,
  onRemove,
  onSelect,
  onDeselect,
}: DestinationVoteCardProps) {
  const [expanded, setExpanded] = useState(false);

  const hasVoted = currentMemberId
    ? destination.voter_member_ids.includes(currentMemberId)
    : false;

  const highlights = destination.pros ?? [];
  const watchOuts = destination.cons ?? [];
  const cb = destination.cost_breakdown;

  const borderClass = isSelected
    ? "border-l-[3px] border-l-green"
    : hasVoted
      ? "border-l-[3px] border-l-amber bg-elevated"
      : isWinning
        ? "border-l-[3px] border-l-green"
        : "border-l-[3px] border-l-transparent";

  return (
    <div
      className={cn(
        "bg-surface border border-b-subtle rounded-[4px] p-5 transition-opacity",
        borderClass,
        isSelected ? "" : "",
      )}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-display text-2xl font-bold text-t-primary">
          {destination.name}
        </h3>
        <div className="flex items-center gap-2 shrink-0">
          {isSelected && (
            <span className="font-mono text-xs text-green bg-green/10 px-2 py-1 rounded">
              Selected ✓
            </span>
          )}
          <span className="font-mono text-sm text-amber font-medium">
            {destination.votes} {destination.votes === 1 ? "vote" : "votes"}
          </span>
          {isOrganiser && !isSelected && (
            <button
              onClick={() => onRemove(destination.id)}
              className="text-t-tertiary hover:text-terra transition-colors text-lg leading-none px-1"
              title="Remove destination"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* Tagline */}
      {destination.tagline && (
        <p className="font-ui font-light text-sm text-t-secondary mt-1">
          {destination.tagline}
        </p>
      )}

      {/* Highlights & watch-outs (compact) */}
      {(highlights.length > 0 || watchOuts.length > 0) && (
        <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-2">
          {highlights.slice(0, 2).map((h, i) => (
            <span key={`h-${i}`} className="text-green font-ui text-xs">
              ✓ {h}
            </span>
          ))}
          {watchOuts.slice(0, 1).map((w, i) => (
            <span key={`w-${i}`} className="text-terra font-ui text-xs">
              ✗ {w}
            </span>
          ))}
        </div>
      )}

      {/* Cost estimate line */}
      <p className="font-mono text-xs text-t-tertiary mt-2">
        Est. {formatRange(destination.estimated_cost_min, destination.estimated_cost_max)} pp
        {destination.nights ? `  ·  ${destination.nights} nights` : ""}
      </p>

      {/* Actions */}
      <div className="flex items-center gap-3 mt-4">
        {isSelected ? (
          <p className="font-ui text-sm text-green">The group is going here</p>
        ) : (
          <button
            onClick={() => onVote(destination.id)}
            className={cn(
              "h-10 px-5 rounded-[4px] font-ui text-sm transition-all cursor-pointer",
              hasVoted
                ? "bg-amber text-[#1c1a15] font-medium"
                : "border border-b-mid text-t-primary hover:bg-hover"
            )}
          >
            {hasVoted ? "✓ Voted" : `Vote for ${destination.name}`}
          </button>
        )}

        <button
          onClick={() => setExpanded(!expanded)}
          className="font-ui text-xs text-t-tertiary hover:text-t-secondary transition-colors cursor-pointer"
        >
          {expanded ? "Hide details" : "↗ Full details"}
        </button>

        {isOrganiser && isWinning && !isSelected && destination.votes > 0 && (
          <button
            onClick={() => onSelect(destination.id)}
            className="h-10 px-5 rounded-[4px] bg-green/10 border border-green text-green font-ui text-sm font-medium cursor-pointer hover:bg-green/20 transition-colors ml-auto"
          >
            Lock in →
          </button>
        )}

        {isOrganiser && isSelected && (
          <button
            onClick={onDeselect}
            className="font-ui text-xs text-t-tertiary hover:text-terra transition-colors cursor-pointer ml-auto"
          >
            × Change selection
          </button>
        )}
      </div>

      {/* Expanded cost breakdown */}
      {expanded && cb && (
        <div className="mt-4 pt-4 border-t border-b-subtle space-y-3">
          <p className="font-ui text-xs text-t-tertiary uppercase tracking-wider font-medium">
            Cost breakdown
            {destination.nights != null && groupSize > 0
              ? ` (${destination.nights} night${destination.nights !== 1 ? "s" : ""}, ${groupSize} ${groupSize === 1 ? "person" : "people"})`
              : ""}
          </p>
          <div className="space-y-2">
            <CostRow label="Flights" min={cb.flights_min} max={cb.flights_max} suffix="pp" />
            <CostRow label="Hotel" min={cb.hotel_per_night_min} max={cb.hotel_per_night_max} suffix="pp/night" />
            <CostRow label="Food" min={cb.food_per_day_min} max={cb.food_per_day_max} suffix="pp/day" />
            <CostRow label="Activities" min={cb.activities_min} max={cb.activities_max} suffix="pp" />
          </div>
          {(cb.total_min != null || cb.total_max != null) && (
            <div>
              <div className="border-t border-b-subtle" />
              <div className="flex justify-between items-center pt-2">
                <span className="font-ui text-sm text-t-secondary">Total estimate</span>
                <span className="font-mono font-medium text-sm text-t-primary">
                  {formatRange(cb.total_min, cb.total_max)} pp
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

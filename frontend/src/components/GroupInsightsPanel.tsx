"use client";

import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";

interface GroupInsightsPanelProps {
  joinToken: string;
  groupInsights: {
    vibe_summary: string | null;
    itinerary_notes: string | null;
    friction_flags: Array<{ area: string; detail: string }> | null;
    members_used: number;
    generated_at: string;
  } | null;
  prefsCount: number;
  onRefresh: () => void;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function GroupInsightsPanel({
  joinToken,
  groupInsights,
  prefsCount,
  onRefresh,
}: GroupInsightsPanelProps) {
  const [generating, setGenerating] = useState(false);
  const autoTriggered = useRef(false);

  // Auto-generate when ≥2 prefs and no cached insights
  useEffect(() => {
    if (autoTriggered.current) return;
    if (prefsCount < 2 || groupInsights) return;
    autoTriggered.current = true;
    generate();
  }, [prefsCount, groupInsights]);

  // Re-trigger when insights are stale (new members submitted since last generation)
  useEffect(() => {
    if (!groupInsights) return;
    if (generating) return;
    if (prefsCount > groupInsights.members_used) {
      generate();
    }
  }, [prefsCount, groupInsights?.members_used]);

  const generate = async () => {
    setGenerating(true);
    try {
      await api.post(
        `/api/trips/${joinToken}/insights/generate`,
        {},
        joinToken
      );
      onRefresh();
    } catch {
      // silent — panel stays empty
    } finally {
      setGenerating(false);
    }
  };

  if (prefsCount < 2) return null;

  if (!groupInsights && !generating) return null;

  if (generating && !groupInsights) {
    return (
      <div className="rounded-[4px] border border-b-mid bg-surface p-6">
        <p className="font-ui text-sm text-t-secondary animate-pulse">
          Analysing group preferences...
        </p>
      </div>
    );
  }

  if (!groupInsights) return null;

  const frictionFlags: Array<{ area: string; detail: string }> =
    Array.isArray(groupInsights.friction_flags)
      ? groupInsights.friction_flags
      : [];

  const itineraryLines = (groupInsights.itinerary_notes || "")
    .split("\n")
    .filter((l) => l.trim());

  const isStale = prefsCount > groupInsights.members_used;

  return (
    <div className="rounded-[4px] border border-b-mid bg-surface p-6">
      <div className="flex items-center justify-between mb-1 pr-8">
        <h2 className="font-display text-2xl font-bold text-t-primary">
          Group insights
        </h2>
        {isStale && (
          <span className="font-ui text-xs text-amber">
            Based on {groupInsights.members_used} of {prefsCount} members
          </span>
        )}
      </div>

      {/* GROUP VIBE */}
      {groupInsights.vibe_summary && (
        <div className="mb-5">
          <p className="font-ui text-xs text-t-tertiary uppercase tracking-wider mb-2">
            Group vibe
          </p>
          <p className="font-ui text-sm text-t-primary leading-relaxed">
            {groupInsights.vibe_summary}
          </p>
        </div>
      )}

      {/* WHAT TO PLAN FOR */}
      {itineraryLines.length > 0 && (
        <div className="mb-5">
          <p className="font-ui text-xs text-t-tertiary uppercase tracking-wider mb-2">
            What to plan for
          </p>
          <ul className="space-y-1.5">
            {itineraryLines.map((line, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-amber mt-0.5 text-xs">●</span>
                <span className="font-ui text-sm text-t-secondary">
                  {line.replace(/^[-•]\s*/, "")}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* FRICTION FLAGS */}
      {frictionFlags.length > 0 && (
        <div className="mb-4">
          <p className="font-ui text-xs text-t-tertiary uppercase tracking-wider mb-2">
            Where it might get complicated
          </p>
          <ul className="space-y-1.5">
            {frictionFlags.map((flag, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-terra mt-0.5 text-xs">⚠</span>
                <span className="font-ui text-sm text-t-secondary">
                  <strong className="text-t-primary">{flag.area}:</strong>{" "}
                  {flag.detail}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Footer: stale time + regenerate */}
      <div className="flex items-center justify-between pt-2 border-t border-b-subtle">
        <span className="font-ui text-xs text-t-tertiary">
          Generated {timeAgo(groupInsights.generated_at)}
        </span>
        <button
          type="button"
          onClick={generate}
          disabled={generating}
          className={cn(
            "font-ui text-xs text-t-secondary hover:text-t-primary transition-colors",
            generating && "opacity-50 pointer-events-none"
          )}
        >
          {generating ? "Regenerating..." : "Regenerate"}
        </button>
      </div>
    </div>
  );
}

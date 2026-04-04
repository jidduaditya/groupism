"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import DestinationVoteCard from "./DestinationVoteCard";

interface Destination {
  id: string;
  name: string;
  tagline: string | null;
  pros: string[];
  cons: string[];
  estimated_cost_min: number | null;
  estimated_cost_max: number | null;
  cost_breakdown: any | null;
  nights: number | null;
  votes: number;
  voter_member_ids: string[];
  added_by_member_id: string | null;
}

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
  destinations: Destination[];
  currentMemberId: string | null;
  isOrganiser: boolean;
  onTripUpdated: () => void;
  onVote: (destId: string) => void;
  onRemove: (destId: string) => void;
  onSelect: (destId: string) => void;
  onDeselect: () => void;
  deadline?: { due_date: string; locked: boolean } | null;
}

type AddState =
  | { mode: "idle" }
  | { mode: "loading"; loadingText: string }
  | { mode: "suggestions"; suggestions: string[] }

  | { mode: "error"; message: string };

export default function DestinationSearchCard({
  joinToken,
  trip,
  destinations,
  currentMemberId,
  isOrganiser,
  onTripUpdated,
  onVote,
  onRemove,
  onSelect,
  onDeselect,
  deadline,
}: DestinationSearchCardProps) {
  const [searchValue, setSearchValue] = useState("");
  const [aiPromptValue, setAiPromptValue] = useState("");
  const [addState, setAddState] = useState<AddState>({ mode: "idle" });

  // Find the winning destination (most votes, at least 1)
  const maxVotes = Math.max(0, ...destinations.map((d) => d.votes));
  const winningId =
    maxVotes > 0
      ? destinations.find((d) => d.votes === maxVotes)?.id ?? null
      : null;

  // Sort: selected first, then by votes descending
  const sortedDestinations = [...destinations].sort((a, b) => {
    if (a.id === trip.selected_destination_id) return -1;
    if (b.id === trip.selected_destination_id) return 1;
    return b.votes - a.votes;
  });

  async function handleSearch() {
    const query = searchValue.trim();
    if (!query) return;

    setAddState({ mode: "loading", loadingText: `Looking up ${query}...` });

    try {
      const res = await api.post(
        `/api/trips/${joinToken}/destinations/summary`,
        { query, source: "search" },
        joinToken
      );
      const summary = res.destination ?? res;
      if (summary.already_existed) {
        toast({ title: `${query} is already on the list — vote for it instead` });
        setAddState({ mode: "idle" });
        setSearchValue("");
        onTripUpdated();
      } else {
        setAddState({ mode: "idle" });
        setSearchValue("");
        setAiPromptValue("");
        onTripUpdated();
      }
    } catch {
      setAddState({
        mode: "error",
        message: "Suggestions aren't available right now. Try again in a moment.",
      });
    }
  }

  async function handleAiSuggest() {
    setAddState({ mode: "loading", loadingText: "Finding destinations that fit your group..." });

    try {
      const res = await api.post(
        `/api/trips/${joinToken}/destinations/summary`,
        { query: aiPromptValue.trim() || null, source: "ai" },
        joinToken
      );

      if (res.suggestions && Array.isArray(res.suggestions)) {
        setAddState({ mode: "suggestions", suggestions: res.suggestions });
      } else {
        const summary = res.destination ?? res;
        if (summary.already_existed) {
          toast({ title: "Already in the list" });
          setAddState({ mode: "idle" });
          onTripUpdated();
        } else {
          setAddState({ mode: "idle" });
        setSearchValue("");
        setAiPromptValue("");
        onTripUpdated();
        }
      }
    } catch {
      setAddState({
        mode: "error",
        message: "Suggestions aren't available right now. Try again in a moment.",
      });
    }
  }

  async function handleChipClick(chipName: string) {
    setAddState({ mode: "loading", loadingText: `Looking up ${chipName}...` });

    try {
      const res = await api.post(
        `/api/trips/${joinToken}/destinations/summary`,
        { query: chipName, source: "search" },
        joinToken
      );
      const summary = res.destination ?? res;
      if (summary.already_existed) {
        toast({ title: `${chipName} is already on the list — vote for it instead` });
        setAddState({ mode: "idle" });
        onTripUpdated();
      } else {
        setAddState({ mode: "idle" });
        setSearchValue("");
        setAiPromptValue("");
        onTripUpdated();
      }
    } catch {
      setAddState({
        mode: "error",
        message: "Suggestions aren't available right now. Try again in a moment.",
      });
    }
  }

  function handleReset() {
    setAddState({ mode: "idle" });
    setSearchValue("");
  }

  return (
    <div className="bg-surface border border-b-mid rounded-[4px] p-6">
      <h2 className="font-display text-2xl font-bold text-t-primary mb-1">
        Where are you going?
      </h2>
      <p className="font-ui font-light text-sm text-t-secondary mb-5">
        Search or let AI suggest destinations for the group.
      </p>

      {/* ─── Section A: Add a suggestion ─── */}
      <div className="mb-6">
        {addState.mode === "idle" && (
          <div className="space-y-4">
            {/* Direct search */}
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-t-tertiary text-base pointer-events-none">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </span>
              <input
                type="text"
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
                placeholder="Search a destination..."
                className="w-full h-11 pl-10 pr-4 bg-elevated border border-b-mid rounded-[4px] font-ui text-sm text-t-primary placeholder:text-t-tertiary outline-none focus:border-amber transition-colors"
              />
            </div>
            <button
              onClick={handleSearch}
              disabled={!searchValue.trim()}
              className="h-11 px-5 rounded-[4px] border border-b-mid bg-transparent font-ui text-sm text-t-primary hover:bg-hover transition-all cursor-pointer whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Search
            </button>

            {/* AI suggest */}
            <div className="border-t border-b-subtle pt-4">
              <p className="font-ui text-xs text-t-tertiary uppercase tracking-wider mb-2">
                Or let AI suggest
              </p>
              <textarea
                value={aiPromptValue}
                onChange={(e) => setAiPromptValue(e.target.value)}
                placeholder="e.g. beach + nightlife, or quiet hills for families..."
                rows={2}
                className="w-full px-4 py-3 bg-elevated border border-b-mid rounded-[4px] font-ui text-sm text-t-primary placeholder:text-t-tertiary outline-none focus:border-amber transition-colors resize-none"
              />
              <button
                onClick={handleAiSuggest}
                className="mt-2 h-11 px-5 rounded-[4px] border border-b-mid bg-transparent font-ui text-sm text-t-primary hover:bg-hover transition-all cursor-pointer whitespace-nowrap"
              >
                Suggest →
              </button>
            </div>
          </div>
        )}

        {addState.mode === "loading" && (
          <LoadingShimmer text={addState.loadingText} />
        )}

        {addState.mode === "suggestions" && (
          <div className="space-y-4">
            <p className="font-ui text-sm text-t-secondary">
              Pick a destination to explore:
            </p>
            <div className="flex flex-wrap gap-3">
              {addState.suggestions.map((name) => (
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
              onClick={handleReset}
              className="font-ui text-sm text-t-tertiary hover:text-t-secondary cursor-pointer transition-colors"
            >
              ← Back to search
            </button>
          </div>
        )}

        {addState.mode === "error" && (
          <div className="space-y-4">
            <p className="font-ui text-sm text-terra">{addState.message}</p>
            <button
              onClick={handleReset}
              className="font-ui text-sm text-t-tertiary hover:text-t-secondary cursor-pointer transition-colors"
            >
              ← Back to search
            </button>
          </div>
        )}
      </div>

      {/* ─── Section B: Shared suggestions list ─── */}
      <div className="border-t border-b-subtle pt-6">
        {destinations.length === 0 ? (
          <p className="font-ui font-light text-sm text-t-tertiary text-center py-4">
            Suggest a destination above — it'll appear here for the group to vote on.
          </p>
        ) : (
          <div className="space-y-3">
            <p className="font-ui text-xs text-t-tertiary uppercase tracking-wider mb-3">
              {destinations.length} {destinations.length === 1 ? "suggestion" : "suggestions"}
            </p>
            {sortedDestinations.map((dest) => (
              <div
                key={dest.id}
                className={cn(
                  "transition-opacity",
                  trip.selected_destination_id &&
                    trip.selected_destination_id !== dest.id &&
                    "opacity-50"
                )}
              >
                <DestinationVoteCard
                  destination={dest}
                  currentMemberId={currentMemberId}
                  isOrganiser={isOrganiser}
                  isSelected={trip.selected_destination_id === dest.id}
                  isWinning={winningId === dest.id}
                  joinToken={joinToken}
                  groupSize={trip.group_size}
                  onVote={onVote}
                  onRemove={onRemove}
                  onSelect={onSelect}
                  onDeselect={onDeselect}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Inline deadline */}
      {deadline && !deadline.locked && (() => {
        const now = new Date(); now.setHours(0, 0, 0, 0);
        const days = Math.ceil((new Date(deadline.due_date).getTime() - now.getTime()) / 86400000);
        return (
          <p className={cn("font-ui text-xs mt-4", days <= 2 ? "text-terra" : "text-t-tertiary")}>
            {days <= 0
              ? "⚠ Deadline passed"
              : `Choose destination by ${new Date(deadline.due_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`}
          </p>
        );
      })()}
    </div>
  );
}

/* ─── Sub-components ─── */

function LoadingShimmer({ text }: { text: string }) {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-12 bg-surface rounded-[4px] overflow-hidden relative">
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[rgba(240,234,214,0.06)] to-transparent animate-shimmer" />
        </div>
      ))}
      <p className="font-ui font-light text-sm text-t-secondary">{text}</p>
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

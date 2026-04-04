import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useParams } from "react-router-dom";
import Header from "@/components/Header";
import MemberCirclesRow from "@/components/MemberCirclesRow";
import DeadlineSetterCollapsed from "@/components/DeadlineSetterCollapsed";
import DestinationSearchCard from "@/components/DestinationSearchCard";
import BudgetCard from "@/components/BudgetCard";
import AvailabilityCalendar from "@/components/AvailabilityCalendar";
import WhatDoYouWantToDoCard from "@/components/WhatDoYouWantToDoCard";
import AnythingElseCard from "@/components/AnythingElseCard";
import GroupInsightsPanel from "@/components/GroupInsightsPanel";
import TripSummaryCard from "@/components/TripSummaryCard";

import CollapsibleSection from "@/components/CollapsibleSection";
import { api, getTokens } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { toast } from "@/hooks/use-toast";

interface Member {
  id: string;
  display_name: string;
  is_organiser: boolean;
  has_confirmed: boolean;
  confirmed_at: string | null;
  joined_at: string;
}

interface Deadline {
  item_type: string;
  due_date: string;
  locked: boolean;
}

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

interface TripData {
  id: string;
  name: string;
  join_token: string;
  budget_min: number | null;
  budget_max: number | null;
  travel_from: string | null;
  travel_to: string | null;
  deadline: string | null;
  group_size: number;
  selected_destination_id: string | null;
  destination_summary: any | null;
  group_activity_notes?: string | null;
  group_anything_else?: string | null;
}

function formatCost(min: number | null, max: number | null): string {
  if (min === null || max === null) return "";
  return `₹${min.toLocaleString("en-IN")} – ₹${max.toLocaleString("en-IN")}`;
}

function formatDate(d: string | null): string {
  if (!d) return "";
  const date = new Date(d);
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function formatINR(val: number): string {
  return val.toLocaleString("en-IN");
}

const TripRoom = () => {
  const { id: joinToken } = useParams<{ id: string }>();
  const [trip, setTrip] = useState<TripData | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [budgetPrefs, setBudgetPrefs] = useState<any[]>([]);
  const [availSlots, setAvailSlots] = useState<any[]>([]);
  const [deadlines, setDeadlines] = useState<Deadline[]>([]);
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [budgetEstimate, setBudgetEstimate] = useState<any>(null);
  const [groupInsights, setGroupInsights] = useState<any>(null);
  const [travelWindows, setTravelWindows] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [justConfirmed, setJustConfirmed] = useState(false);

  // Section expand/collapse state
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const sectionsInitRef = useRef(false);

  const tokens = joinToken ? getTokens(joinToken) : null;
  const isOrganiser = !!tokens?.organiserToken;
  const currentMemberId = tokens?.memberId ?? null;

  const toggleSection = useCallback((key: string) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const fetchTrip = useCallback(async () => {
    if (!joinToken) return;
    try {
      const data = await api.get(`/api/trips/${joinToken}`);
      setTrip(data.trip);
      setMembers(data.members);
      setBudgetPrefs(data.budget_preferences ?? []);
      setAvailSlots(data.availability_slots ?? []);
      setDeadlines(data.deadlines ?? []);
      setDestinations(data.destinations ?? []);
      setBudgetEstimate(data.budget_estimate ?? null);
      setGroupInsights(data.group_insights ?? null);
      setTravelWindows(data.travel_windows ?? null);
      setError(null);
    } catch (err: any) {
      setError(err.message || "Trip not found");
    } finally {
      setLoading(false);
    }
  }, [joinToken]);

  useEffect(() => {
    fetchTrip();
  }, [fetchTrip]);

  // Initialize section open states once data loads
  useEffect(() => {
    if (sectionsInitRef.current || loading || !trip) return;
    sectionsInitRef.current = true;

    const myBudget = budgetPrefs.find(
      (p: any) => p.member_id === currentMemberId
    );
    const hasBudget = myBudget?.trip_budget_min != null;
    const hasAvail = availSlots.some(
      (s: any) => s.member_id === currentMemberId
    );

    const defaults: Record<string, boolean> = {};

    if (destinations.length === 0 || !trip.selected_destination_id) {
      defaults.destinations = true;
    } else if (!hasBudget) {
      defaults.budget = true;
    } else if (!hasAvail) {
      defaults.calendar = true;
    } else {
      defaults.preferences = true;
    }

    setOpenSections(defaults);
  }, [
    loading,
    trip,
    destinations,
    budgetPrefs,
    availSlots,
    currentMemberId,
  ]);

  // Stable ref to fetchTrip so Realtime callback doesn't cause re-subscriptions
  const fetchTripRef = useRef(fetchTrip);
  fetchTripRef.current = fetchTrip;

  // Supabase Realtime
  useEffect(() => {
    if (!supabase || !trip?.id) return;

    const refetch = () => fetchTripRef.current();

    const channel = supabase
      .channel(`triproom-${trip.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "destination_options",
          filter: `trip_id=eq.${trip.id}`,
        },
        refetch
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "destination_votes",
          filter: `trip_id=eq.${trip.id}`,
        },
        refetch
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "trip_members",
          filter: `trip_id=eq.${trip.id}`,
        },
        refetch
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "trips",
          filter: `id=eq.${trip.id}`,
        },
        refetch
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "budget_preferences",
          filter: `trip_id=eq.${trip.id}`,
        },
        refetch
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "availability_slots",
          filter: `trip_id=eq.${trip.id}`,
        },
        refetch
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "budget_estimates",
          filter: `trip_id=eq.${trip.id}`,
        },
        refetch
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "travel_windows",
          filter: `trip_id=eq.${trip.id}`,
        },
        refetch
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "group_insights",
          filter: `trip_id=eq.${trip.id}`,
        },
        refetch
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.error("Realtime subscription failed:", status);
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [trip?.id]);

  // Refetch on tab focus
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") fetchTrip();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibility);
  }, [fetchTrip]);

  const handleConfirm = async () => {
    if (!joinToken) return;
    try {
      await api.post(`/api/trips/${joinToken}/confirm`, {}, joinToken);
      setJustConfirmed(true);
      await fetchTrip();
    } catch (err: any) {
      toast({
        title: "Couldn't confirm you",
        description: err.message || "Check your connection and try again.",
        variant: "destructive",
      });
    }
  };

  const handleCopyInvite = async () => {
    const url = `${window.location.origin}/join/${joinToken}`;
    const text = `Link: ${url}\nCode: ${joinToken}`;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // ─── Destination handlers ───

  const handleVote = async (destId: string) => {
    if (!joinToken) return;

    setDestinations((prev) =>
      prev.map((d) => {
        if (d.id !== destId) return d;
        const alreadyVoted = currentMemberId
          ? d.voter_member_ids.includes(currentMemberId)
          : false;
        if (alreadyVoted) {
          return {
            ...d,
            votes: d.votes - 1,
            voter_member_ids: d.voter_member_ids.filter(
              (id) => id !== currentMemberId
            ),
          };
        }
        return {
          ...d,
          votes: d.votes + 1,
          voter_member_ids: currentMemberId
            ? [...d.voter_member_ids, currentMemberId]
            : d.voter_member_ids,
        };
      })
    );

    try {
      await api.post(
        `/api/trips/${joinToken}/destinations/${destId}/vote`,
        {},
        joinToken
      );
      await fetchTrip();
    } catch (err: any) {
      await fetchTrip();
      toast({
        title: "Couldn't register your vote",
        description: err.message || "Try again in a moment.",
        variant: "destructive",
      });
    }
  };

  const handleRemoveDestination = async (destId: string) => {
    if (!joinToken) return;
    try {
      await api.delete(
        `/api/trips/${joinToken}/destinations/${destId}`,
        joinToken
      );
      await fetchTrip();
      toast({ title: "Destination removed from the list" });
    } catch (err: any) {
      toast({
        title: "Couldn't remove destination",
        description: err.message || "Try again in a moment.",
        variant: "destructive",
      });
    }
  };

  const handleSelectDestination = async (destId: string) => {
    if (!joinToken) return;
    try {
      await api.patch(
        `/api/trips/${joinToken}`,
        { selected_destination_id: destId },
        joinToken
      );
      await fetchTrip();
      toast({ title: "Destination locked in — the group is going here" });
    } catch (err: any) {
      toast({
        title: "Couldn't lock in destination",
        description: err.message || "Try again in a moment.",
        variant: "destructive",
      });
    }
  };

  const handleDeselectDestination = async () => {
    if (!joinToken) return;
    try {
      await api.patch(
        `/api/trips/${joinToken}`,
        { selected_destination_id: null },
        joinToken
      );
      await fetchTrip();
      toast({ title: "Destination selection cleared — voting is back on" });
    } catch (err: any) {
      toast({
        title: "Couldn't clear the selection",
        description: err.message || "Try again in a moment.",
        variant: "destructive",
      });
    }
  };

  // ─── Section summaries ───

  const sectionSummaries = useMemo(() => {
    const submitted = budgetPrefs.filter(
      (p: any) => p.trip_budget_min != null && p.trip_budget_max != null
    );
    const avgMin =
      submitted.length >= 1
        ? Math.round(
            submitted.reduce((s: number, p: any) => s + p.trip_budget_min!, 0) /
              submitted.length /
              500
          ) * 500
        : null;
    const avgMax =
      submitted.length >= 1
        ? Math.round(
            submitted.reduce((s: number, p: any) => s + p.trip_budget_max!, 0) /
              submitted.length /
              500
          ) * 500
        : null;

    const availMemberCount = new Set(
      availSlots.map((s: any) => s.member_id)
    ).size;

    const selectedDest = trip?.selected_destination_id
      ? destinations.find((d) => d.id === trip.selected_destination_id)
      : null;

    const topDest =
      destinations.length > 0
        ? [...destinations].sort((a, b) => b.votes - a.votes)[0]
        : null;

    return {
      destinations: selectedDest
        ? `${selectedDest.name} locked in`
        : destinations.length > 0
        ? `${destinations.length} suggestion${destinations.length !== 1 ? "s" : ""}${topDest && topDest.votes > 0 ? `, ${topDest.name} leading` : ""}`
        : "Add your first suggestion",

      budget:
        avgMin !== null && avgMax !== null
          ? `${submitted.length} submitted · avg ₹${formatINR(avgMin)}–₹${formatINR(avgMax)}`
          : submitted.length > 0
          ? `${submitted.length} of ${members.length} submitted`
          : "Set your budget range",

      calendar:
        availMemberCount > 0
          ? `${availMemberCount} of ${members.length} submitted`
          : "Mark your free dates",

      preferences: (() => {
        const cats: Record<string, number> = {};
        for (const p of budgetPrefs) {
          for (const cat of p.activity_categories ?? []) {
            cats[cat] = (cats[cat] || 0) + 1;
          }
        }
        const topCats = Object.keys(cats).slice(0, 3);
        const hasNotes = !!(trip?.group_activity_notes || trip?.group_anything_else);
        const parts: string[] = [];
        if (topCats.length > 0) parts.push(topCats.join(", "));
        if (hasNotes) parts.push("notes added");
        return parts.length > 0 ? parts.join(" · ") : "Activities & notes";
      })(),

      insights: groupInsights?.vibe_summary
        ? groupInsights.vibe_summary.split(".")[0] + "."
        : "AI group analysis",
    };
  }, [trip, destinations, budgetPrefs, availSlots, members, groupInsights]);

  // Section completion (for green dot indicator on collapsed sections)
  const sectionComplete = useMemo(() => {
    const myBudget = budgetPrefs.find(
      (p: any) => p.member_id === currentMemberId
    );
    return {
      destinations: !!trip?.selected_destination_id,
      budget: myBudget?.trip_budget_min != null && myBudget?.trip_budget_max != null,
      calendar: availSlots.some((s: any) => s.member_id === currentMemberId),
      preferences: false, // open-ended, no clear "done"
      insights: !!groupInsights?.vibe_summary,
    };
  }, [trip, budgetPrefs, availSlots, currentMemberId, groupInsights]);

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen relative z-10">
        <Header />
        <div className="max-w-2xl mx-auto px-4 pt-24 space-y-6">
          <div className="space-y-3">
            <div className="h-9 w-3/4 bg-surface rounded-[4px] overflow-hidden relative">
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[rgba(240,234,214,0.06)] to-transparent animate-shimmer" />
            </div>
            <div className="h-4 w-1/2 bg-surface rounded-[4px] overflow-hidden relative">
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[rgba(240,234,214,0.06)] to-transparent animate-shimmer" />
            </div>
          </div>
          <div className="flex gap-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="w-10 h-10 rounded-full bg-surface overflow-hidden relative">
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[rgba(240,234,214,0.06)] to-transparent animate-shimmer" />
              </div>
            ))}
          </div>
          <div className="h-48 bg-surface rounded-[4px] overflow-hidden relative">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[rgba(240,234,214,0.06)] to-transparent animate-shimmer" />
          </div>
          <p className="font-ui text-sm text-t-tertiary animate-pulse">Setting up your trip room...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !trip) {
    return (
      <div className="min-h-screen relative z-10">
        <Header />
        <div className="max-w-2xl mx-auto px-4 pt-24">
          <h1 className="font-display text-[32px] font-bold text-t-primary mb-2">
            Trip not found
          </h1>
          <p className="font-ui text-t-secondary">{error}</p>
        </div>
      </div>
    );
  }

  // Derived state
  const myMember = members.find((m) => m.id === currentMemberId);
  const hasConfirmed = myMember?.has_confirmed || false;

  const myPrefs =
    budgetPrefs.find((p: any) => p.member_id === currentMemberId) ?? null;

  // Deadline lookups
  const destDeadline =
    deadlines.find((d) => d.item_type === "destination_vote") ?? null;
  const budgetDeadline =
    deadlines.find((d) => d.item_type === "budget_input") ?? null;
  const availDeadline =
    deadlines.find((d) => d.item_type === "availability") ?? null;

  // Header subtitle
  const headerParts: string[] = [];
  if (trip.budget_min !== null && trip.budget_max !== null) {
    headerParts.push(formatCost(trip.budget_min, trip.budget_max));
  }
  if (trip.travel_from && trip.travel_to) {
    headerParts.push(
      `${formatDate(trip.travel_from)}–${formatDate(trip.travel_to)}`
    );
  }
  headerParts.push(`${members.length} people`);

  // Whether insights should be visible at all
  const showInsights = budgetPrefs.length >= 2 || (budgetPrefs.length >= 1 && !!(trip?.group_activity_notes || trip?.group_anything_else));

  return (
    <div className="min-h-screen relative z-10">
      <Header />
      <div className="max-w-2xl mx-auto px-4 pt-24 pb-32">
        {/* ─── Zone 1: Trip identity (tight grouping) ─── */}
        <div className="mb-2">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between">
            <div>
              <h1 className="font-display text-[32px] md:text-[36px] font-bold leading-[1.05] text-t-primary">
                {trip.name}
              </h1>
              {headerParts.length > 0 && (
                <p className="font-mono text-[13px] text-t-secondary mt-1.5">
                  {headerParts.join("  ·  ")}
                </p>
              )}
            </div>
            <button
              onClick={handleCopyInvite}
              className="mt-4 md:mt-0 h-9 px-4 rounded-[4px] border border-b-mid font-ui text-sm text-t-secondary hover:bg-hover transition-all"
            >
              {copied ? "Copied!" : "Share invite"}
            </button>
          </div>
        </div>

        <div className="mb-6">
          <MemberCirclesRow
            members={members}
            groupSize={trip.group_size || members.length}
            currentMemberId={currentMemberId}
          />
        </div>

        {isOrganiser && (
          <div className="mb-6">
            <DeadlineSetterCollapsed
              joinToken={joinToken!}
              deadlines={deadlines}
              onUpdated={fetchTrip}
            />
          </div>
        )}

        {/* ─── Zone 3: Summary (always visible, compact) ─── */}
        <TripSummaryCard
          trip={trip}
          destinations={destinations}
          budgetPrefs={budgetPrefs}
          groupInsights={groupInsights}
          members={members}
        />

        {/* ─── Zone 4: Planning sections (collapsible, varied spacing) ─── */}
        <div className="space-y-3">
          {/* Destinations */}
          <CollapsibleSection
            title="Where are you going?"
            summary={sectionSummaries.destinations}
            isOpen={!!openSections.destinations}
            onToggle={() => toggleSection("destinations")}
            complete={sectionComplete.destinations}
          >
            <DestinationSearchCard
              joinToken={joinToken!}
              trip={trip}
              destinations={destinations}
              currentMemberId={currentMemberId}
              isOrganiser={isOrganiser}
              onTripUpdated={fetchTrip}
              onVote={handleVote}
              onRemove={handleRemoveDestination}
              onSelect={handleSelectDestination}
              onDeselect={handleDeselectDestination}
              deadline={destDeadline}
            />
          </CollapsibleSection>

          {/* Budget */}
          <CollapsibleSection
            title="What's your budget?"
            summary={sectionSummaries.budget}
            isOpen={!!openSections.budget}
            onToggle={() => toggleSection("budget")}
            complete={sectionComplete.budget}
          >
            <BudgetCard
              joinToken={joinToken!}
              budgetPrefs={budgetPrefs}
              members={members}
              currentMemberId={currentMemberId}
              onTripUpdated={fetchTrip}
              deadline={budgetDeadline}
              cachedAnalysis={budgetEstimate?.breakdown ?? null}
              trip={trip}
            />
          </CollapsibleSection>

          {/* Calendar */}
          <CollapsibleSection
            title="When can everyone go?"
            summary={sectionSummaries.calendar}
            isOpen={!!openSections.calendar}
            onToggle={() => toggleSection("calendar")}
            complete={sectionComplete.calendar}
          >
            <AvailabilityCalendar
              joinToken={joinToken!}
              trip={trip}
              members={members}
              availSlots={availSlots}
              currentMemberId={currentMemberId}
              isOrganiser={isOrganiser}
              onTripUpdated={fetchTrip}
              availabilityDeadline={availDeadline}
              travelWindows={travelWindows}
            />
          </CollapsibleSection>

          {/* Preferences (grouped: activities + notes) */}
          <CollapsibleSection
            title="Preferences"
            summary={sectionSummaries.preferences}
            isOpen={!!openSections.preferences}
            onToggle={() => toggleSection("preferences")}
          >
            <div className="space-y-3">
              <WhatDoYouWantToDoCard
                joinToken={joinToken!}
                trip={trip}
                existingPrefs={myPrefs}
                onRefresh={fetchTrip}
              />
              <AnythingElseCard
                joinToken={joinToken!}
                trip={trip}
                onRefresh={fetchTrip}
              />
            </div>
          </CollapsibleSection>

          {/* Group Insights */}
          {showInsights && (
            <CollapsibleSection
              title="Group insights"
              summary={sectionSummaries.insights}
              isOpen={!!openSections.insights}
              onToggle={() => toggleSection("insights")}
              complete={sectionComplete.insights}
            >
              <GroupInsightsPanel
                joinToken={joinToken!}
                groupInsights={groupInsights}
                prefsCount={budgetPrefs.length}
                onRefresh={fetchTrip}
              />
            </CollapsibleSection>
          )}
        </div>
      </div>

      {/* Sticky "I'm in" button */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-[var(--bg-base)]/90 backdrop-blur-sm border-t border-b-subtle z-20">
        <div className="max-w-2xl mx-auto">
          {!hasConfirmed ? (
            <button
              onClick={handleConfirm}
              className="w-full h-16 bg-amber text-t-primary font-display font-bold text-2xl rounded-[4px] tracking-tight hover:bg-amber-light active:scale-[0.98] transition-transform"
            >
              I'm in
            </button>
          ) : (
            <div
              className={`w-full h-16 flex items-center justify-center gap-3 border border-green rounded-[4px] ${
                justConfirmed ? "animate-confirm-celebrate" : ""
              }`}
            >
              <svg
                className={`text-green ${justConfirmed ? "animate-check-draw" : ""}`}
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path
                  d="M5 12l5 5L19 7"
                  className={justConfirmed ? "check-path" : ""}
                />
              </svg>
              <span className="font-display text-xl text-green">
                You're in
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TripRoom;

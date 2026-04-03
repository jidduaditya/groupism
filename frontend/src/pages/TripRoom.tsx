import { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import Header from "@/components/Header";
import MemberCirclesRow from "@/components/MemberCirclesRow";
import DeadlineSetterCollapsed from "@/components/DeadlineSetterCollapsed";
import DestinationSearchCard from "@/components/DestinationSearchCard";
import BudgetDropdowns from "@/components/BudgetDropdowns";
import AvailabilityCalendar from "@/components/AvailabilityCalendar";
import PersonalPreferencesCard from "@/components/PersonalPreferencesCard";
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

const TripRoom = () => {
  const { id: joinToken } = useParams<{ id: string }>();
  const [trip, setTrip] = useState<TripData | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [budgetPrefs, setBudgetPrefs] = useState<any[]>([]);
  const [availSlots, setAvailSlots] = useState<any[]>([]);
  const [deadlines, setDeadlines] = useState<Deadline[]>([]);
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const tokens = joinToken ? getTokens(joinToken) : null;
  const isOrganiser = !!tokens?.organiserToken;
  const currentMemberId = tokens?.memberId ?? null;

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

  // Supabase Realtime
  useEffect(() => {
    if (!supabase || !trip?.id) return;

    const channel = supabase
      .channel(`trip-${trip.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "destination_options", filter: `trip_id=eq.${trip.id}` },
        () => fetchTrip()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "destination_votes", filter: `trip_id=eq.${trip.id}` },
        () => fetchTrip()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "trip_members", filter: `trip_id=eq.${trip.id}` },
        () => fetchTrip()
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "trips", filter: `id=eq.${trip.id}` },
        () => fetchTrip()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "budget_preferences", filter: `trip_id=eq.${trip.id}` },
        () => fetchTrip()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "availability_slots", filter: `trip_id=eq.${trip.id}` },
        () => fetchTrip()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, trip?.id, fetchTrip]);

  // Refetch on tab focus
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") fetchTrip();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [fetchTrip]);

  const handleConfirm = async () => {
    if (!joinToken) return;
    try {
      await api.post(`/api/trips/${joinToken}/confirm`, {}, joinToken);
      await fetchTrip();
      toast({ title: "You're in!" });
    } catch (err: any) {
      toast({ title: "Confirm failed", description: err.message, variant: "destructive" });
    }
  };

  const handleCopyInvite = () => {
    const link = `${window.location.origin}/join/${joinToken}`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // ─── Destination handlers ───

  const handleVote = async (destId: string) => {
    if (!joinToken) return;

    // Optimistic update
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
            voter_member_ids: d.voter_member_ids.filter((id) => id !== currentMemberId),
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
      // Rollback — refetch
      await fetchTrip();
      toast({ title: "Vote failed", description: err.message, variant: "destructive" });
    }
  };

  const handleRemoveDestination = async (destId: string) => {
    if (!joinToken) return;
    try {
      await api.delete(`/api/trips/${joinToken}/destinations/${destId}`, joinToken);
      await fetchTrip();
      toast({ title: "Destination removed" });
    } catch (err: any) {
      toast({ title: "Remove failed", description: err.message, variant: "destructive" });
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
      toast({ title: "Destination locked in" });
    } catch (err: any) {
      toast({ title: "Selection failed", description: err.message, variant: "destructive" });
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
      toast({ title: "Selection cleared" });
    } catch (err: any) {
      toast({ title: "Failed to clear", description: err.message, variant: "destructive" });
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen relative z-10">
        <Header />
        <div className="max-w-2xl mx-auto px-6 pt-24">
          <p className="font-ui text-t-secondary">Loading trip...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !trip) {
    return (
      <div className="min-h-screen relative z-10">
        <Header />
        <div className="max-w-2xl mx-auto px-6 pt-24">
          <h1 className="font-display text-[32px] font-bold text-t-primary mb-2">Trip not found</h1>
          <p className="font-ui text-t-secondary">{error}</p>
        </div>
      </div>
    );
  }

  // Derived state
  const myMember = members.find((m) => m.id === currentMemberId);
  const hasConfirmed = myMember?.has_confirmed || false;

  const card2Enabled = trip.selected_destination_id !== null;
  const card3Enabled = trip.budget_min !== null;

  const myPrefs = budgetPrefs.find((p: any) => p.member_id === currentMemberId) ?? null;

  // Deadline lookups
  const destDeadline = deadlines.find((d) => d.item_type === "destination_vote") ?? null;
  const budgetDeadline = deadlines.find((d) => d.item_type === "budget_input") ?? null;
  const availDeadline = deadlines.find((d) => d.item_type === "availability") ?? null;

  // Header subtitle
  const headerParts: string[] = [];
  if (trip.budget_min !== null && trip.budget_max !== null) {
    headerParts.push(formatCost(trip.budget_min, trip.budget_max));
  }
  if (trip.travel_from && trip.travel_to) {
    headerParts.push(`${formatDate(trip.travel_from)}–${formatDate(trip.travel_to)}`);
  }
  headerParts.push(`${members.length} people`);

  return (
    <div className="min-h-screen relative z-10">
      <Header />
      <div className="max-w-2xl mx-auto px-6 pt-24 pb-32">
        {/* Trip header */}
        <div className="flex flex-col md:flex-row md:items-start md:justify-between mb-6">
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
            {copied ? "Copied!" : "Share link"}
          </button>
        </div>

        {/* Member circles */}
        <MemberCirclesRow
          members={members}
          groupSize={trip.group_size || members.length}
          currentMemberId={currentMemberId}
        />

        {/* Deadline setter — organiser only */}
        {isOrganiser && (
          <div className="mt-4">
            <DeadlineSetterCollapsed
              joinToken={joinToken!}
              deadlines={deadlines}
              onUpdated={fetchTrip}
            />
          </div>
        )}

        {/* Card 1 — Destination */}
        <div className="mt-8">
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
        </div>

        {/* Budget mismatch warning */}
        {trip.destination_summary?.cost_breakdown && trip.budget_max !== null &&
          trip.budget_max < trip.destination_summary.cost_breakdown.total_min && (
          <div className="mt-4 bg-[rgba(181,80,58,0.12)] border border-terra rounded-[4px] p-4">
            <p className="font-ui text-sm text-terra">
              ⚠ Your budget (₹{trip.budget_max.toLocaleString("en-IN")}) may be tight for{" "}
              {trip.destination_summary.name || "this destination"} (est. from ₹
              {trip.destination_summary.cost_breakdown.total_min.toLocaleString("en-IN")}). Consider
              adjusting your budget or choosing a different destination.
            </p>
          </div>
        )}

        {/* Card 2 — Budget */}
        <div className="mt-6">
          <BudgetDropdowns
            joinToken={joinToken!}
            trip={trip}
            isOrganiser={isOrganiser}
            onTripUpdated={fetchTrip}
            disabled={!card2Enabled}
            deadline={budgetDeadline}
          />
        </div>

        {/* Card 3 — Availability */}
        <div className="mt-6">
          <AvailabilityCalendar
            joinToken={joinToken!}
            trip={trip}
            members={members}
            availSlots={availSlots}
            currentMemberId={currentMemberId}
            isOrganiser={isOrganiser}
            onTripUpdated={fetchTrip}
            disabled={!card3Enabled}
            availabilityDeadline={availDeadline}
          />
        </div>

        {/* Card 4 — Personal Preferences */}
        <div className="mt-6">
          <PersonalPreferencesCard
            joinToken={joinToken!}
            existingPrefs={myPrefs}
            onRefresh={fetchTrip}
          />
        </div>
      </div>

      {/* Sticky "I'm in" button */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-[var(--bg-base)]/90 backdrop-blur-sm border-t border-b-subtle z-20">
        <div className="max-w-2xl mx-auto">
          {!hasConfirmed ? (
            <button
              onClick={handleConfirm}
              className="w-full h-16 bg-amber text-[#1c1a15] font-display font-bold text-2xl rounded-[4px] tracking-tight hover:bg-amber-light active:scale-[0.98] transition-transform"
            >
              I'm in
            </button>
          ) : (
            <div className="w-full h-16 flex items-center justify-center gap-3 border border-green rounded-[4px]">
              <span className="text-green font-mono text-lg">✓</span>
              <span className="font-display text-xl text-green">You're in</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TripRoom;

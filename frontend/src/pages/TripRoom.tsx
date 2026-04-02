import { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import Header from "@/components/Header";
import DestinationCard from "@/components/DestinationCard";
import ReadinessBar from "@/components/ReadinessBar";
import OrganiserSetupPanel from "@/components/OrganiserSetupPanel";
import TripRoomV2Sections from "@/components/v2/TripRoomV2Sections";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { api, getTokens } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { toast } from "@/hooks/use-toast";
import { useVersionToggle } from "@/hooks/useVersionToggle";

interface Member {
  id: string;
  display_name: string;
  is_organiser: boolean;
  has_confirmed: boolean;
  confirmed_at: string | null;
  joined_at: string;
}

interface Destination {
  id: string;
  name: string;
  tagline: string;
  votes: number;
  pros: string[];
  cons: string[];
  best_for: string;
  estimated_cost_min: number;
  estimated_cost_max: number;
  source: string;
  voter_member_ids?: string[];
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

function isWithin3Days(d: string): boolean {
  if (!d) return false;
  const deadline = new Date(d);
  const now = new Date();
  const diff = deadline.getTime() - now.getTime();
  return diff >= 0 && diff <= 3 * 24 * 60 * 60 * 1000;
}

function initials(name: string): string {
  return name.slice(0, 2).toUpperCase();
}

const TripRoom = () => {
  const { id: joinToken } = useParams<{ id: string }>();
  const [trip, setTrip] = useState<TripData | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [readiness, setReadiness] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [addingDest, setAddingDest] = useState(false);
  const [newDestName, setNewDestName] = useState("");

  // V2 state
  const [budgetPrefs, setBudgetPrefs] = useState<any[]>([]);
  const [budgetEstimate, setBudgetEstimate] = useState<any>(null);
  const [availSlots, setAvailSlots] = useState<any[]>([]);
  const [travelWindows, setTravelWindows] = useState<any>(null);
  const [deadlinesData, setDeadlinesData] = useState<any[]>([]);
  const [readinessV2, setReadinessV2] = useState(0);

  // Setup panel
  const [setupDismissed, setSetupDismissed] = useState(false);

  const [version, toggleVersion] = useVersionToggle();

  const tokens = joinToken ? getTokens(joinToken) : null;
  const isOrganiser = !!tokens?.organiserToken;
  const currentMemberId = tokens?.memberId ?? null;

  const fetchTrip = useCallback(async () => {
    if (!joinToken) return;
    try {
      const data = await api.get(`/api/trips/${joinToken}`);
      setTrip(data.trip);
      setMembers(data.members);
      setDestinations(data.destinations);
      setReadiness(data.readiness_score);
      // V2 fields
      setBudgetPrefs(data.budget_preferences ?? []);
      setBudgetEstimate(data.budget_estimate ?? null);
      setAvailSlots(data.availability_slots ?? []);
      setTravelWindows(data.travel_windows ?? null);
      setDeadlinesData(data.deadlines ?? []);
      setReadinessV2(data.readiness_v2 ?? 0);
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

  // Supabase Realtime — subscribe to vote, member, trip, and v2 table changes
  useEffect(() => {
    if (!supabase || !trip?.id) return;

    const channel = supabase
      .channel(`trip-${trip.id}`)
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
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "deadlines", filter: `trip_id=eq.${trip.id}` },
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

  const handleVote = async (destId: string) => {
    if (!joinToken) return;
    try {
      await api.post(`/api/trips/${joinToken}/destinations/${destId}/vote`, {}, joinToken);
      await fetchTrip();
    } catch (err: any) {
      toast({ title: "Vote failed", description: err.message, variant: "destructive" });
    }
  };

  const handleConfirm = async () => {
    if (!joinToken) return;
    try {
      await api.post(`/api/trips/${joinToken}/confirm`, {}, joinToken);
      await fetchTrip();
      toast({ title: "Confirmed" });
    } catch (err: any) {
      toast({ title: "Confirm failed", description: err.message, variant: "destructive" });
    }
  };

  const handleNudge = async () => {
    if (!joinToken) return;
    try {
      const res = await api.post(`/api/trips/${joinToken}/nudge`, {}, joinToken);
      toast({ title: "Nudge sent", description: res.message });
    } catch (err: any) {
      toast({ title: "Nudge failed", description: err.message, variant: "destructive" });
    }
  };

  const handleAddDestination = async () => {
    if (!joinToken || !newDestName.trim()) return;
    try {
      await api.post(`/api/trips/${joinToken}/destinations`, { name: newDestName.trim() }, joinToken);
      setNewDestName("");
      setAddingDest(false);
      await fetchTrip();
    } catch (err: any) {
      toast({ title: "Failed to add destination", description: err.message, variant: "destructive" });
    }
  };

  const handleCopyInvite = () => {
    const link = `${window.location.origin}/join/${joinToken}`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

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

  const unresponded = members.filter((m) => !m.has_confirmed).length;
  const maxVotes = destinations.length > 0 ? Math.max(...destinations.map((d) => d.votes)) : 0;

  // Build set of member IDs who have voted on any destination
  const votedMemberIds = new Set<string>();
  for (const d of destinations) {
    for (const mid of d.voter_member_ids || []) {
      votedMemberIds.add(mid);
    }
  }

  // Current user's member record and budget confirm state
  const myMember = members.find((m) => m.id === currentMemberId);
  const budgetConfirmed = myMember?.has_confirmed || false;

  // Map members for ReadinessBar with 3 states
  const readinessMembers = members.map((m) => ({
    name: m.display_name,
    status: m.has_confirmed
      ? ("confirmed" as const)
      : votedMemberIds.has(m.id)
        ? ("voted" as const)
        : ("none" as const),
  }));

  // Setup panel visibility
  const showSetupPanel = isOrganiser && !setupDismissed && (
    trip.budget_min === null || trip.travel_from === null || destinations.length === 0
  );

  // Non-organiser sees placeholder when trip is not yet set up
  const tripNotReady = trip.budget_min === null;

  // Header subtitle parts
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
      <div className="max-w-2xl mx-auto px-6 pt-24 pb-20">
        {/* Header — shared between v1 and v2 */}
        <div className="flex flex-col md:flex-row md:items-start md:justify-between mb-2">
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
          <div className="flex gap-3 mt-4 md:mt-0">
            {/* Version toggle */}
            <div className="flex h-9 rounded-[4px] border border-b-mid overflow-hidden">
              <button
                onClick={version === "v2" ? toggleVersion : undefined}
                className={cn(
                  "px-3 font-mono text-xs transition-all",
                  version === "v1"
                    ? "bg-amber text-[#1c1a15] font-medium"
                    : "bg-surface text-t-secondary hover:bg-hover"
                )}
              >
                v1
              </button>
              <button
                onClick={version === "v1" ? toggleVersion : undefined}
                className={cn(
                  "px-3 font-mono text-xs transition-all",
                  version === "v2"
                    ? "bg-amber text-[#1c1a15] font-medium"
                    : "bg-surface text-t-secondary hover:bg-hover"
                )}
              >
                v2
              </button>
            </div>
            <Button variant="outline-strong" size="sm" onClick={handleCopyInvite}>
              {copied ? "Copied!" : "Copy Link"}
            </Button>
          </div>
        </div>

        {/* Organiser setup panel */}
        {showSetupPanel && joinToken && (
          <div className="mt-10">
            <OrganiserSetupPanel
              joinToken={joinToken}
              trip={trip}
              onTripUpdated={fetchTrip}
              onComplete={() => setSetupDismissed(true)}
            />
          </div>
        )}

        {/* Non-organiser placeholder when trip isn't set up yet */}
        {!isOrganiser && tripNotReady && (
          <div className="mt-16 text-center">
            <p className="font-ui font-light text-t-secondary">
              The organiser is still setting up the trip.<br />
              Check back in a moment.
            </p>
          </div>
        )}

        {/* V1 sections — only when setup is complete (or non-organiser with trip ready) */}
        {version === "v1" && !showSetupPanel && !tripNotReady && (
          <>
            {/* Readiness */}
            <div className="section-divider mt-12">
              <span>Trip Readiness — <span className="font-mono text-amber">{readiness}%</span></span>
            </div>
            <ReadinessBar members={readinessMembers} />

            {/* Deadline */}
            {trip.deadline && (
              <p
                className={cn(
                  "mt-3 font-ui text-sm",
                  isWithin3Days(trip.deadline) ? "text-terra font-medium" : "text-t-secondary"
                )}
              >
                Confirm by {formatDate(trip.deadline)}
                {isWithin3Days(trip.deadline) && " — deadline approaching"}
              </p>
            )}

            {isOrganiser && unresponded > 0 && (
              <p className="mt-3 font-ui text-sm text-terra">
                {unresponded} people haven't confirmed yet.{" "}
                <button
                  className="underline hover:no-underline transition-all"
                  onClick={handleNudge}
                >
                  Nudge them →
                </button>
              </p>
            )}

            {/* Destinations */}
            <div className="section-divider mt-12">
              <span>Where are we going</span>
            </div>
            {destinations.length === 0 ? (
              <p className="font-ui text-sm text-t-tertiary py-4">No destinations yet. Add one or use AI suggestions.</p>
            ) : (
              <div className="divide-y divide-b-subtle">
                {destinations.map((d) => {
                  const hasVoted = currentMemberId
                    ? (d.voter_member_ids || []).includes(currentMemberId)
                    : false;
                  return (
                    <DestinationCard
                      key={d.id}
                      id={d.id}
                      name={d.name}
                      tagline={d.tagline || ""}
                      votes={d.votes}
                      pros={d.pros || []}
                      cons={d.cons || []}
                      bestFor={d.best_for || ""}
                      estCost={formatCost(d.estimated_cost_min, d.estimated_cost_max)}
                      hasVoted={hasVoted}
                      isWinning={d.votes === maxVotes && d.votes > 0}
                      onVote={() => handleVote(d.id)}
                    />
                  );
                })}
              </div>
            )}

            {isOrganiser && !addingDest && (
              <button
                className="mt-4 font-ui text-sm text-t-secondary hover:text-t-primary transition-colors"
                onClick={() => setAddingDest(true)}
              >
                + Add your own destination
              </button>
            )}

            {addingDest && (
              <div className="mt-4 flex gap-3">
                <input
                  type="text"
                  value={newDestName}
                  onChange={(e) => setNewDestName(e.target.value)}
                  placeholder="Destination name"
                  className="flex-1 h-11 px-3 bg-surface border border-b-mid rounded-[4px] text-t-primary font-ui text-sm focus:outline-none focus:border-t-secondary transition-colors"
                  onKeyDown={(e) => e.key === "Enter" && handleAddDestination()}
                />
                <Button variant="amber" size="sm" onClick={handleAddDestination} disabled={!newDestName.trim()}>
                  Add
                </Button>
                <Button variant="outline-strong" size="sm" onClick={() => setAddingDest(false)}>
                  Cancel
                </Button>
              </div>
            )}

            {/* Members */}
            <div className="section-divider mt-12">
              <span>Who's in</span>
            </div>
            <div className="flex flex-wrap gap-4">
              {members.map((member) => (
                <div key={member.id} className="flex flex-col items-center gap-1.5">
                  <div
                    className={cn(
                      "w-10 h-10 rounded-full flex items-center justify-center font-ui text-xs font-medium bg-elevated text-t-primary transition-all",
                      member.has_confirmed && "ring-2 ring-green",
                      !member.has_confirmed && "opacity-40"
                    )}
                  >
                    {initials(member.display_name)}
                  </div>
                  <span className="font-ui text-xs text-t-secondary">{member.display_name}</span>
                </div>
              ))}
            </div>

            {/* Budget */}
            {trip.budget_min !== null && trip.budget_max !== null && (
              <>
                <div className="section-divider mt-12">
                  <span>Budget</span>
                </div>
                <p className="font-display text-[28px] font-bold text-t-primary mb-4">
                  {formatCost(trip.budget_min, trip.budget_max)}
                </p>
                {budgetConfirmed ? (
                  <p className="font-ui text-sm text-green flex items-center gap-2">
                    <span>✓</span> You've confirmed the budget
                  </p>
                ) : (
                  <Button variant="outline-strong" onClick={handleConfirm}>
                    I'm okay with this budget
                  </Button>
                )}
              </>
            )}
          </>
        )}

        {/* V2 sections — only when setup is complete */}
        {version === "v2" && !showSetupPanel && !tripNotReady && joinToken && (
          <TripRoomV2Sections
            joinToken={joinToken}
            trip={trip}
            members={members}
            destinations={destinations}
            budgetPrefs={budgetPrefs}
            budgetEstimate={budgetEstimate}
            availSlots={availSlots}
            travelWindows={travelWindows}
            deadlines={deadlinesData}
            readinessV2={readinessV2}
            isOrganiser={isOrganiser}
            currentMemberId={currentMemberId}
            onRefresh={fetchTrip}
            onVote={handleVote}
            onConfirm={handleConfirm}
            onAddDestination={handleAddDestination}
            addingDest={addingDest}
            setAddingDest={setAddingDest}
            newDestName={newDestName}
            setNewDestName={setNewDestName}
            budgetConfirmed={budgetConfirmed}
          />
        )}
      </div>
    </div>
  );
};

export default TripRoom;

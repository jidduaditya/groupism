import DestinationCard from "@/components/DestinationCard";
import GroupReadinessPanel from "./GroupReadinessPanel";
import DeadlineManager from "./DeadlineManager";
import DeadlineCountdown from "./DeadlineCountdown";
import BudgetPreferenceForm from "./BudgetPreferenceForm";
import BudgetEstimateDisplay from "./BudgetEstimateDisplay";
import AvailabilityInput from "./AvailabilityInput";
import TravelWindowsDisplay from "./TravelWindowsDisplay";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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

interface Deadline {
  id: string;
  item_type: string;
  due_date: string;
  locked: boolean;
}

interface TripRoomV2SectionsProps {
  joinToken: string;
  trip: {
    id: string;
    travel_from: string;
    travel_to: string;
    budget_min: number;
    budget_max: number;
  };
  members: Member[];
  destinations: Destination[];
  budgetPrefs: Array<{ member_id: string; [key: string]: any }>;
  budgetEstimate: any;
  availSlots: Array<{ member_id: string; [key: string]: any }>;
  travelWindows: any;
  deadlines: Deadline[];
  readinessV2: number;
  isOrganiser: boolean;
  currentMemberId: string | null;
  onRefresh: () => void;
  onVote: (destId: string) => void;
  onConfirm: () => void;
  onAddDestination: () => void;
  addingDest: boolean;
  setAddingDest: (v: boolean) => void;
  newDestName: string;
  setNewDestName: (v: string) => void;
  budgetConfirmed: boolean;
}

function formatCost(min: number, max: number): string {
  return `₹${(min || 0).toLocaleString("en-IN")} – ₹${(max || 0).toLocaleString("en-IN")}`;
}

function initials(name: string): string {
  return name.slice(0, 2).toUpperCase();
}

const TripRoomV2Sections = ({
  joinToken,
  trip,
  members,
  destinations,
  budgetPrefs,
  budgetEstimate,
  availSlots,
  travelWindows,
  deadlines,
  readinessV2,
  isOrganiser,
  currentMemberId,
  onRefresh,
  onVote,
  onConfirm,
  onAddDestination,
  addingDest,
  setAddingDest,
  newDestName,
  setNewDestName,
  budgetConfirmed,
}: TripRoomV2SectionsProps) => {
  const maxVotes = destinations.length > 0 ? Math.max(...destinations.map((d) => d.votes)) : 0;
  const deadlineMap = Object.fromEntries(deadlines.map((d) => [d.item_type, d]));

  // Find winning destination for 100% banner
  const winningDest = destinations.length > 0
    ? destinations.reduce((a, b) => (a.votes > b.votes ? a : b))
    : null;
  const winningName = winningDest && winningDest.votes > 0 ? winningDest.name : undefined;

  // Check if current user already submitted budget prefs
  const hasSubmittedBudget = currentMemberId
    ? budgetPrefs.some((p) => p.member_id === currentMemberId)
    : false;

  // Check if current user already submitted availability
  const hasSubmittedAvail = currentMemberId
    ? availSlots.some((s) => s.member_id === currentMemberId)
    : false;

  return (
    <>
      {/* Group Readiness */}
      <div className="section-divider mt-12">
        <span>Group Readiness — <span className="font-mono text-amber">{readinessV2}%</span></span>
      </div>
      <GroupReadinessPanel
        members={members}
        destinations={destinations}
        budgetPrefs={budgetPrefs}
        availSlots={availSlots}
        deadlines={deadlines}
        readinessV2={readinessV2}
        currentMemberId={currentMemberId}
        winningDestination={winningName}
      />

      {/* Deadline Manager (organiser only) */}
      {isOrganiser && (
        <>
          <div className="section-divider mt-12">
            <span>Deadlines</span>
          </div>
          <DeadlineManager joinToken={joinToken} deadlines={deadlines} />
        </>
      )}

      {/* Destinations */}
      <div className="section-divider mt-12">
        <span>
          Where are we going
          {deadlineMap.destination_vote && (
            <span className="ml-3">
              <DeadlineCountdown deadline={deadlineMap.destination_vote} />
            </span>
          )}
        </span>
      </div>
      {destinations.length === 0 ? (
        <p className="font-ui text-sm text-t-tertiary py-4">No destinations yet.</p>
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
                onVote={() => onVote(d.id)}
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
            onKeyDown={(e) => e.key === "Enter" && onAddDestination()}
          />
          <Button variant="amber" size="sm" onClick={onAddDestination} disabled={!newDestName.trim()}>
            Add
          </Button>
          <Button variant="outline-strong" size="sm" onClick={() => setAddingDest(false)}>
            Cancel
          </Button>
        </div>
      )}

      {/* Availability */}
      <div className="section-divider mt-12">
        <span>
          Availability
          {deadlineMap.availability && (
            <span className="ml-3">
              <DeadlineCountdown deadline={deadlineMap.availability} />
            </span>
          )}
        </span>
      </div>
      {hasSubmittedAvail ? (
        <p className="font-ui text-sm text-green flex items-center gap-2 py-4">
          <span>✓</span> Your availability saved
        </p>
      ) : (
        <AvailabilityInput
          joinToken={joinToken}
          tripFrom={trip.travel_from}
          tripTo={trip.travel_to}
          onSubmitted={onRefresh}
        />
      )}

      <TravelWindowsDisplay
        windows={travelWindows}
        isOrganiser={isOrganiser}
        joinToken={joinToken}
        onRecalculate={onRefresh}
      />

      {/* Budget */}
      <div className="section-divider mt-12">
        <span>
          Budget
          {deadlineMap.budget_input && (
            <span className="ml-3">
              <DeadlineCountdown deadline={deadlineMap.budget_input} />
            </span>
          )}
        </span>
      </div>
      {hasSubmittedBudget ? (
        <p className="font-ui text-sm text-green flex items-center gap-2 py-2">
          <span>✓</span> Your preferences saved
        </p>
      ) : (
        <BudgetPreferenceForm joinToken={joinToken} onSubmitted={onRefresh} />
      )}

      <BudgetEstimateDisplay
        estimate={budgetEstimate}
        totalMembers={members.length}
        isOrganiser={isOrganiser}
        joinToken={joinToken}
        onRecalculate={onRefresh}
      />

      {/* Confirmation */}
      <div className="section-divider mt-12">
        <span>
          Confirm
          {deadlineMap.confirmation && (
            <span className="ml-3">
              <DeadlineCountdown deadline={deadlineMap.confirmation} />
            </span>
          )}
        </span>
      </div>
      {budgetConfirmed ? (
        <p className="font-ui text-sm text-green flex items-center gap-2 py-4">
          <span>✓</span> You've confirmed
        </p>
      ) : (
        <Button variant="outline-strong" onClick={onConfirm}>
          I'm in — confirm
        </Button>
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
    </>
  );
};

export default TripRoomV2Sections;

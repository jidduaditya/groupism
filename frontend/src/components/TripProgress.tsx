import { Fragment } from "react";
import { cn } from "@/lib/utils";

type PhaseStatus = "complete" | "active" | "upcoming";

interface Phase {
  label: string;
  status: PhaseStatus;
}

interface TripProgressProps {
  destinations: Array<{ id: string; votes: number }>;
  selectedDestinationId: string | null;
  budgetPrefs: Array<{ trip_budget_min?: number | null }>;
  availSlots: Array<{ member_id: string }>;
  members: Array<{ id: string; has_confirmed: boolean }>;
}

function computePhases({
  destinations,
  selectedDestinationId,
  budgetPrefs,
  availSlots,
  members,
}: TripProgressProps): Phase[] {
  const memberCount = members.length;
  const budgetCount = budgetPrefs.filter(
    (p) => p.trip_budget_min != null
  ).length;
  const availMemberCount = new Set(availSlots.map((s) => s.member_id)).size;
  const confirmedCount = members.filter((m) => m.has_confirmed).length;

  const destStatus: PhaseStatus = selectedDestinationId
    ? "complete"
    : destinations.length > 0
    ? "active"
    : "upcoming";

  const budgetStatus: PhaseStatus =
    budgetCount >= memberCount && memberCount > 0
      ? "complete"
      : budgetCount > 0
      ? "active"
      : "upcoming";

  const datesStatus: PhaseStatus =
    availMemberCount >= memberCount && memberCount > 0
      ? "complete"
      : availMemberCount > 0
      ? "active"
      : "upcoming";

  const confirmStatus: PhaseStatus =
    confirmedCount >= memberCount && memberCount > 0
      ? "complete"
      : confirmedCount > 0
      ? "active"
      : "upcoming";

  return [
    { label: "Where", status: destStatus },
    { label: "Budget", status: budgetStatus },
    { label: "When", status: datesStatus },
    { label: "Confirm", status: confirmStatus },
  ];
}

export default function TripProgress(props: TripProgressProps) {
  const phases = computePhases(props);

  return (
    <div className="flex items-center w-full">
      {phases.map((phase, i) => (
        <Fragment key={phase.label}>
          <div className="flex items-center gap-1.5">
            <div
              className={cn(
                "w-2 h-2 rounded-full flex-shrink-0",
                phase.status === "complete" && "bg-accent-green",
                phase.status === "active" && "bg-accent-amber",
                phase.status === "upcoming" &&
                  "border border-b-mid bg-transparent"
              )}
            />
            <span
              className={cn(
                "font-ui text-xs whitespace-nowrap",
                phase.status === "complete" && "text-accent-green",
                phase.status === "active" && "text-accent-amber font-medium",
                phase.status === "upcoming" && "text-t-tertiary"
              )}
            >
              {phase.label}
            </span>
          </div>
          {i < phases.length - 1 && (
            <div
              className={cn(
                "flex-1 h-px mx-2 min-w-[12px]",
                phase.status === "complete"
                  ? "bg-accent-green/30"
                  : "bg-[var(--border-subtle)]"
              )}
            />
          )}
        </Fragment>
      ))}
    </div>
  );
}

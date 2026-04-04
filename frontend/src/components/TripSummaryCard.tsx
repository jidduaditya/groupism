"use client";

interface TripSummaryCardProps {
  trip: {
    selected_destination_id: string | null;
    travel_from: string | null;
    travel_to: string | null;
    group_activity_notes?: string | null;
    group_anything_else?: string | null;
  };
  destinations: Array<{
    id: string;
    name: string;
    nights: number | null;
    estimated_cost_min: number | null;
    estimated_cost_max: number | null;
    votes: number;
  }>;
  budgetPrefs: Array<{
    trip_budget_min?: number | null;
    trip_budget_max?: number | null;
    activity_categories?: string[] | null;
  }>;
  groupInsights: {
    vibe_summary: string | null;
  } | null;
  members: Array<{ id: string }>;
}

const CATEGORY_LABELS: Record<string, string> = {
  chill: "Chill",
  shopping: "Shopping",
  experiences: "Experiences",
  exploration: "Exploration",
};

function formatBudget(val: number): string {
  return `\u20B9${val.toLocaleString("en-IN")}`;
}

export default function TripSummaryCard({
  trip,
  destinations,
  budgetPrefs,
  groupInsights,
}: TripSummaryCardProps) {
  // Destination section
  const selectedDest = trip.selected_destination_id
    ? destinations.find((d) => d.id === trip.selected_destination_id)
    : null;

  // Budget section
  const submitted = budgetPrefs.filter(
    (p) => p.trip_budget_min != null && p.trip_budget_max != null
  );
  const avgMin =
    submitted.length >= 1
      ? Math.round(
          submitted.reduce((s, p) => s + p.trip_budget_min!, 0) /
            submitted.length /
            500
        ) * 500
      : null;
  const avgMax =
    submitted.length >= 1
      ? Math.round(
          submitted.reduce((s, p) => s + p.trip_budget_max!, 0) /
            submitted.length /
            500
        ) * 500
      : null;

  // Activity categories — most popular
  const catCounts: Record<string, number> = {};
  for (const p of budgetPrefs) {
    for (const cat of p.activity_categories ?? []) {
      catCounts[cat] = (catCounts[cat] || 0) + 1;
    }
  }
  const topCats = Object.entries(catCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => k);

  // Vibe snippet
  const vibeSnippet = groupInsights?.vibe_summary
    ? groupInsights.vibe_summary.split(".")[0] + "."
    : null;

  // Group notes
  const rawNotes = [trip.group_activity_notes, trip.group_anything_else]
    .filter(Boolean)
    .join(" · ");
  const notesSnippet =
    rawNotes.length > 120 ? rawNotes.slice(0, 120) + "…" : rawNotes || null;

  // If nothing to show, don't render
  const hasDest = selectedDest || destinations.length > 0;
  const hasBudget = avgMin !== null;
  const hasActivities = topCats.length > 0 || !!vibeSnippet || !!notesSnippet;
  if (!hasDest && !hasBudget && !hasActivities) return null;

  return (
    <div className="bg-surface border border-b-mid rounded-[4px] p-6 mb-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Destination */}
        <div>
          <p className="font-ui text-xs text-t-tertiary uppercase tracking-wider mb-1">
            Destination
          </p>
          {selectedDest ? (
            <>
              <p className="font-display text-xl text-t-primary truncate">
                {selectedDest.name}
              </p>
              {selectedDest.nights && trip.travel_from && trip.travel_to && (
                <p className="font-mono text-xs text-t-tertiary mt-0.5">
                  {selectedDest.nights}N
                </p>
              )}
            </>
          ) : destinations.length > 0 ? (
            <>
              <p className="font-display text-base italic text-t-secondary truncate">
                {destinations.map((d) => d.name).join(", ")}
              </p>
              <p className="font-ui text-xs text-accent-amber mt-0.5">
                Voting in progress
              </p>
            </>
          ) : (
            <p className="font-ui text-xs text-t-tertiary">
              Suggest a place to go
            </p>
          )}
        </div>

        {/* Budget */}
        <div>
          <p className="font-ui text-xs text-t-tertiary uppercase tracking-wider mb-1">
            Budget
          </p>
          {avgMin !== null && avgMax !== null ? (
            <>
              <p className="font-mono text-lg text-t-primary leading-tight">
                {formatBudget(avgMin)} – {formatBudget(avgMax)} avg
              </p>
              <p className="font-ui text-xs text-t-tertiary mt-0.5">
                Based on {submitted.length}{" "}
                {submitted.length === 1 ? "person" : "people"}
              </p>
            </>
          ) : (
            <p className="font-mono text-sm text-t-tertiary">
              Waiting for budgets
            </p>
          )}
        </div>

        {/* What the group wants */}
        <div>
          <p className="font-ui text-xs text-t-tertiary uppercase tracking-wider mb-1">
            What the group wants
          </p>
          {topCats.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 mb-1">
              {topCats.map((cat) => (
                <span
                  key={cat}
                  className="inline-block px-2 py-0.5 rounded-full bg-elevated text-t-secondary font-ui text-xs"
                >
                  {CATEGORY_LABELS[cat] ?? cat}
                </span>
              ))}
            </div>
          ) : null}
          {notesSnippet && (
            <p className="font-ui text-xs text-t-secondary leading-relaxed italic">
              &ldquo;{notesSnippet}&rdquo;
            </p>
          )}
          {vibeSnippet ? (
            <p className="font-ui text-xs text-t-secondary leading-relaxed mt-1">
              {vibeSnippet}
            </p>
          ) : !notesSnippet && topCats.length === 0 ? (
            <p className="font-mono text-sm text-t-tertiary">—</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

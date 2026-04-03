"use client";

interface TripSummaryCardProps {
  trip: {
    selected_destination_id: string | null;
    travel_from: string | null;
    travel_to: string | null;
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
  members,
}: TripSummaryCardProps) {
  // Destination section
  const selectedDest = trip.selected_destination_id
    ? destinations.find((d) => d.id === trip.selected_destination_id)
    : null;

  const leadingDest =
    !selectedDest && destinations.length > 0
      ? [...destinations].sort((a, b) => b.votes - a.votes)[0]
      : null;

  const destName = selectedDest?.name ?? leadingDest?.name ?? null;
  const destNights = selectedDest?.nights ?? leadingDest?.nights ?? null;
  const destCostMin =
    selectedDest?.estimated_cost_min ?? leadingDest?.estimated_cost_min ?? null;
  const destCostMax =
    selectedDest?.estimated_cost_max ?? leadingDest?.estimated_cost_max ?? null;
  const destVotes = selectedDest?.votes ?? leadingDest?.votes ?? 0;

  // Budget section
  const submitted = budgetPrefs.filter(
    (p) => p.trip_budget_min != null && p.trip_budget_max != null
  );
  const avgMin =
    submitted.length >= 2
      ? Math.round(
          submitted.reduce((s, p) => s + p.trip_budget_min!, 0) /
            submitted.length /
            500
        ) * 500
      : null;
  const avgMax =
    submitted.length >= 2
      ? Math.round(
          submitted.reduce((s, p) => s + p.trip_budget_max!, 0) /
            submitted.length /
            500
        ) * 500
      : null;
  const fullMin =
    submitted.length > 0
      ? Math.min(...submitted.map((p) => p.trip_budget_min!))
      : null;
  const fullMax =
    submitted.length > 0
      ? Math.max(...submitted.map((p) => p.trip_budget_max!))
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

  // If nothing to show, don't render
  const hasDest = !!destName;
  const hasBudget = avgMin !== null;
  const hasActivities = topCats.length > 0 || !!vibeSnippet;
  if (!hasDest && !hasBudget && !hasActivities) return null;

  return (
    <div className="bg-surface border border-b-mid rounded-[8px] p-6 mb-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Destination */}
        <div>
          <p className="font-ui text-xs text-t-tertiary uppercase tracking-wider mb-1">
            Destination
          </p>
          {destName ? (
            <>
              <p className="font-display text-lg font-bold text-t-primary leading-tight">
                {destName}
                {!selectedDest && leadingDest && (
                  <span className="font-ui text-xs text-t-tertiary font-normal ml-1.5">
                    (leading)
                  </span>
                )}
              </p>
              <p className="font-mono text-xs text-t-secondary mt-0.5">
                {destNights ? `${destNights}N` : ""}
                {destCostMin && destCostMax
                  ? `${destNights ? " · " : ""}${formatBudget(destCostMin)}–${formatBudget(destCostMax)}`
                  : ""}
                {destVotes > 0
                  ? ` · ${destVotes} vote${destVotes > 1 ? "s" : ""}`
                  : ""}
              </p>
            </>
          ) : (
            <p className="font-mono text-sm text-t-tertiary">—</p>
          )}
        </div>

        {/* Budget */}
        <div>
          <p className="font-ui text-xs text-t-tertiary uppercase tracking-wider mb-1">
            Budget
          </p>
          {avgMin !== null && avgMax !== null ? (
            <>
              <p className="font-mono text-lg font-medium text-t-primary leading-tight">
                {formatBudget(avgMin)} – {formatBudget(avgMax)}
              </p>
              <p className="font-mono text-xs text-t-secondary mt-0.5">
                avg of {submitted.length}/{members.length}
                {fullMin !== null && fullMax !== null
                  ? ` · range ${formatBudget(fullMin)}–${formatBudget(fullMax)}`
                  : ""}
              </p>
            </>
          ) : (
            <p className="font-mono text-sm text-t-tertiary">
              {submitted.length > 0
                ? `${submitted.length} submitted`
                : "No budgets yet"}
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
          {vibeSnippet ? (
            <p className="font-ui text-xs text-t-secondary leading-relaxed">
              {vibeSnippet}
            </p>
          ) : topCats.length === 0 ? (
            <p className="font-mono text-sm text-t-tertiary">—</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

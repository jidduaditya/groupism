"use client";

interface CoupleReadinessStripProps {
  couples: Array<{
    id: string;
    couple_name: string | null;
    member_1: { id: string; display_name: string; has_confirmed: boolean } | null;
    member_2: { id: string; display_name: string; has_confirmed: boolean } | null;
  }>;
  destinations: Array<{ voter_member_ids: string[] }>;
  budgetPrefs: Array<{ member_id: string }>;
  availSlots: Array<{ member_id: string }>;
}

function memberIds(
  member_1: CoupleReadinessStripProps["couples"][number]["member_1"],
  member_2: CoupleReadinessStripProps["couples"][number]["member_2"]
): string[] {
  const ids: string[] = [];
  if (member_1) ids.push(member_1.id);
  if (member_2) ids.push(member_2.id);
  return ids;
}

function StatusCell({ done }: { done: boolean }) {
  return (
    <span
      className={`font-mono text-sm ${done ? "text-green" : "text-t-tertiary"}`}
    >
      {done ? "\u2713" : "\u2014"}
    </span>
  );
}

export default function CoupleReadinessStrip({
  couples,
  destinations,
  budgetPrefs,
  availSlots,
}: CoupleReadinessStripProps) {
  const budgetMemberIds = new Set(budgetPrefs.map((b) => b.member_id));
  const availMemberIds = new Set(availSlots.map((a) => a.member_id));

  function hasDestination(ids: string[]): boolean {
    return destinations.some((d) =>
      ids.some((id) => d.voter_member_ids.includes(id))
    );
  }

  function hasBudget(ids: string[]): boolean {
    return ids.some((id) => budgetMemberIds.has(id));
  }

  function hasAvail(ids: string[]): boolean {
    return ids.some((id) => availMemberIds.has(id));
  }

  function hasConfirmed(
    m1: CoupleReadinessStripProps["couples"][number]["member_1"],
    m2: CoupleReadinessStripProps["couples"][number]["member_2"]
  ): boolean {
    return (m1?.has_confirmed ?? false) || (m2?.has_confirmed ?? false);
  }

  return (
    <div className="bg-surface border border-b-subtle rounded-[4px] p-4">
      <h3 className="font-ui text-xs text-t-tertiary uppercase tracking-wider mb-3">
        Couple readiness
      </h3>

      <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-3 gap-y-1 items-center">
        {/* Column headers */}
        <span />
        <span className="font-mono text-[10px] text-t-tertiary text-center">
          Dest
        </span>
        <span className="font-mono text-[10px] text-t-tertiary text-center">
          Budget
        </span>
        <span className="font-mono text-[10px] text-t-tertiary text-center">
          Avail
        </span>
        <span className="font-mono text-[10px] text-t-tertiary text-center">
          In
        </span>

        {/* Couple rows */}
        {couples.map((couple) => {
          const ids = memberIds(couple.member_1, couple.member_2);
          const name =
            couple.couple_name ??
            [couple.member_1?.display_name, couple.member_2?.display_name]
              .filter(Boolean)
              .join(" & ");

          return (
            <div key={couple.id} className="contents">
              <span className="font-ui text-sm text-t-primary truncate">
                {name}
              </span>
              <span className="text-center">
                <StatusCell done={hasDestination(ids)} />
              </span>
              <span className="text-center">
                <StatusCell done={hasBudget(ids)} />
              </span>
              <span className="text-center">
                <StatusCell done={hasAvail(ids)} />
              </span>
              <span className="text-center">
                <StatusCell done={hasConfirmed(couple.member_1, couple.member_2)} />
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

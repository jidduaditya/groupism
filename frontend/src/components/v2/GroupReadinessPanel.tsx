import { cn } from "@/lib/utils";

interface Member {
  id: string;
  display_name: string;
  is_organiser: boolean;
  has_confirmed: boolean;
}

interface GroupReadinessPanelProps {
  members: Member[];
  destinations: Array<{ voter_member_ids?: string[] }>;
  budgetPrefs: Array<{ member_id: string }>;
  availSlots: Array<{ member_id: string }>;
  deadlines: Array<{ item_type: string; locked: boolean }>;
  readinessV2: number;
  currentMemberId: string | null;
  winningDestination?: string;
}

function readinessLabel(score: number): string {
  if (score >= 100) return "Trip confirmed";
  if (score >= 75) return "Almost there";
  if (score >= 50) return "Good momentum";
  if (score >= 25) return "Getting started";
  return "Waiting for the group";
}

const GroupReadinessPanel = ({
  members,
  destinations,
  budgetPrefs,
  availSlots,
  readinessV2,
  currentMemberId,
  winningDestination,
}: GroupReadinessPanelProps) => {
  // Build sets for quick lookup
  const votedIds = new Set<string>();
  for (const d of destinations) {
    for (const mid of d.voter_member_ids || []) {
      votedIds.add(mid);
    }
  }
  const budgetIds = new Set(budgetPrefs.map((p) => p.member_id));
  const availIds = new Set(availSlots.map((s) => s.member_id));

  const label = readinessLabel(readinessV2);
  const isComplete = readinessV2 >= 100;

  return (
    <div className="space-y-4">
      {/* Readiness bar */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-2 bg-elevated rounded-full overflow-hidden">
          <div
            className="h-full bg-amber rounded-full transition-all duration-500"
            style={{ width: `${Math.min(readinessV2, 100)}%` }}
          />
        </div>
        <span className="font-mono text-sm text-amber">{readinessV2}%</span>
      </div>

      <p className="font-ui text-sm text-t-secondary">{label}</p>

      {/* 100% banner */}
      {isComplete && (
        <div className="border-l-[3px] border-l-green pl-4 py-3">
          <p className="font-ui text-sm text-green font-medium">
            Trip confirmed.{winningDestination ? ` You're going to ${winningDestination}.` : ""}
          </p>
        </div>
      )}

      {/* Member grid */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <th className="text-left font-ui text-xs text-t-tertiary uppercase tracking-wider pb-2 pr-4">
                Member
              </th>
              <th className="text-center font-ui text-xs text-t-tertiary uppercase tracking-wider pb-2 px-2">
                Dest.
              </th>
              <th className="text-center font-ui text-xs text-t-tertiary uppercase tracking-wider pb-2 px-2">
                Avail.
              </th>
              <th className="text-center font-ui text-xs text-t-tertiary uppercase tracking-wider pb-2 px-2">
                Budget
              </th>
              <th className="text-center font-ui text-xs text-t-tertiary uppercase tracking-wider pb-2 pl-2">
                Conf.
              </th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => {
              const isMe = m.id === currentMemberId;
              return (
                <tr
                  key={m.id}
                  className={cn(isMe && "border-l-2 border-l-amber")}
                >
                  <td
                    className={cn(
                      "py-2 pr-4 font-ui text-sm",
                      isMe ? "text-t-primary pl-3" : "text-t-secondary"
                    )}
                  >
                    {m.display_name}
                  </td>
                  <StatusCell done={votedIds.has(m.id)} />
                  <StatusCell done={availIds.has(m.id)} />
                  <StatusCell done={budgetIds.has(m.id)} />
                  <StatusCell done={m.has_confirmed} />
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

function StatusCell({ done }: { done: boolean }) {
  return (
    <td className="text-center py-2 px-2">
      <span className={cn("font-mono text-sm", done ? "text-green" : "text-t-tertiary opacity-40")}>
        {done ? "✓" : "—"}
      </span>
    </td>
  );
}

export default GroupReadinessPanel;

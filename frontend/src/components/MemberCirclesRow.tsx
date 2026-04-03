"use client";

import { cn } from "@/lib/utils";

interface MemberCirclesRowProps {
  members: Array<{ id: string; display_name: string }>;
  groupSize: number;
  currentMemberId: string | null;
}

function getInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export default function MemberCirclesRow({
  members,
  groupSize,
  currentMemberId,
}: MemberCirclesRowProps) {
  const total =
    groupSize <= 0 || groupSize < members.length
      ? members.length
      : groupSize;
  const emptyCount = Math.max(0, total - members.length);

  return (
    <div>
      <div className="flex gap-2 flex-wrap">
        {members.map((m) => (
          <div key={m.id} className="flex flex-col items-center gap-1">
            <div
              className={cn(
                "w-10 h-10 rounded-full bg-elevated border border-[var(--border-mid)] flex items-center justify-center font-mono text-xs text-t-primary",
                m.id === currentMemberId && "ring-2 ring-amber"
              )}
              title={m.display_name}
            >
              {getInitials(m.display_name)}
            </div>
            <p className="font-ui text-[10px] text-t-tertiary truncate max-w-[40px] text-center">
              {m.display_name.split(" ")[0]}
            </p>
          </div>
        ))}

        {Array.from({ length: emptyCount }).map((_, i) => (
          <div
            key={`empty-${i}`}
            className="w-10 h-10 rounded-full border-2 border-dashed border-[var(--border-mid)] bg-transparent"
          />
        ))}
      </div>

      <p className="font-ui font-light text-xs text-t-secondary mt-3">
        {members.length} of {total} joined
      </p>
    </div>
  );
}

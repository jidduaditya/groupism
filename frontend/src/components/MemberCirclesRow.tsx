"use client";

import { cn } from "@/lib/utils";

interface MemberCirclesRowProps {
  members: Array<{ id: string; display_name: string }>;
  groupSize: number;
  currentMemberId: string | null;
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
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
  const emptyCount = total - members.length;

  return (
    <div>
      <div className="flex gap-2 flex-wrap">
        {members.map((m) => (
          <div
            key={m.id}
            className={cn(
              "w-10 h-10 rounded-full bg-elevated border border-[var(--border-mid)] flex items-center justify-center font-mono text-xs text-t-primary",
              m.id === currentMemberId && "ring-2 ring-amber"
            )}
            title={m.display_name}
          >
            {getInitials(m.display_name)}
          </div>
        ))}

        {Array.from({ length: emptyCount }).map((_, i) => (
          <div
            key={`empty-${i}`}
            className="w-10 h-10 rounded-full border border-dashed border-[var(--border-mid)] bg-transparent"
          />
        ))}
      </div>

      <p className="font-ui font-light text-xs text-t-secondary mt-2">
        {members.length} of {total} joined
      </p>
    </div>
  );
}

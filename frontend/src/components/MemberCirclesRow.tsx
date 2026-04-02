"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { getTokens } from "@/lib/api";

interface MemberCirclesRowProps {
  members: Array<{ id: string; display_name: string; couple_id?: string | null }>;
  groupSize: number;
  currentMemberId: string | null;
  couples?: Array<{
    id: string;
    couple_name: string | null;
    member_1: { id: string; display_name: string; has_confirmed: boolean } | null;
    member_2: { id: string; display_name: string; has_confirmed: boolean } | null;
  }>;
  joinToken?: string;
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

function MemberCircle({
  name,
  isCurrentUser,
}: {
  name: string;
  isCurrentUser: boolean;
}) {
  return (
    <div
      className={cn(
        "w-10 h-10 rounded-full bg-elevated border border-[var(--border-mid)] flex items-center justify-center font-mono text-xs text-t-primary",
        isCurrentUser && "ring-2 ring-amber"
      )}
      title={name}
    >
      {getInitials(name)}
    </div>
  );
}

function EmptyCircle() {
  return (
    <div className="w-10 h-10 rounded-full border border-dashed border-[var(--border-mid)] bg-transparent" />
  );
}

function CoupleGroup({
  couple,
  currentMemberId,
}: {
  couple: MemberCirclesRowProps["couples"] extends (infer T)[] | undefined ? NonNullable<T> : never;
  currentMemberId: string | null;
}) {
  const { member_1, member_2, couple_name } = couple;

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex -space-x-2">
        {member_1 && (
          <MemberCircle
            name={member_1.display_name}
            isCurrentUser={member_1.id === currentMemberId}
          />
        )}
        {member_2 && (
          <MemberCircle
            name={member_2.display_name}
            isCurrentUser={member_2.id === currentMemberId}
          />
        )}
      </div>
      {couple_name && (
        <span className="font-ui text-[10px] text-t-secondary max-w-[5rem] truncate">
          {couple_name}
        </span>
      )}
    </div>
  );
}

function PartnerTokenDisplay({ joinToken }: { joinToken: string }) {
  const [copied, setCopied] = useState(false);
  const tokens = getTokens(joinToken);
  const memberToken = tokens?.memberToken;

  if (!memberToken) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(memberToken);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard API may fail in some contexts
    }
  };

  return (
    <div className="mt-3">
      <p className="font-ui font-light text-xs text-t-secondary mb-1">
        Your partner link token
      </p>
      <div className="flex items-center gap-2">
        <code className="font-mono text-xs text-t-primary bg-elevated border border-[var(--border-mid)] rounded px-2 py-1 select-all">
          {memberToken}
        </code>
        <button
          type="button"
          onClick={handleCopy}
          className="font-ui text-xs text-t-secondary hover:text-t-primary transition-colors px-2 py-1 rounded border border-[var(--border-mid)] min-h-[44px] min-w-[44px] flex items-center justify-center"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}

export default function MemberCirclesRow({
  members,
  groupSize,
  currentMemberId,
  couples,
  joinToken,
}: MemberCirclesRowProps) {
  // V5 couple mode
  if (couples) {
    const coupleSlots = Math.ceil(groupSize / 2);

    const coupledMemberIds = new Set<string>();
    for (const c of couples) {
      if (c.member_1) coupledMemberIds.add(c.member_1.id);
      if (c.member_2) coupledMemberIds.add(c.member_2.id);
    }

    const unlinkedMembers = members.filter(
      (m) => !m.couple_id && !coupledMemberIds.has(m.id)
    );

    const emptyCount = Math.max(0, coupleSlots - couples.length - unlinkedMembers.length);

    return (
      <div>
        <div className="flex gap-3 flex-wrap">
          {couples.map((c) => (
            <CoupleGroup
              key={c.id}
              couple={c}
              currentMemberId={currentMemberId}
            />
          ))}

          {unlinkedMembers.map((m) => (
            <div key={m.id} className="flex flex-col items-center gap-1">
              <MemberCircle
                name={m.display_name}
                isCurrentUser={m.id === currentMemberId}
              />
            </div>
          ))}

          {Array.from({ length: emptyCount }).map((_, i) => (
            <div key={`empty-couple-${i}`} className="flex flex-col items-center gap-1">
              <div className="flex -space-x-2">
                <EmptyCircle />
                <EmptyCircle />
              </div>
            </div>
          ))}
        </div>

        <p className="font-ui font-light text-xs text-t-secondary mt-2">
          {couples.length} of {coupleSlots} couples joined
        </p>

        {joinToken && <PartnerTokenDisplay joinToken={joinToken} />}
      </div>
    );
  }

  // V4 mode (unchanged)
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

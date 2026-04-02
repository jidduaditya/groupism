"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { toast } from "@/hooks/use-toast";

interface DeadlineSetterCollapsedProps {
  joinToken: string;
  deadlines: Array<{ item_type: string; due_date: string; locked: boolean }>;
  onUpdated: () => void;
}

const ITEM_TYPES = [
  { item_type: "destination_vote", label: "Choose destination by" },
  { item_type: "budget_input", label: "Submit budget by" },
  { item_type: "availability", label: "Submit availability by" },
  { item_type: "confirmation", label: "Confirm trip by" },
] as const;

export default function DeadlineSetterCollapsed({
  joinToken,
  deadlines,
  onUpdated,
}: DeadlineSetterCollapsedProps) {
  const [collapsed, setCollapsed] = useState(true);

  const deadlineMap = new Map(
    deadlines.map((d) => [d.item_type, { due_date: d.due_date, locked: d.locked }])
  );

  const [localDates, setLocalDates] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const { item_type } of ITEM_TYPES) {
      initial[item_type] = deadlineMap.get(item_type)?.due_date ?? "";
    }
    return initial;
  });

  async function handleDateChange(itemType: string, value: string) {
    setLocalDates((prev) => ({ ...prev, [itemType]: value }));

    try {
      await api.post(
        `/api/trips/${joinToken}/deadlines`,
        { deadlines: [{ item_type: itemType, due_date: value }] },
        joinToken
      );
      toast({ title: "Deadline updated" });
      onUpdated();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to update deadline";
      toast({ title: "Error", description: message, variant: "destructive" });
    }
  }

  if (collapsed) {
    return (
      <span
        className="font-ui text-xs text-t-tertiary underline cursor-pointer"
        onClick={() => setCollapsed(false)}
      >
        + Set response deadlines
      </span>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <span
        className="font-ui text-xs text-t-tertiary underline cursor-pointer"
        onClick={() => setCollapsed(true)}
      >
        − Hide deadlines
      </span>

      {ITEM_TYPES.map(({ item_type, label }) => {
        const entry = deadlineMap.get(item_type);
        const isLocked = entry?.locked ?? false;

        return (
          <div key={item_type} className="flex items-center gap-2">
            <span className="font-ui text-xs text-t-secondary w-44 shrink-0">
              {label}
            </span>

            <input
              type="date"
              className="font-mono text-xs bg-surface border border-b-subtle rounded px-2 py-1 disabled:opacity-50"
              value={localDates[item_type] ?? ""}
              disabled={isLocked}
              onChange={(e) => handleDateChange(item_type, e.target.value)}
            />

            {isLocked && (
              <span className="font-ui text-xs text-terra">Locked</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { toast } from "@/hooks/use-toast";

interface Deadline {
  id: string;
  item_type: string;
  due_date: string;
  locked: boolean;
}

interface DeadlineManagerProps {
  joinToken: string;
  deadlines: Deadline[];
}

const ITEM_TYPE_LABELS: Record<string, string> = {
  destination_vote: "Destination voting",
  availability: "Availability input",
  budget_input: "Budget preferences",
  confirmation: "Final confirmation",
};

const ITEM_TYPES = ["destination_vote", "availability", "budget_input", "confirmation"];

const DeadlineManager = ({ joinToken, deadlines }: DeadlineManagerProps) => {
  const [dates, setDates] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const deadlineMap = Object.fromEntries(deadlines.map((d) => [d.item_type, d]));

  const handleSet = async (itemType: string) => {
    const date = dates[itemType];
    if (!date) return;

    setSaving(itemType);
    try {
      await api.post(
        `/api/trips/${joinToken}/deadlines`,
        { deadlines: [{ item_type: itemType, due_date: date }] },
        joinToken
      );
      toast({ title: "Deadline set" });
      // Clear the input — the parent will refetch
      setDates((prev) => ({ ...prev, [itemType]: "" }));
    } catch (err: any) {
      toast({ title: "Failed to set deadline", description: err.message, variant: "destructive" });
    } finally {
      setSaving(null);
    }
  };

  const handleClear = async (itemType: string) => {
    // Set to a far future date and immediately clear — or just set locked.
    // For now, re-set to allow organiser to update the date
    const dl = deadlineMap[itemType];
    if (!dl) return;

    // We'll set the date input so organiser can change it
    setDates((prev) => ({ ...prev, [itemType]: dl.due_date }));
  };

  return (
    <div className="py-4 space-y-3">
      {ITEM_TYPES.map((itemType) => {
        const dl = deadlineMap[itemType];
        const isLocked = dl?.locked;

        if (isLocked) {
          return (
            <div key={itemType} className="flex items-center justify-between py-2">
              <span className="font-ui text-sm text-t-secondary">
                {ITEM_TYPE_LABELS[itemType]}
              </span>
              <span className="font-mono text-xs text-terra">
                Locked — {dl.due_date}
              </span>
            </div>
          );
        }

        if (dl && !dates[itemType]) {
          return (
            <div key={itemType} className="flex items-center justify-between py-2">
              <span className="font-ui text-sm text-t-secondary">
                {ITEM_TYPE_LABELS[itemType]}
              </span>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-t-primary">{dl.due_date}</span>
                <button
                  onClick={() => handleClear(itemType)}
                  className="font-ui text-xs text-terra hover:underline"
                >
                  × Edit
                </button>
              </div>
            </div>
          );
        }

        return (
          <div key={itemType} className="flex items-center justify-between gap-3 py-2">
            <span className="font-ui text-sm text-t-secondary shrink-0">
              {ITEM_TYPE_LABELS[itemType]}
            </span>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={dates[itemType] || ""}
                onChange={(e) => setDates((prev) => ({ ...prev, [itemType]: e.target.value }))}
                className="h-9 px-2 bg-surface border border-b-mid rounded-[4px] text-t-primary font-mono text-xs focus:outline-none focus:border-t-secondary transition-colors"
              />
              <Button
                variant="outline-strong"
                size="sm"
                onClick={() => handleSet(itemType)}
                disabled={!dates[itemType] || saving === itemType}
              >
                {saving === itemType ? "..." : "Set"}
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default DeadlineManager;

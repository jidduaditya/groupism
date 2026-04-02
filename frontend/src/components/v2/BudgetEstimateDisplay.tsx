import { useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { toast } from "@/hooks/use-toast";

interface BudgetEstimateDisplayProps {
  estimate: {
    per_person_min: number;
    per_person_max: number;
    breakdown: Record<string, { min: number; max: number; note: string }>;
    divergence_flags: Array<{ issue: string; gap_description: string }>;
    members_included: number;
  } | null;
  totalMembers: number;
  isOrganiser: boolean;
  joinToken: string;
  onRecalculate: () => void;
}

function formatINR(n: number): string {
  return `₹${(n || 0).toLocaleString("en-IN")}`;
}

const BREAKDOWN_LABELS: Record<string, string> = {
  accommodation: "Accommodation",
  transport: "Transport",
  food: "Food",
  activities: "Activities",
};

const BudgetEstimateDisplay = ({
  estimate,
  totalMembers,
  isOrganiser,
  joinToken,
  onRecalculate,
}: BudgetEstimateDisplayProps) => {
  const [calculating, setCalculating] = useState(false);

  const handleRecalculate = async () => {
    setCalculating(true);
    try {
      await api.post(`/api/trips/${joinToken}/budget/estimate`, {}, joinToken);
      onRecalculate();
    } catch (err: any) {
      toast({ title: "Estimation failed", description: err.message, variant: "destructive" });
    } finally {
      setCalculating(false);
    }
  };

  if (!estimate) {
    return (
      <div className="py-4">
        <p className="font-ui text-sm text-t-tertiary">No budget estimate yet.</p>
        {isOrganiser && (
          <Button variant="outline-strong" size="sm" className="mt-3" onClick={handleRecalculate} disabled={calculating}>
            {calculating ? "Calculating..." : "Generate estimate"}
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="py-4 space-y-5">
      {/* Total */}
      <div>
        <p className="font-mono text-[28px] md:text-[36px] text-amber font-bold leading-tight">
          {formatINR(estimate.per_person_min)} – {formatINR(estimate.per_person_max)}
        </p>
        <p className="font-ui text-xs text-t-tertiary mt-1">
          per person · Based on {estimate.members_included} of {totalMembers} member preferences
        </p>
      </div>

      {/* Breakdown */}
      <div className="space-y-2">
        {Object.entries(estimate.breakdown || {}).map(([key, val]) => (
          <div key={key} className="flex items-baseline justify-between">
            <span className="font-ui text-sm text-t-secondary">
              {BREAKDOWN_LABELS[key] || key}
            </span>
            <div className="text-right">
              <span className="font-mono text-sm text-t-primary">
                {formatINR(val.min)} – {formatINR(val.max)}
              </span>
              {val.note && (
                <p className="font-ui text-xs text-t-tertiary mt-0.5">{val.note}</p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Divergence flags */}
      {estimate.divergence_flags && estimate.divergence_flags.length > 0 && (
        <div className="space-y-3">
          <p className="font-ui text-xs text-t-tertiary uppercase tracking-wider">Heads up</p>
          {estimate.divergence_flags.map((flag, i) => (
            <div key={i} className="border-l-2 border-l-terra pl-4 py-2">
              <p className="font-ui text-sm text-t-primary font-medium">{flag.issue}</p>
              <p className="font-mono text-xs text-t-secondary mt-1">{flag.gap_description}</p>
            </div>
          ))}
        </div>
      )}

      {/* Recalculate */}
      {isOrganiser && (
        <Button variant="outline-strong" size="sm" onClick={handleRecalculate} disabled={calculating}>
          {calculating ? "Recalculating..." : "Recalculate estimate"}
        </Button>
      )}
    </div>
  );
};

export default BudgetEstimateDisplay;

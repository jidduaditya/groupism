import { useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface TravelWindow {
  start_date: string;
  end_date: string;
  nights: number;
  full_availability_count: number;
  stretching_members: string[];
  unavailable_members: string[];
  summary: string;
  score: number;
}

interface TravelWindowsDisplayProps {
  windows: { windows: TravelWindow[] } | null;
  isOrganiser: boolean;
  joinToken: string;
  onRecalculate: () => void;
}

function formatDateRange(from: string, to: string): string {
  const f = new Date(from);
  const t = new Date(to);
  const fStr = f.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  const tStr = t.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  return `${fStr} – ${tStr}`;
}

const TravelWindowsDisplay = ({
  windows,
  isOrganiser,
  joinToken,
  onRecalculate,
}: TravelWindowsDisplayProps) => {
  const [calculating, setCalculating] = useState(false);

  const handleRecalculate = async () => {
    setCalculating(true);
    try {
      await api.post(`/api/trips/${joinToken}/availability/windows`, {}, joinToken);
      onRecalculate();
    } catch (err: any) {
      toast({ title: "Window calculation failed", description: err.message, variant: "destructive" });
    } finally {
      setCalculating(false);
    }
  };

  const windowList = windows?.windows || [];

  if (windowList.length === 0) {
    return (
      <div className="py-4">
        <p className="font-ui text-sm text-t-tertiary">No travel windows calculated yet.</p>
        {isOrganiser && (
          <Button variant="outline-strong" size="sm" className="mt-3" onClick={handleRecalculate} disabled={calculating}>
            {calculating ? "Calculating..." : "Find best windows"}
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="py-4 space-y-0 divide-y divide-b-subtle">
      {windowList.map((w, i) => {
        const hasUnavailable = w.unavailable_members.length > 0;
        const hasStretching = w.stretching_members.length > 0;

        return (
          <div key={i} className="py-5 first:pt-0">
            <p className="font-display text-xl font-bold text-t-primary">
              {formatDateRange(w.start_date, w.end_date)}
            </p>
            <p className="font-mono text-xs text-t-tertiary mt-1">
              {w.nights} nights · Score: {w.score}/100
            </p>
            <p
              className={cn(
                "font-ui text-sm mt-2",
                hasUnavailable
                  ? "text-terra"
                  : hasStretching
                  ? "text-amber"
                  : "text-green"
              )}
            >
              {w.summary}
            </p>
          </div>
        );
      })}

      {isOrganiser && (
        <div className="pt-5">
          <Button variant="outline-strong" size="sm" onClick={handleRecalculate} disabled={calculating}>
            {calculating ? "Recalculating..." : "Recalculate windows"}
          </Button>
        </div>
      )}
    </div>
  );
};

export default TravelWindowsDisplay;
